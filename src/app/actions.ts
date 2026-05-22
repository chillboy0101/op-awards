"use server";

import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertRole } from "@/lib/auth/security";
import { syncAllowedOrganizationMembers } from "@/lib/auth/clerk-members";
import { awardModel } from "@/lib/awards/data";
import { getEffectiveCycleStage, getMemberPhaseAccess } from "@/lib/awards/phase";
import { getCycleProgress, type CycleProgress } from "@/lib/awards/progress";
import {
  buildDraftFinalists,
  buildAwardCategorySetup,
  calculateResults,
  createAcceptedTieCertificationSnapshot,
  createRunoffCategory,
  createResultCertificationSnapshot,
  getResetCategoryIds,
  getUnresolvedTieCategoryIds,
  suggestFinalists,
  validateBallotSelections,
  validateCategorySetup,
  validateNomination,
  validateNominationBatch,
} from "@/lib/awards/workflow.mjs";
import { sendVoteReceiptEmail } from "@/lib/email/resend";

const nominationEntrySchema = z.object({
  categoryId: z.string().min(1),
  nomineeId: z.string().min(1),
  statement: z.string().max(2000).optional().default(""),
  supportingLink: z.string().url().optional().or(z.literal("")),
});
const nominationSchema = nominationEntrySchema;
const nominationBatchSchema = z.object({
  nominations: z.array(nominationEntrySchema).min(1),
});

const ballotSchema = z.object({
  ballotScope: z.string().min(1).optional().default("main"),
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

const memberEligibilitySchema = z.object({
  awardsEligible: z.boolean(),
  memberId: z.string().min(1),
});

const bulkMemberEligibilitySchema = z.object({
  awardsEligible: z.boolean(),
});

const resetAwardsRunSchema = z.object({
  confirmed: z.literal(true),
  cycleId: z.string().min(1),
});

const categorySetupSchema = z.object({
  active: z.boolean().default(true),
  categoryId: z.string().optional(),
  finalistLimit: z.coerce.number().int().min(1).max(20).optional().default(3),
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
type DraftFinalist = {
  ballotScope?: string;
  categoryId: string;
  displayName: string;
  nominationCount: number;
  nomineeId: string;
  status: "draft" | "approved";
  summary: string;
};
type RunoffSetup = {
  category: {
    ballotScope: string;
    finalistLimit: number;
    id: string;
    title: string;
  };
  finalists: Array<{
    categoryId: string;
    displayName: string;
    nominationCount: number;
    nomineeId: string;
    status: "approved";
    summary: string;
  }>;
};
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

async function getCycleCompletionProgress(cycleId: string, ballotScope = "main") {
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
    ballotScope,
    categories,
    certifications,
    finalists,
    members,
    nominations,
    voteReceipts,
  });
}

function stageForBallotScope(cycle: CycleTiming, progress: CycleProgress, ballotScope: string) {
  if (ballotScope === "main") return getCycleEffectiveStage(cycle, progress);

  if (progress.voteReceiptCount >= progress.eligibleMemberCount && progress.eligibleMemberCount > 0) {
    return "Certification";
  }

  return "Voting";
}

export async function prepareDraftFinalistsForCycle(cycleId: string) {
  if (!hasDatabaseUrl()) return { ok: true, demo: true, count: 0 };

  const db = getDb();
  const [members, categories, nominations, finalists, voteRows] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.status, "active")),
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycleId)),
    db.select().from(schema.nominations).where(eq(schema.nominations.cycleId, cycleId)),
    db.select().from(schema.finalists),
    db.select().from(schema.anonymousVotes).where(eq(schema.anonymousVotes.cycleId, cycleId)),
  ]);
  const mainCategories = categories.filter(
    (category) =>
      category.active &&
      category.ballotScope === "main" &&
      category.kind !== "runoff",
  );
  const progress = getCycleProgress({
    ballotScope: "main",
    categories: mainCategories,
    finalists,
    members,
    nominations,
    voteReceipts: [],
  });

  if (
    progress.eligibleMemberCount === 0 ||
    progress.nominationCompletionCount < progress.eligibleMemberCount
  ) {
    return { ok: false, error: "Nominations are not complete.", count: 0 };
  }

  const drafts = buildDraftFinalists({
    categories: mainCategories,
    members,
    nominations,
  }) as DraftFinalist[];
  let count = 0;
  const approvedCategoryIds = new Set(
    finalists
      .filter((finalist) => finalist.status === "approved")
      .map((finalist) => finalist.categoryId),
  );

  for (const category of mainCategories) {
    const categoryHasVotes = voteRows.some((vote) => vote.categoryId === category.id);
    const categoryHasApprovedFinalists = finalists.some(
      (finalist) => finalist.categoryId === category.id && finalist.status === "approved",
    );

    if (categoryHasVotes || categoryHasApprovedFinalists) continue;

    const categoryDrafts = drafts.filter((draft) => draft.categoryId === category.id);
    if (categoryDrafts.length === 0) continue;

    await db.insert(schema.finalists).values(
      categoryDrafts.map((draft) => ({
        approvedAt: draft.status === "approved" ? new Date() : null,
        categoryId: draft.categoryId,
        displayName: draft.displayName,
        nominationCount: draft.nominationCount,
        nomineeId: draft.nomineeId,
        status: draft.status,
        summary: draft.summary,
      })),
    ).onConflictDoUpdate({
      target: [schema.finalists.categoryId, schema.finalists.nomineeId],
      set: {
        approvedAt: sql`excluded.approved_at`,
        displayName: sql`excluded.display_name`,
        nominationCount: sql`excluded.nomination_count`,
        status: sql`excluded.status`,
        summary: sql`excluded.summary`,
        updatedAt: new Date(),
      },
    });
    if (categoryDrafts.some((draft) => draft.status === "approved")) {
      approvedCategoryIds.add(category.id);
    }
    count += categoryDrafts.length;
  }

  if (
    mainCategories.length > 0 &&
    mainCategories.every((category) => approvedCategoryIds.has(category.id))
  ) {
    await db
      .update(schema.awardCycles)
      .set({ stage: "voting", updatedAt: new Date() })
      .where(eq(schema.awardCycles.id, cycleId));
  }

  return { ok: true, count };
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

