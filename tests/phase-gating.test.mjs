import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMemberPhaseAccess } from "../src/lib/awards/phase.mjs";

describe("member phase gating", () => {
  it("shows nominations only during the nominations stage", () => {
    assert.deepEqual(getMemberPhaseAccess("Nominations"), {
      canNominate: true,
      canVote: false,
      currentTask: "nomination",
      label: "Nominations",
      message: "Nominations are open.",
    });
  });

  it("shows voting only during the voting stage", () => {
    assert.deepEqual(getMemberPhaseAccess("voting"), {
      canNominate: false,
      canVote: true,
      currentTask: "voting",
      label: "Voting",
      message: "Voting is open.",
    });
  });

  it("shows a short status message outside member action stages", () => {
    assert.deepEqual(getMemberPhaseAccess("Review"), {
      canNominate: false,
      canVote: false,
      currentTask: "status",
      label: "Review",
      message: "Nominations are being reviewed.",
    });
  });
});
