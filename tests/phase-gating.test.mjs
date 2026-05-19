import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getEffectiveCycleStage,
  getMemberPhaseAccess,
} from "../src/lib/awards/phase.mjs";

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

describe("effective cycle stage", () => {
  const completionCycle = {
    activeCategoryCount: 3,
    approvedCategoryCount: 0,
    configuredStage: "nominations",
    eligibleMemberCount: 4,
    nominationCompletionCount: 0,
    nominationsOpenAt: "2026-12-01T13:00:00.000Z",
    publishedAt: null,
    voteReceiptCount: 0,
    votingOpenAt: "2027-01-01T13:00:00.000Z",
  };

  it("keeps a prepared cycle in draft until an admin opens nominations", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        configuredStage: "draft",
        nominationCompletionCount: 4,
        approvedCategoryCount: 3,
        voteReceiptCount: 4,
      }),
      "Draft",
    );
  });

  it("opens nominations from the admin start and ignores future schedule dates", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        now: "2026-05-19T12:00:00.000Z",
      }),
      "Nominations",
    );
  });

  it("moves to review only after every eligible member completes every active category", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 3,
      }),
      "Nominations",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 4,
      }),
      "Review",
    );
  });

  it("opens voting only after finalists are approved for every active category", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 4,
        approvedCategoryCount: 2,
      }),
      "Review",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 4,
        approvedCategoryCount: 3,
      }),
      "Voting",
    );
  });

  it("moves to certification only after every eligible member votes", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 4,
        approvedCategoryCount: 3,
        voteReceiptCount: 3,
      }),
      "Voting",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...completionCycle,
        nominationCompletionCount: 4,
        approvedCategoryCount: 3,
        voteReceiptCount: 4,
      }),
      "Certification",
    );
  });

  it("shows published only after an admin publish timestamp exists", () => {
    const completeCycle = {
      ...completionCycle,
      approvedCategoryCount: 3,
      configuredStage: "published",
      nominationCompletionCount: 4,
      voteReceiptCount: 4,
    };

    assert.equal(
      getEffectiveCycleStage({
        ...completeCycle,
        now: "2026-06-29T12:00:00.000Z",
      }),
      "Certification",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...completeCycle,
        publishedAt: "2026-07-12T13:00:00.000Z",
        now: "2026-07-13T12:00:00.000Z",
      }),
      "Published",
    );
  });

  it("falls back to the old finalist count only when category completion counts are absent", () => {
    assert.equal(
      getEffectiveCycleStage({
        approvedFinalistCount: 2,
        configuredStage: "nominations",
        eligibleMemberCount: 2,
        nominationParticipantCount: 2,
        voteReceiptCount: 0,
      }),
      "Voting",
    );
  });
});

describe("legacy date fields", () => {
  const schedule = {
    activeCategoryCount: 2,
    approvedCategoryCount: 2,
    configuredStage: "nominations",
    eligibleMemberCount: 2,
    nominationCompletionCount: 2,
    publishedAt: null,
    voteReceiptCount: 0,
  };

  it("does not let old schedule windows close an incomplete voting phase", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        votingCloseAt: "2026-01-01T00:00:00.000Z",
        now: "2026-06-29T12:00:00.000Z",
      }),
      "Voting",
    );
  });
});