function nominationValidationMessage(reason?: string) {
  if (reason === "INCOMPLETE_NOMINATION_BALLOT") {
    return "Select one person for every category.";
  }

  if (reason === "CATEGORY_NOMINATION_LIMIT_REACHED") {
    return "You already submitted nominations.";
  }

  if (reason === "NOMINEE_NOT_ACTIVE_MEMBER") {
    return "Choose active members only.";
  }

  if (reason === "SELF_NOMINATION_NOT_ALLOWED") {
    return "Self-nominations are not allowed.";
  }

  return "Unable to save these nominations.";
}

export async function createNominationAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  const parsed = nominationSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the nomination fields." };
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
      error: nominationValidationMessage(nominationValidation.reason),
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

export async function createNominationsAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };
  if (!user.member.awardsEligible) {
    return { ok: false, error: "You are not currently eligible for this awards run." };
  }

  const parsed = nominationBatchSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Select one person for every category." };

  if (!hasDatabaseUrl()) {
    if (!getMemberPhaseAccess(getDemoEffectiveStage()).canNominate) {
      return { ok: false, error: "Nominations are not open." };
    }

    return { ok: true, demo: true, count: parsed.data.nominations.length };
  }

  const db = getDb();
  const selectedCategoryIds = parsed.data.nominations.map((nomination) => nomination.categoryId);
  const selectedCategories = await db
    .select()
    .from(schema.categories)
    .where(inArray(schema.categories.id, selectedCategoryIds));
  const cycleIds = new Set(selectedCategories.map((category) => category.cycleId));

  if (selectedCategories.length !== selectedCategoryIds.length || cycleIds.size !== 1) {
    return { ok: false, error: "Check the selected categories." };
  }

  const cycleId = [...cycleIds][0];
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Nominations are not open." };

  const progress = await getCycleCompletionProgress(cycle.id);
  if (!getMemberPhaseAccess(getCycleEffectiveStage(cycle, progress)).canNominate) {
    return { ok: false, error: "Nominations are not open." };
  }

  const [cycleCategories, members, existingNominations] = await Promise.all([
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycle.id)),
    db.select().from(schema.members),
    db.select().from(schema.nominations).where(eq(schema.nominations.cycleId, cycle.id)),
  ]);
  const nominationValidation = validateNominationBatch({
    categories: cycleCategories,
    existingNominations,
    members,
    nominations: parsed.data.nominations,
    nominatorId: user.member.id,
  });

  if (!nominationValidation.ok) {
    const reason = "reason" in nominationValidation ? nominationValidation.reason : undefined;

    return {
      ok: false,
      error: nominationValidationMessage(reason),
    };
  }

  const validatedNominations =
    "nominations" in nominationValidation ? nominationValidation.nominations : [];

  await db.insert(schema.nominations).values(
    validatedNominations.map((nomination) => ({
      categoryId: nomination.categoryId,
      cycleId: cycle.id,
      nomineeId: nomination.nomineeId,
      nominatorId: user.member.id,
      statement: nomination.statement,
      supportingLink: null,
    })),
  );

  const nextProgress = getCycleProgress({
    ballotScope: "main",
    categories: cycleCategories,
    members,
    nominations: [
      ...existingNominations,
      ...validatedNominations.map((nomination) => ({
        categoryId: nomination.categoryId,
        nominatorId: user.member.id,
      })),
    ],
    voteReceipts: [],
  });

  if (
    nextProgress.eligibleMemberCount > 0 &&
    nextProgress.nominationCompletionCount >= nextProgress.eligibleMemberCount
  ) {
    await prepareDraftFinalistsForCycle(cycle.id);
  }

  revalidateAwardPages();

  return { ok: true, count: validatedNominations.length };
}

