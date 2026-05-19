import { desc, eq, inArray } from "drizzle-orm";

import { getDb, hasDatabaseUrl, schema } from "@/db";
import { syncAllowedOrganizationMembers } from "@/lib/auth/clerk-members";
import {
  awardModel,
  type AuditEvent,
  type AwardStage,
  type Category,
  type Finalist,
  type Member,
  type Nomination,
} from "@/lib/awards/data";
import { getEffectiveCycleStage } from "@/lib/awards/phase";
import { getCycleProgress, type CycleProgress } from "@/lib/awards/progress";

export type AwardPortalModel = {
  audit: AuditEvent[];
  categories: Category[];
  cycle: {
    configuredStage: AwardStage;
    id: string;
    nominationsClose: string;
    nominationsCloseAt: string | null;
    nominationsOpen: string;
    nominationsOpenAt: string | null;
    publishAt: string | null;
    publishDate: string;
    publishedAt: string | null;
    stage: AwardStage;
    title: string;
    votingClose: string;
    votingCloseAt: string | null;
    votingOpen: string;
    votingOpenAt: string | null;
  };
  finalists: Finalist[];
  members: Member[];
  nominations: Nomination[];
  phases: typeof awardModel.phases;
  progress: CycleProgress;
  results: {
    category: string;
    count: number;
    leader: string;
    status: string;
  }[];
};

function toStage(stage: string): AwardStage {
  const labels: Record<string, AwardStage> = {
    certification: "Certification",
    draft: "Draft",
    nominations: "Nominations",
    published: "Published",
    review: "Review",
    voting: "Voting",
  };

  return labels[stage] ?? "Draft";
}

