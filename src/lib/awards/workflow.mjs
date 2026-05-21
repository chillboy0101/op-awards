function findMember(members, memberId) {
  return members.find((member) => member.id === memberId) ?? null;
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

export function buildNominationDirectory({ currentMemberId, members, query = "" }) {
  const normalizedQuery = query.trim().toLowerCase();

  return members
    .filter((member) => member.status === "active")
    .filter((member) => member.awardsEligible !== false)
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

export function buildAwardCategorySetup(input) {
  const title = compactText(input.title);
  const awardTitle = title || "Award";

  return {
    active: input.active !== false,
    description: `${awardTitle} award category.`,
    finalistLimit: positiveInteger(input.finalistLimit, 3),
    nominationLimit: 1,
    nominationQuestion: `Who should receive ${awardTitle}?`,
    title,
  };
}

export function formatCategoryVotingSummary(category) {
  const finalistLimit = positiveInteger(category.finalistLimit, 3);
  const nomineeLabel = finalistLimit === 1 ? "nominee" : "nominees";
  const verb = finalistLimit === 1 ? "moves" : "move";

  return `${finalistLimit} ${nomineeLabel} ${verb} to voting`;
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
  const category = {
    active: input.active !== false,
    description: compactText(input.description),
    finalistLimit: positiveInteger(input.finalistLimit, 0),
    nominationLimit: positiveInteger(input.nominationLimit, 0),
    nominationQuestion: compactText(input.nominationQuestion),
    title: compactText(input.title),
  };

  if (
    category.title.length < 2 ||
    category.description.length < 12 ||
    category.nominationQuestion.length < 8 ||
    category.nominationLimit < 1 ||
    category.finalistLimit < 1
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

  for (const nomination of nominations) {
    if (nomination.categoryId !== category.id) continue;
    counts.set(nomination.nomineeId, (counts.get(nomination.nomineeId) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([nomineeId, nominationCount]) => {
      const member = findMember(members, nomineeId);

      return {
        nomineeId,
        displayName: member?.name ?? "Unknown member",
        nominationCount,
        eligible: member?.status === "active" && member.awardsEligible !== false,
      };
    })
    .filter((suggestion) => suggestion.eligible)
    .sort((left, right) => {
      if (right.nominationCount !== left.nominationCount) {
        return right.nominationCount - left.nominationCount;
      }

      return left.displayName.localeCompare(right.displayName);
    })
    .slice(0, category.finalistLimit ?? 5);
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
        status: "draft",
        summary: `${suggestion.nominationCount} nomination${
          suggestion.nominationCount === 1 ? "" : "s"
        } received.`,
      })),
    );
}

export function approveFinalists({ category, approvedById, suggestedFinalists }) {
  return suggestedFinalists
    .filter((suggestion) => suggestion.eligible)
    .slice(0, category.finalistLimit ?? 5)
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

export function validateBallotSelections({
  categories,
  finalists,
  members,
  selections,
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
  const approvedFinalists = finalists.filter((finalist) => finalist.status === "approved");
  const approvedFinalistById = new Map(
    approvedFinalists.map((finalist) => [finalist.id, finalist]),
  );
  const visibleApprovedFinalists = approvedFinalists.filter(
    (finalist) =>
      (!eligibleMemberIds || eligibleMemberIds.has(finalist.nomineeId)),
  );

  for (const finalistId of Object.values(selections)) {
    const finalist = approvedFinalistById.get(finalistId);

    if (finalist && eligibleMemberIds && !eligibleMemberIds.has(finalist.nomineeId)) {
      return { ok: false, reason: "INVALID_FINALIST_SELECTION" };
    }
  }

  const ballotCategories = categories.filter(
    (category) =>
      category.active !== false &&
      visibleApprovedFinalists.some(
        (finalist) =>
          finalist.categoryId === category.id,
      ),
  );
  const categoryIds = ballotCategories.map((category) => category.id);

  if (
    categoryIds.length === 0 ||
    categoryIds.some((categoryId) => !selections[categoryId]) ||
    Object.keys(selections).some((categoryId) => !categoryIds.includes(categoryId))
  ) {
    return { ok: false, reason: "INCOMPLETE_BALLOT" };
  }

  for (const categoryId of categoryIds) {
    const finalist = approvedFinalistById.get(selections[categoryId]);

    if (
      !finalist ||
      finalist.categoryId !== categoryId ||
      (eligibleMemberIds && !eligibleMemberIds.has(finalist.nomineeId))
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
