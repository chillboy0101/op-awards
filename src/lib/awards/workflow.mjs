function findMember(members, memberId) {
  return members.find((member) => member.id === memberId) ?? null;
}

const STAFF_TYPES = new Set(["main", "monitoring_only", "nss"]);
const NOMINEE_STAFF_SCOPES = new Set(["all", "staff", "nss"]);

export function normalizeStaffType(value) {
  return STAFF_TYPES.has(value) ? value : "main";
}

export function normalizeNomineeStaffScope(value) {
  return NOMINEE_STAFF_SCOPES.has(value) ? value : "all";
}

export function memberMatchesNomineeStaffScope(member, scope = "all") {
  const normalizedScope = normalizeNomineeStaffScope(scope);
  const staffType = normalizeStaffType(member?.staffType);

  if (normalizedScope === "all") return true;
  if (normalizedScope === "staff") return staffType === "main" || staffType === "monitoring_only";

  return staffType === "nss";
}

function activeMember(members, memberId) {
  const member = findMember(members, memberId);
  return member && member.status === "active" && member.awardsEligible !== false
    ? member
    : null;
}

function nominationCountForNominator(existingNominations, categoryId, nominatorId) {
  return existingNominations.filter(
    (nomination) =>
      nomination.categoryId === categoryId && nomination.nominatorId === nominatorId,
  ).length;
}

