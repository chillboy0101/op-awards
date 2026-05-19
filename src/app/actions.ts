"use server";

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertRole } from "@/lib/auth/security";
import { syncAllowedOrganizationMembers } from "@/lib/auth/clerk-members";
import { awardModel } from "@/lib/awards/data";
import { getMemberPhaseAccess } from "@/lib/awards/phase";
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

const cycleStageSchema = z.object({
  cycleId: z.string().min(1),
  stage: z.enum(["draft", "nominations", "review", "voting", "certification", "published"]),
});

export async function createNominationAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  const parsed = nominationSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Check the nomination fields." };
  if (parsed.data.nomineeId === user.member.id) {
    return { ok: false, error: "Self-nominations are not allowed." };
  }

  if (!hasDatabaseUrl()) {
    if (!getMemberPhaseAccess(awardModel.cycle.stage).canNominate) {
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

  if (!cycle || !getMemberPhaseAccess(cycle.stage).canNominate) {
    return { ok: false, error: "Nominations are not open." };
  }

  await db.insert(schema.nominations).values({
    categoryId: parsed.data.categoryId,
    cycleId: category.cycleId,
    nomineeId: parsed.data.nomineeId,
    nominatorId: user.member.id,
    statement: parsed.data.statement,
    supportingLink: parsed.data.supportingLink || null,
  });

  return { ok: true };
}

export async function submitBallotAction(input: unknown) {
  const user = await getCurrentUser();

  if (!user) return { ok: false, error: "Authentication required." };

  const parsed = ballotSchema.safeParse(input);

  if (!parsed.success) return { ok: false, error: "Select one finalist per category." };

  const confirmationCode = `CPA-${nanoid(10).toUpperCase()}`;

  if (!hasDatabaseUrl()) {
    if (!getMemberPhaseAccess(awardModel.cycle.stage).canVote) {
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

  if (!cycle || !getMemberPhaseAccess(cycle.stage).canVote) {
    return { ok: false, error: "Voting is not open." };
  }

  await db.insert(schema.voteReceipts).values({
    categoryIds,
    confirmationCode,
    cycleId: parsed.data.cycleId,
    memberId: user.member.id,
  });

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

  return { ok: true, confirmationCode };
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

  await getDb().insert(schema.auditEvents).values({
    action: "certify_results",
    actorMemberId: user.member.id,
    actorRole: user.role,
    target: categoryId,
    summary: "Admin certified category results.",
  });

  return { ok: true };
}
