function activeItems(items) {
  return items.filter(
    (item) =>
      item.active !== false &&
      item.status !== "inactive" &&
      item.awardsEligible !== false,
  );
}

function normalizeStaffType(value) {
  return ["main", "monitoring_only", "nss"].includes(value) ? value : "main";
}

function memberMatchesNomineeStaffScope(member, scope = "all") {
  const staffType = normalizeStaffType(member?.staffType);

  if (scope === "staff") return staffType === "main" || staffType === "monitoring_only";
  if (scope === "nss") return staffType === "nss";

  return true;
}

function countUnique(values) {
  return new Set(values.filter(Boolean)).size;
}

export function getCycleProgress({
  ballotScope = "main",
  categories = [],
  certifications = [],
  finalists = [],
  members = [],
  nominations = [],
  voteReceipts = [],
} = {}) {
  const activeMembers = activeItems(members);
  const activeCategories = activeItems(categories).filter(
    (category) => (category.ballotScope ?? "main") === ballotScope,
  );
  const activeMemberIds = new Set(activeMembers.map((member) => member.id));
  const activeCategoryIds = new Set(activeCategories.map((category) => category.id));
  const activeMemberById = new Map(activeMembers.map((member) => [member.id, member]));
  const nominationsByMember = new Map();
  let nominationSubmissionCount = 0;

  for (const nomination of nominations) {
    if (!activeMemberIds.has(nomination.nominatorId)) continue;
    if (!activeCategoryIds.has(nomination.categoryId)) continue;

    nominationSubmissionCount += 1;

    const categorySet = nominationsByMember.get(nomination.nominatorId) ?? new Set();
    categorySet.add(nomination.categoryId);
    nominationsByMember.set(nomination.nominatorId, categorySet);
  }

  const nominationCompletionCount = [...nominationsByMember.values()].filter(
    (categorySet) => categorySet.size >= activeCategoryIds.size && activeCategoryIds.size > 0,
  ).length;
  const approvedFinalists = finalists.filter(
    (finalist) =>
      finalist.status === "approved" && activeCategoryIds.has(finalist.categoryId),
  );
  const approvedCategoryCount = countUnique(
    approvedFinalists.map((finalist) => finalist.categoryId),
  );
  const certifiedCategoryCount = countUnique(
    certifications
      .filter(
        (certification) =>
          activeCategoryIds.has(certification.categoryId) &&
          ["certified", "published"].includes(certification.status),
      )
      .map((certification) => certification.categoryId),
  );
  const approvedFinalistsByCategoryId = new Map();
  for (const finalist of approvedFinalists) {
    const categoryFinalists = approvedFinalistsByCategoryId.get(finalist.categoryId) ?? [];
    categoryFinalists.push(finalist);
    approvedFinalistsByCategoryId.set(finalist.categoryId, categoryFinalists);
  }
  const requiredCategoryIdsByMemberId = new Map(
    activeMembers.map((member) => {
      const requiredCategoryIds = activeCategories
        .filter((category) => {
          const categoryFinalists = approvedFinalistsByCategoryId.get(category.id) ?? [];

          return categoryFinalists.some((finalist) => {
            if (finalist.nomineeId && finalist.nomineeId === member.id) return false;
            if (!finalist.nomineeId) return true;

            return memberMatchesNomineeStaffScope(
              activeMemberById.get(finalist.nomineeId),
              category.nomineeStaffScope,
            );
          });
        })
        .map((category) => category.id);

      return [member.id, requiredCategoryIds];
    }),
  );
  const voteReceiptCount = activeMembers.filter((member) => {
    const requiredCategoryIds = requiredCategoryIdsByMemberId.get(member.id) ?? [];
    if (requiredCategoryIds.length === 0) return true;

    const receipt = voteReceipts.find(
      (candidate) =>
        candidate.memberId === member.id &&
        (candidate.ballotScope ?? "main") === ballotScope,
    );
    if (!receipt) return false;

    const submittedCategoryIds = Array.isArray(receipt.categoryIds)
      ? receipt.categoryIds
      : [...activeCategoryIds];

    return requiredCategoryIds.every((categoryId) => submittedCategoryIds.includes(categoryId));
  }).length;

  return {
    activeCategoryCount: activeCategories.length,
    approvedCategoryCount,
    approvedFinalistCount: approvedFinalists.length,
    certifiedCategoryCount,
    eligibleMemberCount: activeMembers.length,
    nominationCompletionCount,
    nominationSubmissionCount,
    nominationsRequiredCount: activeMembers.length * activeCategories.length,
    voteReceiptCount,
    votingRequiredCount: activeMembers.length,
  };
}
