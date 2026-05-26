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
import {
  buildVisibleBallotFinalists,
  getCompletedCategoryIds,
  getUnresolvedTieCategoryIds,
} from "@/lib/awards/workflow.mjs";

export type AwardPortalModel = {
  audit: AuditEvent[];
  categories: Category[];
  currentBallotScope: string;
  currentMemberVoteReceipt: {
    ballotScope: string;
    categoryIds: string[];
    confirmationCode: string;
    submittedAt: string | null;
  } | null;
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
  finalistReview: {
    category: Category;
    finalists: Finalist[];
  }[];
  hasUnresolvedTies: boolean;
  members: Member[];
  nominations: Nomination[];
  phases: typeof awardModel.phases;
  progress: CycleProgress;
  privateResults: {
    category: string;
    categoryId: string;
    count: number;
    leader: string;
    status: string;
    totals?: { displayName: string; finalistId: string; voteCount: number }[];
  }[];
  results: {
    category: string;
    count: number;
    leader: string;
    status: string;
    winners?: { name: string; photoUrl?: string | null }[];
  }[];
  voteSubmissions: {
    ballotScope: string;
    pending: { memberId: string; name: string; photoUrl?: string | null }[];
    submitted: {
      memberId: string;
      name: string;
      photoUrl?: string | null;
      submittedAt: string | null;
    }[];
  };
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
  const fallbackPrivateResults = awardModel.results.map((result) => ({
    ...result,
    categoryId:
      awardModel.categories.find((category) => category.title === result.category)?.id ??
      result.category,
  }));

  return {
    ...awardModel,
    currentBallotScope: "main",
    currentMemberVoteReceipt: null,
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
    finalistReview: [],
    hasUnresolvedTies: false,
    privateResults: fallbackPrivateResults,
    progress,
    voteSubmissions: {
      ballotScope: "main",
      pending: [],
      submitted: [],
    },
  };
}