export async function submitBallotAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };
  if (!user.member.awardsEligible) {
    return { ok: false, error: "You are not currently eligible for this awards run." };
  }

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
  const ballotScope = parsed.data.ballotScope;
  const categoryIds = Object.keys(parsed.data.selections);
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, parsed.data.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Voting is not open." };
  if (categoryIds.length === 0) return { ok: false, error: "Select one finalist per category." };

  const [cycleCategories, finalists, members, progress] = await Promise.all([
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycle.id)),
    db.select().from(schema.finalists),
    db.select().from(schema.members).where(eq(schema.members.status, "active")),
    getCycleCompletionProgress(cycle.id, ballotScope),
  ]);
  const scopeCategories = cycleCategories.filter(
    (category) => category.active && category.ballotScope === ballotScope,
  );
  const cycleCategoryIds = new Set(scopeCategories.map((category) => category.id));
  const approvedFinalists = finalists.filter(
    (finalist) => finalist.status === "approved" && cycleCategoryIds.has(finalist.categoryId),
  );

  if (!getMemberPhaseAccess(stageForBallotScope(cycle, progress, ballotScope)).canVote) {
    return { ok: false, error: "Voting is not open." };
  }

  const ballotValidation = validateBallotSelections({
    categories: scopeCategories,
    finalists: approvedFinalists,
    members,
    selections: parsed.data.selections,
  });

  if (!ballotValidation.ok) {
    return { ok: false, error: "Select one approved finalist per category." };
  }

  try {
    await db.batch([
      db.insert(schema.voteReceipts).values({
        ballotScope,
        categoryIds: ballotValidation.categoryIds,
        confirmationCode,
        cycleId: parsed.data.cycleId,
        memberId: user.member.id,
      }),
      db.insert(schema.anonymousVotes).values(
        Object.entries(parsed.data.selections).map(([categoryId, finalistId]) => ({
          ballotScope,
          categoryId,
          cycleId: parsed.data.cycleId,
          finalistId,
        })),
      ),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("vote_receipts_cycle_member_unique")) {
      return { ok: false, error: "You already submitted this ballot." };
    }

    throw error;
  }

  after(async () => {
    try {
      await sendVoteReceiptEmail({
        confirmationCode,
        email: user.member.email,
      });
    } catch {
      // Voting is already recorded; a receipt email retry can happen outside the request.
    }
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

  const setup = buildAwardCategorySetup(parsed.data);
  const validated = validateCategorySetup(setup);
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

export async function deleteCategoryAction(categoryId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!categoryId?.trim()) return { ok: false, error: "Choose a category to delete." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const cycle = await getLatestCycle();
  if (!cycle) return { ok: false, error: "Create an award cycle first." };

  const db = getDb();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(and(eq(schema.categories.id, categoryId), eq(schema.categories.cycleId, cycle.id)))
    .limit(1);

  if (!category) return { ok: false, error: "Category not found." };

  await db.delete(schema.categories).where(eq(schema.categories.id, category.id));

  await db.insert(schema.auditEvents).values({
    action: "delete_category",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: category.title,
    summary: "Admin deleted award category.",
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

export async function approveAllFinalistsAction(cycleId: string) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  if (!hasDatabaseUrl()) return { ok: true, demo: true, count: 0 };

  const prepared = await prepareDraftFinalistsForCycle(cycleId);
  if (!prepared.ok && "error" in prepared) {
    return { ok: false, error: prepared.error };
  }

  const db = getDb();
  const categories = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.cycleId, cycleId));
  const activeMainCategories = categories.filter(
    (category) =>
      category.active &&
      category.ballotScope === "main" &&
      category.kind !== "runoff",
  );
  const categoryIds = activeMainCategories.map((category) => category.id);
  const finalists = categoryIds.length
    ? await db
        .select()
        .from(schema.finalists)
        .where(inArray(schema.finalists.categoryId, categoryIds))
    : [];
  const missingCategory = activeMainCategories.find(
    (category) => !finalists.some((finalist) => finalist.categoryId === category.id),
  );

  if (missingCategory) {
    return { ok: false, error: `No finalists are ready for ${missingCategory.title}.` };
  }

  let approvedCount = 0;

  for (const finalist of finalists) {
    if (finalist.status === "approved") continue;

    await db
      .update(schema.finalists)
      .set({
        approvedAt: new Date(),
        status: "approved",
        updatedAt: new Date(),
      })
      .where(eq(schema.finalists.id, finalist.id));
    approvedCount += 1;
  }

  await db.insert(schema.auditEvents).values({
    action: "approve_all_finalists",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: cycleId,
    summary: `Approved ${approvedCount} finalists for voting.`,
    metadata: { finalists: approvedCount },
  });

  revalidateAwardPages();

  return { ok: true, count: approvedCount };
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

export async function updateMemberEligibilityAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = memberEligibilitySchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Choose a valid member." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const [member] = await getDb()
    .update(schema.members)
    .set({
      awardsEligible: parsed.data.awardsEligible,
      updatedAt: new Date(),
    })
    .where(eq(schema.members.id, parsed.data.memberId))
    .returning();

  if (!member) return { ok: false, error: "Member not found." };

  await getDb().insert(schema.auditEvents).values({
    action: "update_member_participation",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: member.id,
    summary: `${member.name} ${member.awardsEligible ? "can participate" : "was excluded"} for this awards run.`,
    metadata: { awardsEligible: member.awardsEligible },
  });

  revalidateAwardPages();

  return { ok: true, awardsEligible: member.awardsEligible };
}

export async function bulkUpdateMemberEligibilityAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = bulkMemberEligibilitySchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Choose a valid participation state." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true, count: 0 };

  const members = await getDb()
    .update(schema.members)
    .set({
      awardsEligible: parsed.data.awardsEligible,
      updatedAt: new Date(),
    })
    .where(eq(schema.members.status, "active"))
    .returning();

  await getDb().insert(schema.auditEvents).values({
    action: "bulk_update_member_participation",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: "members",
    summary: `${members.length} members ${parsed.data.awardsEligible ? "enabled" : "excluded"} for this awards run.`,
    metadata: { awardsEligible: parsed.data.awardsEligible, count: members.length },
  });

  revalidateAwardPages();

  return { ok: true, count: members.length };
}

export async function resetAwardsRunAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  try {
    assertRole(user.role, ["admin"]);
  } catch {
    return { ok: false, error: "Admin access required." };
  }

  const parsed = resetAwardsRunSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Confirm the reset before continuing." };
  if (!hasDatabaseUrl()) return { ok: true, demo: true };

  const db = getDb();
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, parsed.data.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Awards cycle not found." };

  const cycleCategories = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.cycleId, cycle.id));
  const categoryIds = getResetCategoryIds(cycleCategories);

  if (categoryIds.length > 0) {
    await db
      .delete(schema.resultCertifications)
      .where(inArray(schema.resultCertifications.categoryId, categoryIds));
    await db
      .delete(schema.anonymousVotes)
      .where(eq(schema.anonymousVotes.cycleId, cycle.id));
    await db
      .delete(schema.finalists)
      .where(inArray(schema.finalists.categoryId, categoryIds));
  }

  await db.delete(schema.voteReceipts).where(eq(schema.voteReceipts.cycleId, cycle.id));
  await db.delete(schema.nominations).where(eq(schema.nominations.cycleId, cycle.id));
  await db.delete(schema.categories).where(eq(schema.categories.cycleId, cycle.id));
  const enabledMembers = await db
    .update(schema.members)
    .set({ awardsEligible: true, updatedAt: new Date() })
    .where(eq(schema.members.status, "active"))
    .returning();

  await db
    .update(schema.awardCycles)
    .set({
      publishedAt: null,
      stage: "nominations",
      updatedAt: new Date(),
    })
    .where(eq(schema.awardCycles.id, cycle.id));

  await db.insert(schema.auditEvents).values({
    action: "reset_awards_run",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: cycle.id,
    summary: "Reset awards activity, categories, and enabled all active members.",
    metadata: {
      categories: categoryIds.length,
      enabledMembers: enabledMembers.length,
    },
  });

  revalidateAwardPages();

  return { ok: true, count: enabledMembers.length };
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

  const db = getDb();
  const [category] = await db
    .select()
    .from(schema.categories)
    .where(eq(schema.categories.id, categoryId))
    .limit(1);

  if (!category) return { ok: false, error: "Category not found." };
  if (category.kind === "runoff") return { ok: false, error: "This is already a runoff." };

  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, category.cycleId))
    .limit(1);
  if (!cycle) return { ok: false, error: "Cycle not found." };

  const progress = await getCycleCompletionProgress(category.cycleId, "main");
  if (getCycleEffectiveStage(cycle, progress) !== "Certification") {
    return { ok: false, error: "Create runoffs after voting is complete." };
  }

  const existingRunoff = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.parentCategoryId, category.id),
        eq(schema.categories.kind, "runoff"),
        eq(schema.categories.active, true),
      ),
    )
    .limit(1);

  if (existingRunoff.length > 0) {
    return { ok: false, error: "A runoff already exists for this category." };
  }

  const [existingCertification] = await db
    .select()
    .from(schema.resultCertifications)
    .where(eq(schema.resultCertifications.categoryId, category.id))
    .limit(1);

  if (existingCertification?.status === "published") {
    return { ok: false, error: "Joint winners have already been accepted for this category." };
  }

  const [approvedFinalists, votes] = await Promise.all([
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
    finalists: approvedFinalists.map((finalist) => ({
      categoryId: finalist.categoryId,
      displayName: finalist.displayName,
      id: finalist.id,
      nominationCount: finalist.nominationCount,
      nomineeId: finalist.nomineeId,
    })),
    votes,
  });

  if (result.status !== "tie" || result.tiedFinalists.length < 2) {
    return { ok: false, error: "Runoff is only available for tied results." };
  }

  const runoffCategoryId = randomUUID();
  const runoff = createRunoffCategory({
    category,
    createdById: user.member.id,
    runoffCategoryId,
    tiedFinalists: result.tiedFinalists,
  }) as RunoffSetup;

  await db.insert(schema.categories).values({
    id: runoff.category.id,
    active: true,
    ballotScope: runoff.category.ballotScope,
    cycleId: category.cycleId,
    description: `${category.title} runoff ballot.`,
    finalistLimit: runoff.category.finalistLimit,
    kind: "runoff",
    nominationLimit: 0,
    nominationQuestion: `Who should win ${category.title}?`,
    parentCategoryId: category.id,
    title: runoff.category.title,
  });
  await db.insert(schema.finalists).values(
    runoff.finalists.map((finalist) => ({
      categoryId: finalist.categoryId,
      displayName: finalist.displayName,
      nominationCount: finalist.nominationCount,
      nomineeId: finalist.nomineeId,
      status: "approved" as const,
      summary: finalist.summary,
    })),
  );

  await db
    .delete(schema.resultCertifications)
    .where(eq(schema.resultCertifications.categoryId, category.id));
  await db.insert(schema.resultCertifications).values({
    categoryId: category.id,
    certifiedAt: new Date(),
    status: "runoff",
    tallySnapshot: createResultCertificationSnapshot({ category, result }).tallySnapshot,
    winnerFinalistId: null,
  });

  await db.insert(schema.auditEvents).values({
    action: "create_runoff",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: categoryId,
    summary: "Admin created a runoff ballot for a tied result.",
    metadata: {
      ballotScope: runoff.category.ballotScope,
      finalists: runoff.finalists.length,
    },
  });

  revalidateAwardPages();

  return { ok: true };
}

