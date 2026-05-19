"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertRole } from "@/lib/auth/security";
import { syncAllowedOrganizationMembers } from "@/lib/auth/clerk-members";
import { awardModel } from "@/lib/awards/data";
import { getEffectiveCycleStage, getMemberPhaseAccess } from "@/lib/awards/phase";
import { getCycleProgress, type CycleProgress } from "@/lib/awards/progress";
import {
  calculateResults,
  createResultCertificationSnapshot,
  suggestFinalists,
  validateBallotSelections,
  validateCategorySetup,
  validateNomination,
} from "@/lib/awards/workflow.mjs";
import { sendVoteReceiptEmail } from "@/lib/email/resend";

const nominationSchema = z.object({
  categoryId: z.string().min(1),
  nomineeId: z.string().min(1),
  statement: z.string().min(20),
  supportingLink: z.string().url().optional().or(z.literal("")),
});

const ballotSchema = z.object({
  cycleId: z.string().min(1),
  selections: z.record(z.string(), z.string()),
});

const memberSchema = z.object({
  chapter: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(2),
  photoUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["active", "inactive"]),
});

const categorySetupSchema = z.object({
  active: z.boolean().default(true),
  categoryId: z.string().optional(),
  description: z.string().min(1),
  finalistLimit: z.coerce.number().int().min(1).max(20),
  nominationLimit: z.coerce.number().int().min(1).max(10),
  nominationQuestion: z.string().min(1),
  title: z.string().min(1),
});

const cycleStageSchema = z.object({
  cycleId: z.string().min(1),
  stage: z.enum(["draft", "nominations", "review", "voting", "certification", "published"]),
});

const cycleScheduleSchema = z.object({
  cycleId: z.string().min(1),
  nominationsCloseAt: z.string().min(1),
  nominationsOpenAt: z.string().min(1),
  publishAt: z.string().min(1),
  title: z.string().min(2),
  votingCloseAt: z.string().min(1),
  votingOpenAt: z.string().min(1),
});

type CycleTiming = {
  nominationsCloseAt: Date | null;
  nominationsOpenAt: Date | null;
  publishedAt: Date | null;
  stage: string;
  votingCloseAt: Date | null;
  votingOpenAt: Date | null;
};

type CategoryRow = typeof schema.categories.$inferSelect;
type CurrentAdminUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
type ValidatedCategorySetup = {
  active: boolean;
  description: string;
  finalistLimit: number;
  nominationLimit: number;
  nominationQuestion: string;
  title: string;
};

function revalidateAwardPages() {
  revalidatePath("/");
  revalidatePath("/member");
  revalidatePath("/admin");
}

function parseScheduleDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDemoEffectiveStage() {
  const progress = getCycleProgress({
    categories: awardModel.categories,
    finalists: awardModel.finalists,
    members: awardModel.members,
    nominations: awardModel.nominations,
    voteReceipts: [],
  });

  return getEffectiveCycleStage({
    activeCategoryCount: progress.activeCategoryCount,
    approvedCategoryCount: progress.approvedCategoryCount,
    approvedFinalistCount: progress.approvedFinalistCount,
    configuredStage: awardModel.cycle.stage,
    eligibleMemberCount: progress.eligibleMemberCount,
    nominationCompletionCount: progress.nominationCompletionCount,
    publishedAt: awardModel.cycle.publishedAt,
    voteReceiptCount: progress.voteReceiptCount,
  });
}

function getCycleEffectiveStage(cycle: CycleTiming, progress: CycleProgress) {
  return getEffectiveCycleStage({
    activeCategoryCount: progress.activeCategoryCount,
    approvedCategoryCount: progress.approvedCategoryCount,
    approvedFinalistCount: progress.approvedFinalistCount,
    configuredStage: cycle.stage,
    eligibleMemberCount: progress.eligibleMemberCount,
    nominationCompletionCount: progress.nominationCompletionCount,
    publishedAt: cycle.publishedAt,
    voteReceiptCount: progress.voteReceiptCount,
  });
}

async function getLatestCycle() {
  const [cycle] = await getDb()
    .select()
    .from(schema.awardCycles)
    .orderBy(desc(schema.awardCycles.createdAt))
    .limit(1);

  return cycle ?? null;
}

async function getCycleCompletionProgress(cycleId: string) {
  const db = getDb();
  const [members, categories, nominations, voteReceipts] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.status, "active")),
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycleId)),
    db.select().from(schema.nominations).where(eq(schema.nominations.cycleId, cycleId)),
    db.select().from(schema.voteReceipts).where(eq(schema.voteReceipts.cycleId, cycleId)),
  ]);
  const categoryIds = categories.map((category) => category.id);
  const [finalists, certifications] = categoryIds.length
    ? await Promise.all([
        db
          .select()
          .from(schema.finalists)
          .where(inArray(schema.finalists.categoryId, categoryIds)),
        db
          .select()
          .from(schema.resultCertifications)
          .where(inArray(schema.resultCertifications.categoryId, categoryIds)),
      ])
    : [[], []];

  return getCycleProgress({
    categories,
    certifications,
    finalists,
    members,
    nominations,
    voteReceipts,
  });
}

