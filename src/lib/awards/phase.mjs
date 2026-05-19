const stageLabels = {
  certification: "Certification",
  draft: "Draft",
  nominations: "Nominations",
  published: "Published",
  review: "Review",
  voting: "Voting",
};

const statusMessages = {
  Certification: "Results are being certified.",
  Draft: "This awards cycle is being prepared.",
  Published: "Winners have been published.",
  Review: "Nominations are being reviewed.",
};

function toDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeAwardStage(stage) {
  if (typeof stage !== "string") return "Draft";

  const normalized = stage.trim().toLowerCase();
  return stageLabels[normalized] ?? "Draft";
}

export function getEffectiveCycleStage({
  activeCategoryCount,
  approvedCategoryCount,
  approvedFinalistCount = 0,
  configuredStage = "draft",
  eligibleMemberCount = 0,
  nominationCompletionCount,
  nominationParticipantCount = 0,
  now = new Date(),
  publishedAt,
  voteReceiptCount = 0,
} = {}) {
  const currentDate = toDate(now) ?? new Date();
  const publishedDate = toDate(publishedAt);

  if (publishedDate && publishedDate <= currentDate) return "Published";

  const configured = normalizeAwardStage(configuredStage);
  if (configured === "Draft") return "Draft";

  const eligibleCount = Math.max(0, Number(eligibleMemberCount) || 0);
  const hasCategoryCount =
    typeof activeCategoryCount === "number" && Number.isFinite(activeCategoryCount);
  const categoryCount = Math.max(0, Number(activeCategoryCount) || 0);
  const completedNominators = Math.max(
    0,
    Number(nominationCompletionCount ?? nominationParticipantCount) || 0,
  );
  const nominationsComplete =
    eligibleCount > 0 &&
    (!hasCategoryCount || categoryCount > 0) &&
    completedNominators >= eligibleCount;

  if (!nominationsComplete) return "Nominations";

  const hasApprovedCategoryCount =
    typeof approvedCategoryCount === "number" && Number.isFinite(approvedCategoryCount);
  const reviewedCategories = Math.max(0, Number(approvedCategoryCount) || 0);
  const approvedFinalists = Math.max(0, Number(approvedFinalistCount) || 0);
  const finalistsApproved = hasCategoryCount
    ? categoryCount > 0 && hasApprovedCategoryCount && reviewedCategories >= categoryCount
    : approvedFinalists > 0;

  if (!finalistsApproved) return "Review";

  const completedBallots = Math.max(0, Number(voteReceiptCount) || 0);
  if (eligibleCount === 0 || completedBallots < eligibleCount) return "Voting";

  return "Certification";
}

export function getMemberPhaseAccess(stage) {
  const label = normalizeAwardStage(stage);

  if (label === "Nominations") {
    return {
      canNominate: true,
      canVote: false,
      currentTask: "nomination",
      label,
      message: "Nominations are open.",
    };
  }

  if (label === "Voting") {
    return {
      canNominate: false,
      canVote: true,
      currentTask: "voting",
      label,
      message: "Voting is open.",
    };
  }

  return {
    canNominate: false,
    canVote: false,
    currentTask: "status",
    label,
    message: statusMessages[label] ?? "This awards cycle is not open yet.",
  };
}
