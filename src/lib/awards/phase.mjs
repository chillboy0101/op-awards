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
  approvedFinalistCount = 0,
  configuredStage = "draft",
  nominationsCloseAt,
  nominationsOpenAt,
  now = new Date(),
  publishedAt,
  votingCloseAt,
  votingOpenAt,
}) {
  const currentDate = toDate(now) ?? new Date();
  const publishedDate = toDate(publishedAt);

  if (publishedDate && publishedDate <= currentDate) return "Published";

  const nominationsOpenDate = toDate(nominationsOpenAt);
  const nominationsCloseDate = toDate(nominationsCloseAt);
  const votingOpenDate = toDate(votingOpenAt);
  const votingCloseDate = toDate(votingCloseAt);

  if (nominationsOpenDate && currentDate < nominationsOpenDate) return "Draft";
  if (
    nominationsOpenDate &&
    currentDate >= nominationsOpenDate &&
    (!nominationsCloseDate || currentDate <= nominationsCloseDate)
  ) {
    return "Nominations";
  }
  if (votingOpenDate && currentDate < votingOpenDate) return "Review";
  if (
    votingOpenDate &&
    currentDate >= votingOpenDate &&
    (!votingCloseDate || currentDate <= votingCloseDate)
  ) {
    return approvedFinalistCount > 0 ? "Voting" : "Review";
  }
  if (votingCloseDate && currentDate > votingCloseDate) return "Certification";

  return normalizeAwardStage(configuredStage);
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