export async function getPortalData(
  options: { currentMemberId?: string; includeClerkRoster?: boolean } = {},
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
      awardsEligible: member.awardsEligible,
      photoUrl: member.photoUrl,
      staffType: member.staffType as Member["staffType"],
      status: member.status,
    }),
  );
  const memberById = new Map(memberList.map((member) => [member.id, member]));

  const categoryList = categories.map(
    (category): Category => ({
      active: category.active,
      ballotScope: category.ballotScope,
      description: category.description,
      finalistLimit: category.finalistLimit,
      id: category.id,
      kind: category.kind,
      nomineeStaffScope: category.nomineeStaffScope as Category["nomineeStaffScope"],
      nominationLimit: category.nominationLimit,
      parentCategoryId: category.parentCategoryId,
      question: category.nominationQuestion,
      title: category.title,
    }),
  );
  const categoryById = new Map(categoryList.map((category) => [category.id, category]));

  const finalistList = finalists
    .filter((finalist) => categoryById.has(finalist.categoryId))
    .map(
      (finalist): Finalist => ({
        ballotScope: categoryById.get(finalist.categoryId)?.ballotScope ?? "main",
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
  const configuredStage = toStage(cycle.stage);
  const mainProgress = getCycleProgress({
    ballotScope: "main",
    categories: categoryList,
    certifications,
    finalists: finalistList,
    members: memberList,
    nominations,
    voteReceipts,
  });
  let currentBallotScope = "main";
  let progress = mainProgress;
  let effectiveStage = getEffectiveCycleStage({
    activeCategoryCount: mainProgress.activeCategoryCount,
    approvedCategoryCount: mainProgress.approvedCategoryCount,
    approvedFinalistCount: mainProgress.approvedFinalistCount,
    configuredStage,
    eligibleMemberCount: mainProgress.eligibleMemberCount,
    nominationCompletionCount: mainProgress.nominationCompletionCount,
    publishedAt: cycle.publishedAt,
    voteReceiptCount: mainProgress.voteReceiptCount,
  }) as AwardStage;

  if (effectiveStage === "Certification" && !cycle.publishedAt) {
    const activeRunoff = categoryList.find((category) => {
      if (!category.active || category.kind !== "runoff") return false;

      const certification = certifications.find((item) => item.categoryId === category.id);
      return !certification?.winnerFinalistId;
    });

    if (activeRunoff) {
      currentBallotScope = activeRunoff.ballotScope;
      progress = getCycleProgress({
        ballotScope: currentBallotScope,
        categories: categoryList,
        certifications,
        finalists: finalistList,
        members: memberList,
        nominations,
        voteReceipts,
      });
      effectiveStage =
        progress.voteReceiptCount >= progress.eligibleMemberCount && progress.eligibleMemberCount > 0
          ? "Certification"
          : "Voting";
    }
  }

  const finalistsByCategoryId = new Map<string, Finalist[]>();
  for (const finalist of finalistList) {
    const group = finalistsByCategoryId.get(finalist.categoryId) ?? [];
    group.push(finalist);
    finalistsByCategoryId.set(finalist.categoryId, group);
  }
  const voteCountsByCategoryId = new Map<string, Map<string, number>>();
  for (const vote of votes) {
    const category = categoryById.get(vote.categoryId);
    if (!category || (vote.ballotScope ?? "main") !== category.ballotScope) continue;

    const categoryCounts = voteCountsByCategoryId.get(vote.categoryId) ?? new Map<string, number>();
    categoryCounts.set(vote.finalistId, (categoryCounts.get(vote.finalistId) ?? 0) + 1);
    voteCountsByCategoryId.set(vote.categoryId, categoryCounts);
  }
  const certificationsByCategoryId = new Map(
    certifications.map((certification) => [certification.categoryId, certification]),
  );
  const runoffsByParentCategoryId = new Map<string, Category[]>();
  for (const category of categoryList) {
    if (category.kind !== "runoff" || !category.parentCategoryId) continue;

    const group = runoffsByParentCategoryId.get(category.parentCategoryId) ?? [];
    group.push(category);
    runoffsByParentCategoryId.set(category.parentCategoryId, group);
  }
  type PortalWinner = { name: string; photoUrl: string | null };
  type CategoryResult = {
    category: string;
    categoryId: string;
    count: number;
    leader: string;
    status: string;
    totals: { displayName: string; finalistId: string; voteCount: number }[];
    winners: PortalWinner[];
  };
  const resultCache = new Map<string, CategoryResult>();

  function winnerFromFinalist(finalistId?: string | null) {
    if (!finalistId) return null;

    const finalist = finalistById.get(finalistId);
    if (!finalist) return null;

    return {
      name: finalist.displayName,
      photoUrl: memberById.get(finalist.nomineeId)?.photoUrl ?? finalist.photoUrl ?? null,
    };
  }

  function winnersFromSnapshot(
    snapshot:
      | {
          leader?: string;
          tiedWinners?: { displayName?: string; finalistId?: string }[];
        }
      | undefined,
  ) {
    if (!snapshot) return [];

    if (Array.isArray(snapshot.tiedWinners) && snapshot.tiedWinners.length > 0) {
      return snapshot.tiedWinners
        .map((winner) => {
          const finalist = winner.finalistId ? finalistById.get(winner.finalistId) : undefined;
          const name = winner.displayName ?? finalist?.displayName;

          if (!name) return null;

          return {
            name,
            photoUrl: finalist ? memberById.get(finalist.nomineeId)?.photoUrl ?? finalist.photoUrl ?? null : null,
          };
        })
        .filter((winner): winner is PortalWinner => Boolean(winner));
    }

    if (!snapshot.leader || snapshot.leader === "Pending" || snapshot.leader === "Tie") return [];

    return snapshot.leader.split(",").map((name) => ({
      name: name.trim(),
      photoUrl: memberList.find((member) => member.name === name.trim())?.photoUrl ?? null,
    }));
  }

  function resultForCategory(category: Category) {
    const cached = resultCache.get(category.id);
    if (cached) return cached;

    const categoryFinalists = finalistsByCategoryId.get(category.id) ?? [];
    const categoryVoteCounts = voteCountsByCategoryId.get(category.id) ?? new Map<string, number>();
    const totals = categoryFinalists
      .map((finalist) => ({
        displayName: finalist.displayName,
        finalistId: finalist.id,
        voteCount: categoryVoteCounts.get(finalist.id) ?? 0,
      }))
      .sort((left, right) => {
        if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount;
        return left.displayName.localeCompare(right.displayName);
      });
    const certification = certificationsByCategoryId.get(category.id);
    const snapshot = certification?.tallySnapshot as
      | {
          count?: number;
          leader?: string;
          status?: string;
          tiedWinners?: { displayName?: string; finalistId?: string }[];
        }
      | undefined;
    const calculatedTopCount = totals[0]?.voteCount ?? 0;
    const topCount = calculatedTopCount > 0 ? calculatedTopCount : snapshot?.count ?? 0;
    const topIds = totals
      .filter((total) => topCount > 0 && total.voteCount === topCount)
      .map((total) => total.finalistId);
    const certifiedWinner = winnerFromFinalist(certification?.winnerFinalistId);
    const snapshotWinners = winnersFromSnapshot(snapshot);
    const calculatedWinners = topIds
      .map((finalistId) => winnerFromFinalist(finalistId))
      .filter((winner): winner is PortalWinner => Boolean(winner));
    const winner =
      certifiedWinner?.name ||
      snapshot?.leader ||
      calculatedWinners[0]?.name ||
      "Pending";

    const result = {
      category: category.title,
      categoryId: category.id,
      count: topCount,
      leader: winner,
      status:
        snapshot?.status ??
        (topIds.length > 1 && topCount > 0 ? "tie-check" : topCount > 0 ? "ready" : "pending"),
      totals,
      winners: certifiedWinner ? [certifiedWinner] : snapshotWinners.length ? snapshotWinners : calculatedWinners,
    };
    resultCache.set(category.id, result);

    return result;
  }

  const privateResultEntries = categoryList
    .filter((category) => category.active)
    .map((category) => [category.id, resultForCategory(category)] as const);
  const privateResults = privateResultEntries.map(([, result]) => result);
  const privateResultByCategory = new Map(privateResultEntries);
  const unresolvedTieIds = new Set(
    getUnresolvedTieCategoryIds({
      categories: categoryList,
      certifications,
    }),
  );

  for (const category of categoryList) {
    if (category.kind === "runoff") continue;

    const result = privateResultByCategory.get(category.id);
    const hasCalculatedTie = result?.status === "tie-check";
    const hasResolvedRunoff = (runoffsByParentCategoryId.get(category.id) ?? []).some((runoffCategory) =>
      Boolean(certificationsByCategoryId.get(runoffCategory.id)?.winnerFinalistId),
    );

    if (hasCalculatedTie && !hasResolvedRunoff) unresolvedTieIds.add(category.id);
  }

  const results = categoryList
    .filter((category) => category.kind !== "runoff")
    .map((category) => {
      const baseResult = resultForCategory(category);
      const resolvedRunoff = (runoffsByParentCategoryId.get(category.id) ?? [])
        .map((runoffCategory) => ({
          category: runoffCategory,
          certification: certificationsByCategoryId.get(runoffCategory.id),
          result: resultForCategory(runoffCategory),
        }))
        .find((item) => item.certification?.winnerFinalistId);

      if (!resolvedRunoff) {
        return {
          category: baseResult.category,
          count: baseResult.count,
          leader: baseResult.leader,
          status: baseResult.status,
          winners: baseResult.winners,
        };
      }

      return {
        category: baseResult.category,
        count: resolvedRunoff.result.count,
        leader: resolvedRunoff.result.leader,
        status: "ready",
        winners: resolvedRunoff.result.winners,
      };
    });
  const finalistReview = categoryList
    .filter((category) => category.active && category.kind !== "runoff" && category.ballotScope === "main")
    .map((category) => ({
      category,
      finalists: finalistList.filter((finalist) => finalist.categoryId === category.id),
    }));
  const currentMemberVoteReceipt = options.currentMemberId
    ? voteReceipts.find(
        (receipt) =>
          receipt.memberId === options.currentMemberId &&
          (receipt.ballotScope ?? "main") === currentBallotScope,
      )
    : null;
  const scopedVoteReceipts = voteReceipts.filter(
    (receipt) => (receipt.ballotScope ?? "main") === currentBallotScope,
  );
  const voteReceiptByMemberId = new Map(
    scopedVoteReceipts.map((receipt) => [receipt.memberId, receipt]),
  );
  const eligibleVotingMembers = memberList
    .filter((member) => member.status === "active" && member.awardsEligible !== false)
    .sort((left, right) => left.name.localeCompare(right.name));
  const visibleVotingCategoryIdsForMember = (member: Member) => {
    const visibleFinalists = buildVisibleBallotFinalists({
      categories: categoryList,
      currentMemberId: member.id,
      finalists: finalistList,
      members: memberList,
    });

    return categoryList
      .filter(
        (category) =>
          category.active &&
          category.ballotScope === currentBallotScope &&
          visibleFinalists.some(
            (finalist) =>
              finalist.categoryId === category.id && finalist.status === "approved",
          ),
      )
      .map((category) => category.id);
  };
  const memberHasCompletedVoting = (member: Member) => {
    const requiredCategoryIds = visibleVotingCategoryIdsForMember(member);
    if (requiredCategoryIds.length === 0) return true;

    const receipt = voteReceiptByMemberId.get(member.id);
    if (!receipt) return false;

    const completedCategoryIds = getCompletedCategoryIds(receipt);

    return requiredCategoryIds.every((categoryId) => completedCategoryIds.includes(categoryId));
  };
  const voteSubmissions = {
    ballotScope: currentBallotScope,
    pending: eligibleVotingMembers
      .filter((member) => !memberHasCompletedVoting(member))
      .map((member) => ({
        memberId: member.id,
        name: member.name,
        photoUrl: member.photoUrl,
      })),
    submitted: eligibleVotingMembers
      .filter((member) => memberHasCompletedVoting(member))
      .map((member) => {
        const receipt = voteReceiptByMemberId.get(member.id);

        return {
          memberId: member.id,
          name: member.name,
          photoUrl: member.photoUrl,
          submittedAt: dateToIso(receipt?.submittedAt),
        };
      }),
  };

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
    currentBallotScope,
    currentMemberVoteReceipt: currentMemberVoteReceipt
      ? {
          ballotScope: currentMemberVoteReceipt.ballotScope ?? "main",
          categoryIds: getCompletedCategoryIds(currentMemberVoteReceipt),
          confirmationCode: currentMemberVoteReceipt.confirmationCode,
          submittedAt: dateToIso(currentMemberVoteReceipt.submittedAt),
        }
      : null,
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
    finalistReview,
    finalists: finalistList,
    hasUnresolvedTies: unresolvedTieIds.size > 0,
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
    privateResults,
    progress,
    results,
    voteSubmissions,
  };
}