async function certifyCategoryResult(category: CategoryRow, user: CurrentAdminUser) {
  const db = getDb();
  const [finalists, votes] = await Promise.all([
    db
      .select()
      .from(schema.finalists)
      .where(
        and(
          eq(schema.finalists.categoryId, category.id),
          eq(schema.finalists.status, "approved"),
        ),
      ),
    db
      .select()
      .from(schema.anonymousVotes)
      .where(eq(schema.anonymousVotes.categoryId, category.id)),
  ]);
  const result = calculateResults({
    category,
    finalists: finalists.map((finalist) => ({
      categoryId: finalist.categoryId,
      displayName: finalist.displayName,
      id: finalist.id,
      nomineeId: finalist.nomineeId,
    })),
    votes,
  });
  const certification = createResultCertificationSnapshot({ category, result });
  const certificationStatus = certification.status as "certified" | "pending" | "tie";

  await db
    .delete(schema.resultCertifications)
    .where(eq(schema.resultCertifications.categoryId, category.id));

  await db.insert(schema.resultCertifications).values({
    categoryId: category.id,
    certifiedAt: new Date(),
    status: certificationStatus,
    tallySnapshot: certification.tallySnapshot,
    winnerFinalistId: certification.winnerFinalistId,
  });

  await db.insert(schema.auditEvents).values({
    action: "certify_results",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: category.id,
    summary: `Certified results for ${category.title}.`,
    metadata: {
      status: certification.status,
      winnerFinalistId: certification.winnerFinalistId,
    },
  });

  return certification;
}

export async function createNominationAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  const parsed = nominationSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the nomination fields." };
  if (parsed.data.nomineeId === user.member.id) {
    return { ok: false, error: "Self-nominations are not allowed." };
  }

  if (!hasDatabaseUrl()) {
    if (!getMemberPhaseAccess(getDemoEffectiveStage()).canNominate) {
      return { ok: false, error: "Nominations are not open." };
    }

    return { ok: true, demo: true };
  }

  const db = getDb();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, parsed.data.categoryId))
    .limit(1);

  if (!category) return { ok: false, error: "Category not found." };

  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, category.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Nominations are not open." };

  const progress = await getCycleCompletionProgress(cycle.id);
  if (!getMemberPhaseAccess(getCycleEffectiveStage(cycle, progress)).canNominate) {
    return { ok: false, error: "Nominations are not open." };
  }

  const [members, existingNominations] = await Promise.all([
    db.select().from(schema.members),
    db.select().from(schema.nominations).where(eq(schema.nominations.categoryId, category.id)),
  ]);
  const nominationValidation = validateNomination({
    category,
    existingNominations,
    members,
    nomineeId: parsed.data.nomineeId,
    nominatorId: user.member.id,
  });

  if (!nominationValidation.ok) {
    return {
      ok: false,
      error:
        nominationValidation.reason === "CATEGORY_NOMINATION_LIMIT_REACHED"
          ? "You already nominated in this category."
          : nominationValidation.reason === "NOMINEE_NOT_ACTIVE_MEMBER"
            ? "Choose an active member."
            : "Unable to save this nomination.",
    };
  }

  await db.insert(schema.nominations).values({
    categoryId: parsed.data.categoryId,
    cycleId: category.cycleId,
    nomineeId: parsed.data.nomineeId,
    nominatorId: user.member.id,
    statement: parsed.data.statement,
    supportingLink: parsed.data.supportingLink || null,
  });

  revalidateAwardPages();

  return { ok: true };
}