function compactText(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function buildNominationDirectory({ category, currentMemberId, members, query = "" }) {
  const normalizedQuery = query.trim().toLowerCase();
  const nomineeStaffScope = category?.nomineeStaffScope ?? "all";

  return members
    .filter((member) => member.status === "active")
    .filter((member) => member.awardsEligible !== false)
    .filter((member) => member.id !== currentMemberId)
    .filter((member) => memberMatchesNomineeStaffScope(member, nomineeStaffScope))
    .filter((member) => {
      if (!normalizedQuery) return true;

      return `${member.name} ${member.email} ${member.chapter ?? ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .map((member) => {
      const isSelf = member.id === currentMemberId;

      return {
        ...member,
        isSelf,
        selectable: true,
      };
    })
    .sort((left, right) => {
      if (left.isSelf !== right.isSelf) return left.isSelf ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
}

export function toggleSelection(currentSelection, nextSelection) {
  return currentSelection === nextSelection ? "" : nextSelection;
}

export function buildAwardCategorySetup(input) {
  const title = compactText(input.title);
  const awardTitle = title || "Award";

  return {
    active: input.active !== false,
    description: `${awardTitle} award category.`,
    finalistLimit: positiveInteger(input.finalistLimit, 3),
    nomineeStaffScope: normalizeNomineeStaffScope(input.nomineeStaffScope),
    nominationLimit: 1,
    nominationQuestion: `Who should receive ${awardTitle}?`,
    title,
  };
}

export function formatCategoryVotingSummary(category, eligibleMemberCount) {
  const threshold = getNominationSupportThreshold(
    eligibleMemberCount ?? category?.eligibleMemberCount,
  );

  return `Automatic: needs ${threshold} nominations, or top tied nominee if below threshold`;
}

export function getNominationSupportThreshold(eligibleMemberCount) {
  const count = Number(eligibleMemberCount);
  const normalizedCount = Number.isFinite(count) && count > 0 ? count : 0;

  return Math.max(2, Math.ceil(normalizedCount * 0.15));
}

export function getResetCategoryIds(categories) {
  return categories.map((category) => category.id).filter(Boolean);
}

export function getIncompleteBallotCategoryTitles(input) {
  const categories = input?.categories ?? [];
  const selections = input?.selections ?? {};

  return categories
    .filter((category) => category.active !== false)
    .filter((category) => !selections[category.id])
    .map((category) => category.title ?? "Untitled category");
}

/**
 * @param {{
 *   categories?: Array<{ id: string; active?: boolean; kind?: string; ballotScope?: string }>;
 *   memberId: string;
 *   nominations?: Array<{ categoryId: string; nomineeId?: string; nominatorId: string }>;
 * }} input
 * @returns {string[]}
 */
export function getSubmittedNominationCategoryIds({ categories = [], memberId, nominations = [] }) {
  const activeCategoryIds = new Set(
    categories
      .filter(
        (category) =>
          category.active !== false &&
          (category.kind ?? "standard") !== "runoff" &&
          (category.ballotScope ?? "main") === "main",
      )
      .map((category) => category.id),
  );
  const submittedCategoryIds = new Set(
    nominations
      .filter((nomination) => nomination.nominatorId === memberId)
      .filter((nomination) => !nomination.nomineeId || nomination.nomineeId !== memberId)
      .filter((nomination) => activeCategoryIds.has(nomination.categoryId))
      .map((nomination) => nomination.categoryId),
  );

  return categories
    .map((category) => category.id)
    .filter((categoryId) => submittedCategoryIds.has(categoryId));
}

/**
 * @param {{
 *   categories?: Array<{ id: string; active?: boolean; kind?: string; ballotScope?: string }>;
 *   memberId: string;
 *   nominations?: Array<{ categoryId: string; nomineeId?: string; nominatorId: string }>;
 * }} input
 * @returns {boolean}
 */
export function hasSubmittedCompleteNominationBallot(input) {
  const categories = input.categories ?? [];
  const activeCategoryIds = categories
    .filter(
      (category) =>
        category.active !== false &&
        (category.kind ?? "standard") !== "runoff" &&
        (category.ballotScope ?? "main") === "main",
    )
    .map((category) => category.id);

  if (activeCategoryIds.length === 0) return false;

  const submittedCategoryIds = getSubmittedNominationCategoryIds(input);

  return activeCategoryIds.every((categoryId) => submittedCategoryIds.includes(categoryId));
}

/**
 * @param {{
 *   category: { id: string; nomineeStaffScope?: string };
 *   members?: Array<{ id: string; awardsEligible?: boolean; staffType?: string; status?: string }>;
 *   nominations?: Array<{ categoryId: string; id?: string; nomineeId: string; nominatorId: string }>;
 * }} input
 * @returns {string[]}
 */
export function getInvalidNominationIdsForCategory({ category, members = [], nominations = [] }) {
  const memberById = new Map(members.map((member) => [member.id, member]));

  return nominations
    .filter((nomination) => nomination.categoryId === category.id)
    .filter((nomination) => {
      const nominee = memberById.get(nomination.nomineeId);

      return (
        nomination.nomineeId === nomination.nominatorId ||
        !activeMember(members, nomination.nomineeId) ||
        !memberMatchesNomineeStaffScope(nominee, category.nomineeStaffScope)
      );
    })
    .map((nomination) => nomination.id)
    .filter(Boolean)
    .sort();
}

export function groupNominationsByNominator(input) {
  const categories = input?.categories ?? [];
  const members = input?.members ?? [];
  const nominations = input?.nominations ?? [];
  const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const memberById = new Map(members.map((member) => [member.id, member]));
  const groups = new Map();

  for (const nomination of nominations) {
    const nominator = memberById.get(nomination.nominatorId);
    const nominee = memberById.get(nomination.nomineeId);
    const category = categoryById.get(nomination.categoryId);
    const group = groups.get(nomination.nominatorId) ?? {
      nominator,
      nominatorId: nomination.nominatorId,
      nominatorName: nominator?.name ?? "Member",
      nominations: [],
    };

    group.nominations.push({
      categoryId: nomination.categoryId,
      categoryTitle: category?.title ?? "Category",
      id: nomination.id,
      nominee,
      nomineeId: nomination.nomineeId,
      nomineeName: nominee?.name ?? "Nominee",
      statement: compactText(nomination.statement),
      status: nomination.status,
    });
    groups.set(nomination.nominatorId, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      nominations: group.nominations.sort((left, right) => {
        const leftIndex = categoryOrder.get(left.categoryId) ?? Number.MAX_SAFE_INTEGER;
        const rightIndex = categoryOrder.get(right.categoryId) ?? Number.MAX_SAFE_INTEGER;

        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return left.categoryTitle.localeCompare(right.categoryTitle);
      }),
    }))
    .sort((left, right) => left.nominatorName.localeCompare(right.nominatorName));
}

export function validateCategorySetup(input) {
  const nomineeStaffScope = input.nomineeStaffScope ?? "all";
  const category = {
    active: input.active !== false,
    description: compactText(input.description),
    finalistLimit: positiveInteger(input.finalistLimit, 0),
    nomineeStaffScope: normalizeNomineeStaffScope(nomineeStaffScope),
    nominationLimit: positiveInteger(input.nominationLimit, 0),
    nominationQuestion: compactText(input.nominationQuestion),
    title: compactText(input.title),
  };

  if (
    category.title.length < 2 ||
    category.description.length < 12 ||
    category.nominationQuestion.length < 8 ||
    category.nominationLimit < 1 ||
    category.finalistLimit < 1 ||
    !NOMINEE_STAFF_SCOPES.has(nomineeStaffScope)
  ) {
    return { ok: false, reason: "INVALID_CATEGORY_SETUP" };
  }

  return { ok: true, category };
}

export function validateNomination({
  members,
  category,
  existingNominations,
  nominatorId,
  nomineeId,
}) {
  if (!activeMember(members, nominatorId)) {
    return { ok: false, reason: "NOMINATOR_NOT_ACTIVE_MEMBER" };
  }

  if (!activeMember(members, nomineeId)) {
    return { ok: false, reason: "NOMINEE_NOT_ACTIVE_MEMBER" };
  }

  if (nominatorId === nomineeId) {
    return { ok: false, reason: "SELF_NOMINATION_NOT_ALLOWED" };
  }

  if (!memberMatchesNomineeStaffScope(findMember(members, nomineeId), category.nomineeStaffScope)) {
    return { ok: false, reason: "NOMINEE_OUT_OF_SCOPE" };
  }

  const nominationLimit = category.nominationLimit ?? 1;
  const submittedCount = nominationCountForNominator(
    existingNominations,
    category.id,
    nominatorId,
  );

  if (submittedCount >= nominationLimit) {
    return { ok: false, reason: "CATEGORY_NOMINATION_LIMIT_REACHED" };
  }

  return { ok: true };
}

export function validateNominationBatch({
  categories,
  existingNominations,
  members,
  nominations,
  nominatorId,
}) {
  const activeCategories = categories.filter(
    (category) =>
      category.active !== false &&
      (category.kind ?? "standard") !== "runoff" &&
      (category.ballotScope ?? "main") === "main",
  );
  const nominationByCategory = new Map();

  for (const nomination of nominations) {
    if (nominationByCategory.has(nomination.categoryId)) {
      return { ok: false, reason: "DUPLICATE_CATEGORY_NOMINATION" };
    }

    nominationByCategory.set(nomination.categoryId, nomination);
  }

  if (
    activeCategories.length === 0 ||
    activeCategories.some((category) => !nominationByCategory.get(category.id)?.nomineeId)
  ) {
    return { ok: false, reason: "INCOMPLETE_NOMINATION_BALLOT" };
  }

  const normalizedNominations = [];

  for (const category of activeCategories) {
    const nomination = nominationByCategory.get(category.id);
    const validation = validateNomination({
      category,
      existingNominations,
      members,
      nomineeId: nomination.nomineeId,
      nominatorId,
    });

    if (!validation.ok) return validation;

    normalizedNominations.push({
      categoryId: category.id,
      nomineeId: nomination.nomineeId,
      statement: compactText(nomination.statement),
    });
  }

  return { ok: true, nominations: normalizedNominations };
}

export function suggestFinalists({ members, category, nominations }) {
  const counts = new Map();
  const eligibleMembers = members.filter(
    (member) => member.status === "active" && member.awardsEligible !== false,
  );
  const eligibleMemberIds = new Set(eligibleMembers.map((member) => member.id));
  const eligibleNomineeIds = new Set(
    eligibleMembers
      .filter((member) => memberMatchesNomineeStaffScope(member, category.nomineeStaffScope))
      .map((member) => member.id),
  );

  for (const nomination of nominations) {
    if (nomination.categoryId !== category.id) continue;
    if (!eligibleMemberIds.has(nomination.nominatorId)) continue;
    if (!eligibleNomineeIds.has(nomination.nomineeId)) continue;

    counts.set(nomination.nomineeId, (counts.get(nomination.nomineeId) ?? 0) + 1);
  }

  const threshold = getNominationSupportThreshold(eligibleMemberIds.size);
  const rankedSuggestions = [...counts.entries()]
    .map(([nomineeId, nominationCount]) => {
      const member = findMember(members, nomineeId);

      return {
        nomineeId,
        displayName: member?.name ?? "Unknown member",
        nominationCount,
        eligible:
          member?.status === "active" &&
          member.awardsEligible !== false &&
          memberMatchesNomineeStaffScope(member, category.nomineeStaffScope),
      };
    })
    .filter((suggestion) => suggestion.eligible)
    .sort((left, right) => {
      if (right.nominationCount !== left.nominationCount) {
        return right.nominationCount - left.nominationCount;
      }

      return left.displayName.localeCompare(right.displayName);
    });
  const thresholdSuggestions = rankedSuggestions.filter(
    (suggestion) => suggestion.nominationCount >= threshold,
  );

  if (thresholdSuggestions.length > 0) return thresholdSuggestions;

  const topCount = rankedSuggestions[0]?.nominationCount ?? 0;

  return rankedSuggestions.filter((suggestion) => suggestion.nominationCount === topCount);
}

export function buildDraftFinalists({ categories, members, nominations }) {
  return categories
    .filter((category) => category.active !== false && (category.kind ?? "standard") !== "runoff")
    .flatMap((category) =>
      suggestFinalists({ category, members, nominations }).map((suggestion, index) => ({
        id: `${category.id}-draft-${index + 1}`,
        ballotScope: category.ballotScope ?? "main",
        categoryId: category.id,
        displayName: suggestion.displayName,
        nomineeId: suggestion.nomineeId,
        nominationCount: suggestion.nominationCount,
        status: "approved",
        summary: `${suggestion.nominationCount} nomination${
          suggestion.nominationCount === 1 ? "" : "s"
        } received.`,
      })),
    );
}

export function approveFinalists({ category, approvedById, suggestedFinalists }) {
  return suggestedFinalists
    .filter((suggestion) => suggestion.eligible)
    .map((suggestion, index) => ({
      id: `${category.id}-finalist-${index + 1}`,
      categoryId: category.id,
      nomineeId: suggestion.nomineeId,
      displayName: suggestion.displayName,
      nominationCount: suggestion.nominationCount,
      approvedById,
      status: "approved",
    }));
}

export function createVoteReceipt({
  ballotScope = "main",
  memberId,
  cycleId,
  categoryIds,
  submittedAt = new Date().toISOString(),
}) {
  return {
    id: `receipt-${cycleId}-${ballotScope}-${memberId}`,
    ballotScope,
    memberId,
    cycleId,
    categoryIds: [...categoryIds].sort(),
    submittedAt,
  };
}

/**
 * @param {{ categoryIds?: string[] } | null | undefined} receipt
 * @returns {string[]}
 */
export function getCompletedCategoryIds(receipt) {
  return Array.isArray(receipt?.categoryIds) ? [...new Set(receipt.categoryIds)].sort() : [];
}

/**
 * @param {{
 *   categories?: Array<{ id: string; nomineeStaffScope?: string }>;
 *   currentMemberId?: string;
 *   finalists?: Array<{ categoryId: string; id: string; nomineeId?: string; status?: string }>;
 *   members?: Array<{ id: string; awardsEligible?: boolean; staffType?: string; status?: string }>;
 * }} input
 */
export function buildVisibleBallotFinalists({
  categories = [],
  currentMemberId,
  finalists = [],
  members,
}) {
  const eligibleMemberIds =
    members?.length > 0
      ? new Set(
          members
            .filter(
              (member) =>
                member.status !== "inactive" && member.awardsEligible !== false,
            )
            .map((member) => member.id),
        )
      : null;
  const memberById = new Map((members ?? []).map((member) => [member.id, member]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  return finalists
    .filter((finalist) => finalist.status === "approved")
    .filter((finalist) => !currentMemberId || finalist.nomineeId !== currentMemberId)
    .filter((finalist) => !eligibleMemberIds || eligibleMemberIds.has(finalist.nomineeId))
    .filter((finalist) => {
      const category = categoryById.get(finalist.categoryId);
      if (!category) return true;

      return memberMatchesNomineeStaffScope(
        memberById.get(finalist.nomineeId),
        category.nomineeStaffScope,
      );
    });
}

/**
 * @param {{
 *   categories: Array<{ id: string; active?: boolean; nomineeStaffScope?: string }>;
 *   completedCategoryIds?: string[];
 *   currentMemberId?: string;
 *   finalists: Array<{ categoryId: string; id: string; nomineeId?: string; status?: string }>;
 *   members?: Array<{ id: string; awardsEligible?: boolean; staffType?: string; status?: string }>;
 *   selections: Record<string, string>;
 * }} input
 * @returns {{ ok: true; categoryIds: string[] } | { ok: false; reason: string }}
 */
export function validateBallotSelections({
  categories,
  completedCategoryIds = [],
  currentMemberId,
  finalists,
  members,
  selections,
}) {
  const completedCategoryIdSet = new Set(completedCategoryIds);
  const approvedFinalists = finalists.filter((finalist) => finalist.status === "approved");
  const approvedFinalistById = new Map(
    approvedFinalists.map((finalist) => [finalist.id, finalist]),
  );
  const visibleApprovedFinalists = buildVisibleBallotFinalists({
    categories,
    currentMemberId,
    finalists,
    members,
  });
  const visibleApprovedFinalistIds = new Set(
    visibleApprovedFinalists.map((finalist) => finalist.id),
  );

  for (const finalistId of Object.values(selections)) {
    const finalist = approvedFinalistById.get(finalistId);

    if (finalist && !visibleApprovedFinalistIds.has(finalist.id)) {
      return { ok: false, reason: "INVALID_FINALIST_SELECTION" };
    }
  }

  const ballotCategories = categories.filter(
    (category) =>
      category.active !== false &&
      !completedCategoryIdSet.has(category.id) &&
      visibleApprovedFinalists.some(
        (finalist) =>
          finalist.categoryId === category.id,
      ),
  );
  const categoryIds = ballotCategories.map((category) => category.id);
  const selectedCategoryIds = Object.keys(selections);

  if (selectedCategoryIds.some((categoryId) => completedCategoryIdSet.has(categoryId))) {
    return { ok: false, reason: "CATEGORY_ALREADY_SUBMITTED" };
  }

  if (
    categoryIds.length === 0 ||
    categoryIds.some((categoryId) => !selections[categoryId]) ||
    selectedCategoryIds.some((categoryId) => !categoryIds.includes(categoryId))
  ) {
    return { ok: false, reason: "INCOMPLETE_BALLOT" };
  }

  for (const categoryId of categoryIds) {
    const finalist = approvedFinalistById.get(selections[categoryId]);

    if (
      !finalist ||
      finalist.categoryId !== categoryId ||
      !visibleApprovedFinalistIds.has(finalist.id)
    ) {
      return { ok: false, reason: "INVALID_FINALIST_SELECTION" };
    }
  }

  return { ok: true, categoryIds };
}

export function recordAnonymousVotes({ receipt, selections, finalists }) {
  const finalistIds = new Set(finalists.map((finalist) => finalist.id));

  return selections.map((selection, index) => {
    if (!finalistIds.has(selection.finalistId)) {
      throw new Error(`Unknown finalist selected for ${selection.categoryId}`);
    }

    return {
      id: `vote-${receipt.cycleId}-${selection.categoryId}-${index + 1}`,
      ballotScope: receipt.ballotScope ?? "main",
      cycleId: receipt.cycleId,
      categoryId: selection.categoryId,
      finalistId: selection.finalistId,
      submittedAt: receipt.submittedAt,
    };
  });
}

export function calculateResults({ category, finalists, votes }) {
  const categoryVotes = votes.filter((vote) => vote.categoryId === category.id);
  const totals = finalists.map((finalist) => ({
    ...finalist,
    voteCount: categoryVotes.filter((vote) => vote.finalistId === finalist.id).length,
  }));

  const sortedTotals = [...totals].sort((left, right) => {
    if (right.voteCount !== left.voteCount) return right.voteCount - left.voteCount;
    return left.displayName.localeCompare(right.displayName);
  });

  const topCount = sortedTotals[0]?.voteCount ?? 0;
  const tiedFinalists = sortedTotals.filter((finalist) => finalist.voteCount === topCount);

  if (tiedFinalists.length > 1) {
    return {
      categoryId: category.id,
      status: "tie",
      totals: sortedTotals,
      tiedFinalists,
      winner: null,
    };
  }

  return {
    categoryId: category.id,
    status: "winner",
    totals: sortedTotals,
    tiedFinalists: [],
    winner: sortedTotals[0] ?? null,
  };
}

export function createResultCertificationSnapshot({ category, result }) {
  const totals = result.totals.map((finalist) => ({
    displayName: finalist.displayName,
    finalistId: finalist.id,
    voteCount: finalist.voteCount,
  }));
  const topCount = result.winner?.voteCount ?? result.tiedFinalists[0]?.voteCount ?? 0;

  if (!topCount) {
    return {
      status: "pending",
      tallySnapshot: {
        category: category.title,
        count: 0,
        leader: "Pending",
        status: "pending",
        totals,
      },
      winnerFinalistId: null,
    };
  }

  if (result.status === "tie") {
    return {
      status: "tie",
      tallySnapshot: {
        category: category.title,
        count: topCount,
        leader: "Tie",
        status: "tie-check",
        totals,
      },
      winnerFinalistId: null,
    };
  }

  return {
    status: "certified",
    tallySnapshot: {
      category: category.title,
      count: result.winner.voteCount,
      leader: result.winner.displayName,
      status: "ready",
      totals,
    },
    winnerFinalistId: result.winner.id,
  };
}

export function createAcceptedTieCertificationSnapshot({ category, result }) {
  const totals = result.totals.map((finalist) => ({
    displayName: finalist.displayName,
    finalistId: finalist.id,
    voteCount: finalist.voteCount,
  }));
  const tiedWinners = result.tiedFinalists.map((finalist) => ({
    displayName: finalist.displayName,
    finalistId: finalist.id,
    voteCount: finalist.voteCount,
  }));
  const topCount = tiedWinners[0]?.voteCount ?? 0;

  return {
    status: "published",
    tallySnapshot: {
      category: category.title,
      count: topCount,
      leader: tiedWinners.map((finalist) => finalist.displayName).join(", "),
      status: "published",
      tiedWinners,
      totals,
    },
    winnerFinalistId: null,
  };
}

export function createRunoffCategory({
  category,
  tiedFinalists,
  createdById,
  runoffCategoryId = `${category.id}-runoff`,
}) {
  const ballotScope = `runoff-${runoffCategoryId}`;

  return {
    category: {
      id: runoffCategoryId,
      active: true,
      ballotScope,
      createdById,
      finalistLimit: tiedFinalists.length,
      kind: "runoff",
      nominationLimit: 0,
      parentCategoryId: category.id,
      title: `${category.title} Runoff`,
    },
    finalists: tiedFinalists.map((finalist, index) => ({
      id: `${runoffCategoryId}-finalist-${index + 1}`,
      ballotScope,
      categoryId: runoffCategoryId,
      displayName: finalist.displayName,
      nomineeId: finalist.nomineeId ?? finalist.id,
      nominationCount: finalist.nominationCount ?? finalist.voteCount ?? 0,
      sourceFinalistId: finalist.id,
      status: "approved",
      summary: "Runoff finalist.",
    })),
  };
}

export function getUnresolvedTieCategoryIds({ categories, certifications }) {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const certificationsByCategory = new Map(
    certifications.map((certification) => [certification.categoryId, certification]),
  );

  return certifications
    .filter((certification) => ["tie", "runoff"].includes(certification.status))
    .filter((certification) => {
      const category = categoryById.get(certification.categoryId);
      if (!category || (category.kind ?? "standard") === "runoff") return false;

      const resolvedRunoff = categories
        .filter(
          (candidate) =>
            (candidate.kind ?? "standard") === "runoff" &&
            candidate.parentCategoryId === category.id,
        )
        .some((runoffCategory) => {
          const runoffCertification = certificationsByCategory.get(runoffCategory.id);
          return Boolean(runoffCertification?.winnerFinalistId);
        });

      return !resolvedRunoff;
    })
    .map((certification) => certification.categoryId);
}