export async function acceptTiedWinnersAction(categoryId: string) {
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
  if (category.kind === "runoff") return { ok: false, error: "Joint winners apply to main categories only." };

  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .where(eq(schema.awardCycles.id, category.cycleId))
    .limit(1);

  if (!cycle) return { ok: false, error: "Cycle not found." };

  const progress = await getCycleCompletionProgress(category.cycleId, "main");
  const effectiveStage = getCycleEffectiveStage(cycle, progress);

  if (effectiveStage !== "Certification" && effectiveStage !== "Published") {
    return { ok: false, error: "Accept tied winners after voting is complete." };
  }

  const existingRunoff = await db
    .select({ id: schema.categories.id })
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.parentCategoryId, category.id),
        eq(schema.categories.kind, "runoff"),
        eq(schema.categories.active, true),
      ),
    )
    .limit(1);

  if (existingRunoff.length > 0) {
    return { ok: false, error: "A runoff already exists for this category." };
  }

  const [approvedFinalists, votes] = await Promise.all([
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
    finalists: approvedFinalists.map((finalist) => ({
      categoryId: finalist.categoryId,
      displayName: finalist.displayName,
      id: finalist.id,
      nominationCount: finalist.nominationCount,
      nomineeId: finalist.nomineeId,
    })),
    votes,
  });

  if (result.status !== "tie" || result.tiedFinalists.length < 2) {
    return { ok: false, error: "Joint winners are only available for tied results." };
  }

  const certification = createAcceptedTieCertificationSnapshot({ category, result });

  await db
    .delete(schema.resultCertifications)
    .where(eq(schema.resultCertifications.categoryId, category.id));

  await db.insert(schema.resultCertifications).values({
    categoryId: category.id,
    certifiedAt: new Date(),
    status: "published",
    tallySnapshot: certification.tallySnapshot,
    winnerFinalistId: null,
  });

  await db.insert(schema.auditEvents).values({
    action: "accept_tied_winners",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: categoryId,
    summary: "Admin accepted joint winners for a tied result.",
    metadata: {
      count: result.tiedFinalists[0]?.voteCount ?? 0,
      winners: result.tiedFinalists.map((finalist) => finalist.displayName),
    },
  });

  revalidateAwardPages();

  return { ok: true, count: result.tiedFinalists.length };
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

  const progress = await getCycleCompletionProgress(cycle.id, category.ballotScope);
  const effectiveStage = stageForBallotScope(cycle, progress, category.ballotScope);

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
    getCycleCompletionProgress(cycle.id, "main"),
  ]);
  const effectiveStage = getCycleEffectiveStage(cycle, progress);

  if (effectiveStage !== "Certification" && effectiveStage !== "Published") {
    return { ok: false, error: "Publish winners after every eligible member votes." };
  }

  const activeRunoffScopes = [
    ...new Set(
      cycleCategories
        .filter((category) => category.active && category.kind === "runoff")
        .map((category) => category.ballotScope),
    ),
  ];

  for (const ballotScope of activeRunoffScopes) {
    const runoffProgress = await getCycleCompletionProgress(cycle.id, ballotScope);
    if (runoffProgress.voteReceiptCount < runoffProgress.eligibleMemberCount) {
      return { ok: false, error: "Finish runoff voting before publishing winners." };
    }
  }

  const existingCertifications = cycleCategories.length
    ? await db
        .select()
        .from(schema.resultCertifications)
        .where(inArray(schema.resultCertifications.categoryId, cycleCategories.map((item) => item.id)))
    : [];
  const certificationByCategory = new Map(
    existingCertifications.map((certification) => [certification.categoryId, certification]),
  );

  for (const category of cycleCategories) {
    if (
      category.kind !== "runoff" &&
      ["published", "runoff"].includes(certificationByCategory.get(category.id)?.status ?? "")
    ) {
      continue;
    }

    await certifyCategoryResult(category, user);
  }

  const certifications = cycleCategories.length
    ? await db
        .select()
        .from(schema.resultCertifications)
        .where(inArray(schema.resultCertifications.categoryId, cycleCategories.map((item) => item.id)))
    : [];
  const unresolvedTieIds = getUnresolvedTieCategoryIds({
    categories: cycleCategories,
    certifications,
  });

  if (unresolvedTieIds.length > 0) {
    return { ok: false, error: "Resolve tied categories with joint winners or a runoff before publishing." };
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