export async function submitBallotAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  const parsed = ballotSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Select one finalist per category." };

  const confirmationCode = `OP-${nanoid(10).toUpperCase()}`;

  if (!hasDatabaseUrl()) {
    if (!getMemberPhaseAccess(getDemoEffectiveStage()).canVote) {
      return { ok: false, error: "Voting is not open." };
    }

    return { ok: true, demo: true, confirmationCode };
  }

  const db = getDb();
  const categoryIds = Object.keys(parsed.data.selections);
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, parsed.data.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Voting is not open." };
  if (categoryIds.length === 0) return { ok: false, error: "Select one finalist per category." };

  const [cycleCategories, finalists, progress] = await Promise.all([
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycle.id)),
    db.select().from(schema.finalists),
    getCycleCompletionProgress(cycle.id),
  ]);
  const cycleCategoryIds = new Set(cycleCategories.map((category) => category.id));
  const approvedFinalists = finalists.filter(
    (finalist) => finalist.status === "approved" && cycleCategoryIds.has(finalist.categoryId),
  );

  if (!getMemberPhaseAccess(getCycleEffectiveStage(cycle, progress)).canVote) {
    return { ok: false, error: "Voting is not open." };
  }

  const ballotValidation = validateBallotSelections({
    categories: cycleCategories,
    finalists: approvedFinalists,
    selections: parsed.data.selections,
  });

  if (!ballotValidation.ok) {
    return { ok: false, error: "Select one approved finalist per category." };
  }

  try {
    await db.insert(schema.voteReceipts).values({
      categoryIds: ballotValidation.categoryIds,
      confirmationCode,
      cycleId: parsed.data.cycleId,
      memberId: user.member.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("vote_receipts_cycle_member_unique")) {
      return { ok: false, error: "You already submitted this ballot." };
    }

    throw error;
  }

  await db.insert(schema.anonymousVotes).values(
    Object.entries(parsed.data.selections).map(([categoryId, finalistId]) => ({
      categoryId,
      cycleId: parsed.data.cycleId,
      finalistId,
    })),
  );

  await sendVoteReceiptEmail({
    confirmationCode,
    email: user.member.email,
  });

  revalidateAwardPages();

  return { ok: true, confirmationCode };
}

export async function upsertCategoryAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = categorySetupSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the category fields." };

  const validated = validateCategorySetup(parsed.data);
  if (!validated.ok) return { ok: false, error: "Check the category fields." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const cycle = await getLatestCycle();
  if (!cycle) return { ok: false, error: "Create an award cycle first." };

  const category = validated.category as ValidatedCategorySetup;
  const categoryId = parsed.data.categoryId?.trim();
  const db = getDb();

  if (categoryId) {
    await db
      .update(schema.categories)
      .set({
        active: category.active,
        description: category.description,
        finalistLimit: category.finalistLimit,
        nominationLimit: category.nominationLimit,
        nominationQuestion: category.nominationQuestion,
        title: category.title,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.cycleId, cycle.id)));
  } else {
    await db.insert(schema.categories).values({
      active: category.active,
      cycleId: cycle.id,
      description: category.description,
      finalistLimit: category.finalistLimit,
      nominationLimit: category.nominationLimit,
      nominationQuestion: category.nominationQuestion,
      title: category.title,
    });
  }

  await db.insert(schema.auditEvents).values({
    action: categoryId ? "update_category" : "create_category",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: category.title,
    summary: `Admin ${categoryId ? "updated" : "created"} award category.`,
  });

  revalidateAwardPages();

  return { ok: true };
}

export async function approveFinalistsAction(categoryId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true, count: 0 };

  const db = getDb();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .limit(1);

  if (!category) return { ok: false, error: "Category not found." };

  const progress = await getCycleCompletionProgress(category.cycleId);
  if (progress.nominationCompletionCount < progress.eligibleMemberCount) {
    return { ok: false, error: "Wait until every eligible member completes nominations." };
  }

  const [members, nominations] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.status, "active")),
    db.select().from(schema.nominations).where(eq(schema.nominations.categoryId, category.id)),
  ]);
  const existingVotes = await db
    .select({ id: schema.anonymousVotes.id })
    .from(schema.anonymousVotes)
    .where(eq(schema.anonymousVotes.categoryId, category.id))
    .limit(1);

  if (existingVotes.length > 0) {
    return { ok: false, error: "Finalists cannot change after voting starts." };
  }

  const suggestions = suggestFinalists({
    category,
    members,
    nominations,
  });

  if (suggestions.length === 0) {
    return { ok: false, error: "No nominations yet for this category." };
  }

  await db
    .update(schema.finalists)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(schema.finalists.categoryId, category.id));

  for (const suggestion of suggestions) {
    const [existing] = await db
      .select()
      .from(schema.finalists)
      .where(
        and(
          eq(schema.finalists.categoryId, category.id),
          eq(schema.finalists.nomineeId, suggestion.nomineeId),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(schema.finalists)
        .set({
          approvedAt: new Date(),
          displayName: suggestion.displayName,
          nominationCount: suggestion.nominationCount,
          status: "approved",
          summary: `${suggestion.nominationCount} nomination${
            suggestion.nominationCount === 1 ? "" : "s"
          } received.`,
          updatedAt: new Date(),
        })
        .where(eq(schema.finalists.id, existing.id));
    } else {
      await db.insert(schema.finalists).values({
        approvedAt: new Date(),
        categoryId: category.id,
        displayName: suggestion.displayName,
        nominationCount: suggestion.nominationCount,
        nomineeId: suggestion.nomineeId,
        status: "approved",
        summary: `${suggestion.nominationCount} nomination${
          suggestion.nominationCount === 1 ? "" : "s"
        } received.`,
      });
    }
  }

  await db.insert(schema.auditEvents).values({
    action: "approve_finalists",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: category.title,
    summary: `Approved ${suggestions.length} finalists.`,
    metadata: { finalists: suggestions.length },
  });

  revalidateAwardPages();

  return { ok: true, count: suggestions.length };
}