function shortDate(date: Date | null) {
  if (!date) return "TBD";

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

function dateToIso(date?: Date | string | null) {
  if (!date) return null;

  if (typeof date === "string") return date;

  return date.toISOString();
}

function nominationStatus(status: string): Nomination["status"] {
  if (status === "needs_info") return "needs-info";
  if (status === "approved" || status === "recommended" || status === "new") return status;

  return "needs-info";
}

function getFallbackPortalData(): AwardPortalModel {
  const progress = getCycleProgress({
    categories: awardModel.categories,
    finalists: awardModel.finalists,
    members: awardModel.members,
    nominations: awardModel.nominations,
    voteReceipts: [],
  });

  return {
    ...awardModel,
    cycle: {
      ...awardModel.cycle,
      configuredStage: awardModel.cycle.stage,
      stage: getEffectiveCycleStage({
        activeCategoryCount: progress.activeCategoryCount,
        approvedCategoryCount: progress.approvedCategoryCount,
        approvedFinalistCount: progress.approvedFinalistCount,
        configuredStage: awardModel.cycle.stage,
        eligibleMemberCount: progress.eligibleMemberCount,
        nominationCompletionCount: progress.nominationCompletionCount,
        publishedAt: awardModel.cycle.publishedAt,
        voteReceiptCount: progress.voteReceiptCount,
      }) as AwardStage,
    },
    progress,
  };
}

export async function getPortalData(
  options: { includeClerkRoster?: boolean } = {},
): Promise<AwardPortalModel> {
  if (!hasDatabaseUrl()) return getFallbackPortalData();

  if (options.includeClerkRoster) {
    await syncAllowedOrganizationMembers();
  }

  const db = getDb();
  const [cycle] = await db
    .select()
    .from(schema.awardCycles)
    .orderBy(desc(schema.awardCycles.createdAt))
    .limit(1);

  if (!cycle) return getFallbackPortalData();

  const [members, categories, nominations, votes, voteReceipts, audit] = await Promise.all([
    db.select().from(schema.members).where(eq(schema.members.status, "active")),
    db.select().from(schema.categories).where(eq(schema.categories.cycleId, cycle.id)),
    db.select().from(schema.nominations).where(eq(schema.nominations.cycleId, cycle.id)),
    db.select().from(schema.anonymousVotes).where(eq(schema.anonymousVotes.cycleId, cycle.id)),
    db.select().from(schema.voteReceipts).where(eq(schema.voteReceipts.cycleId, cycle.id)),
    db.select().from(schema.auditEvents).orderBy(desc(schema.auditEvents.createdAt)).limit(8),
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

  const memberList = members.map(
    (member): Member => ({
      chapter: member.chapter,
      email: member.email,
      id: member.id,
      joined: member.joinedYear ?? "",
      name: member.name,
      photoUrl: member.photoUrl,
      status: member.status,
    }),
  );
  const memberById = new Map(memberList.map((member) => [member.id, member]));

  const categoryList = categories.map(
    (category): Category => ({
      active: category.active,
      description: category.description,
      finalistLimit: category.finalistLimit,
      id: category.id,
      nominationLimit: category.nominationLimit,
      question: category.nominationQuestion,
      title: category.title,
    }),
  );
  const categoryById = new Map(categoryList.map((category) => [category.id, category]));

  const finalistList = finalists
    .filter((finalist) => categoryById.has(finalist.categoryId))
    .map(
      (finalist): Finalist => ({
        categoryId: finalist.categoryId,
        displayName: finalist.displayName,
        id: finalist.id,
        nominationCount: finalist.nominationCount,
        nomineeId: finalist.nomineeId,
        photoUrl: memberById.get(finalist.nomineeId)?.photoUrl,
        status: finalist.status,
        summary: finalist.summary,
      }),
    );
  const finalistById = new Map(finalistList.map((finalist) => [finalist.id, finalist]));
  const progress = getCycleProgress({
    categories: categoryList,
    certifications,
    finalists: finalistList,
    members: memberList,
    nominations,
    voteReceipts,
  });
  const configuredStage = toStage(cycle.stage);
  const effectiveStage = getEffectiveCycleStage({
    activeCategoryCount: progress.activeCategoryCount,
    approvedCategoryCount: progress.approvedCategoryCount,
    approvedFinalistCount: progress.approvedFinalistCount,
    configuredStage,
    eligibleMemberCount: progress.eligibleMemberCount,
    nominationCompletionCount: progress.nominationCompletionCount,
    publishedAt: cycle.publishedAt,
    voteReceiptCount: progress.voteReceiptCount,
  }) as AwardStage;

  const results = categoryList.map((category) => {
    const categoryVotes = votes.filter((vote) => vote.categoryId === category.id);
    const counts = new Map<string, number>();

    for (const vote of categoryVotes) {
      counts.set(vote.finalistId, (counts.get(vote.finalistId) ?? 0) + 1);
    }

    const sorted = [...counts.entries()].sort((left, right) => right[1] - left[1]);
    const certification = certifications.find((item) => item.categoryId === category.id);
    const snapshot = certification?.tallySnapshot as
      | { count?: number; leader?: string; status?: string }
      | undefined;
    const topCount = sorted[0]?.[1] ?? snapshot?.count ?? 0;
    const topIds = sorted.filter(([, count]) => count === topCount).map(([id]) => id);
    const winner =
      (certification?.winnerFinalistId &&
        finalistById.get(certification.winnerFinalistId)?.displayName) ||
      snapshot?.leader ||
      finalistById.get(topIds[0] ?? "")?.displayName ||
      "Pending";

    return {
      category: category.title,
      count: topCount,
      leader: winner,
      status: snapshot?.status ?? (topIds.length > 1 && topCount > 0 ? "tie-check" : "ready"),
    };
  });

  return {
    audit: audit.map(
      (event): AuditEvent => ({
        action: event.action.replaceAll("_", " "),
        actor: event.actorRole,
        id: event.id,
        target: event.target,
        time: shortDate(event.createdAt),
      }),
    ),
    categories: categoryList,
    cycle: {
      configuredStage,
      id: cycle.id,
      nominationsClose: shortDate(cycle.nominationsCloseAt),
      nominationsCloseAt: dateToIso(cycle.nominationsCloseAt),
      nominationsOpen: shortDate(cycle.nominationsOpenAt),
      nominationsOpenAt: dateToIso(cycle.nominationsOpenAt),
      publishAt: dateToIso(cycle.publishAt),
      publishDate: shortDate(cycle.publishAt),
      publishedAt: dateToIso(cycle.publishedAt),
      stage: effectiveStage,
      title: cycle.title,
      votingClose: shortDate(cycle.votingCloseAt),
      votingCloseAt: dateToIso(cycle.votingCloseAt),
      votingOpen: shortDate(cycle.votingOpenAt),
      votingOpenAt: dateToIso(cycle.votingOpenAt),
    },
    finalists: finalistList,
    members: memberList,
    nominations: nominations.map(
      (nomination): Nomination => ({
        categoryId: nomination.categoryId,
        duplicateRisk: nomination.duplicateRisk,
        id: nomination.id,
        link: nomination.supportingLink ?? undefined,
        nomineeId: nomination.nomineeId,
        nominatorId: nomination.nominatorId,
        reviewerScore: nomination.reviewerScore ?? 0,
        statement: nomination.statement,
        status: nominationStatus(nomination.status),
      }),
    ),
    phases: awardModel.phases,
    progress,
    results,
  };
}
