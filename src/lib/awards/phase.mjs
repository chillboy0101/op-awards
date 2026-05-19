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

export function normalizeAwardStage(stage) {
  if (typeof stage !== "string") return "Draft";

  const normalized = stage.trim().toLowerCase();
  return stageLabels[normalized] ?? "Draft";
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