export async function upsertMemberAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = memberSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the member fields." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  await getDb().insert(schema.members).values({
    chapter: parsed.data.chapter,
    email: parsed.data.email.toLowerCase(),
    name: parsed.data.name,
    photoUrl: parsed.data.photoUrl || null,
    status: parsed.data.status,
  });

  return { ok: true };
}

export async function syncClerkRosterAction() {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true, count: 0 };

  const members = await syncAllowedOrganizationMembers();

  revalidateAwardPages();

  return { ok: true, count: members.length };
}

export async function updateCycleStageAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = cycleStageSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Choose a valid cycle stage." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  await getDb()
    .update(schema.awardCycles)
    .set({ stage: parsed.data.stage, updatedAt: new Date() })
    .where(eq(schema.awardCycles.id, parsed.data.cycleId));

  revalidateAwardPages();

  return { ok: true };
}

export async function updateCycleScheduleAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = cycleScheduleSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the schedule fields." };

  const nominationsOpenAt = parseScheduleDate(parsed.data.nominationsOpenAt);
  const nominationsCloseAt = parseScheduleDate(parsed.data.nominationsCloseAt);
  const votingOpenAt = parseScheduleDate(parsed.data.votingOpenAt);
  const votingCloseAt = parseScheduleDate(parsed.data.votingCloseAt);
  const publishAt = parseScheduleDate(parsed.data.publishAt);

  if (!nominationsOpenAt || !nominationsCloseAt || !votingOpenAt || !votingCloseAt || !publishAt) {
    return { ok: false, error: "Check the schedule dates." };
  }

  if (
    nominationsOpenAt >= nominationsCloseAt ||
    nominationsCloseAt >= votingOpenAt ||
    votingOpenAt >= votingCloseAt ||
    votingCloseAt >= publishAt
  ) {
    return { ok: false, error: "Use the order: nominations, review, voting, results." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  await getDb()
    .update(schema.awardCycles)
    .set({
      nominationsCloseAt,
      nominationsOpenAt,
      publishAt,
      title: parsed.data.title.trim(),
      updatedAt: new Date(),
      votingCloseAt,
      votingOpenAt,
    })
    .where(eq(schema.awardCycles.id, parsed.data.cycleId));

  await getDb().insert(schema.auditEvents).values({
    action: "update_schedule",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: parsed.data.cycleId,
    summary: "Admin updated the awards schedule.",
  });

  revalidateAwardPages();

  return { ok: true };
}

export async function createRunoffAction(categoryId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  await getDb().insert(schema.auditEvents).values({
    action: "create_runoff",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: categoryId,
    summary: "Admin created a runoff category for a tied result.",
  });

  return { ok: true };
}

export async function certifyResultsAction(categoryId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const db = getDb();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .limit(1);

  if (!category) return { ok: false, error: "Category not found." };

  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, category.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Cycle not found." };

  const progress = await getCycleCompletionProgress(cycle.id);
  const effectiveStage = getCycleEffectiveStage(cycle, progress);

  if (effectiveStage !== "Certification" && effectiveStage !== "Published") {
    return { ok: false, error: "Certify results after every eligible member votes." };
  }

  await certifyCategoryResult(category, user);

  revalidateAwardPages();

  return { ok: true };
}

export async function publishWinnersAction(cycleId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const now = new Date();
  const db = getDb();
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Cycle not found." };

  const [cycleCategories, progress] = await Promise.all([
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycle.id)),
    getCycleCompletionProgress(cycle.id),
  ]);
  const effectiveStage = getCycleEffectiveStage(cycle, progress);

  if (effectiveStage !== "Certification" && effectiveStage !== "Published") {
    return { ok: false, error: "Publish winners after every eligible member votes." };
  }

  for (const category of cycleCategories) {
    await certifyCategoryResult(category, user);
  }

  await db
    .update(schema.awardCycles)
    .set({ publishedAt: now, stage: "published", updatedAt: now })
    .where(eq(schema.awardCycles.id, cycleId));

  await db.insert(schema.auditEvents).values({
    action: "publish_winners",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: cycleId,
    summary: "Admin published winners publicly.",
  });

  revalidateAwardPages();

  return { ok: true };
}
