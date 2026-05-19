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
  const schedule = {
    configuredStage: "draft",
    nominationsOpenAt: "2026-05-20T13:00:00.000Z",
    nominationsCloseAt: "2026-06-10T23:59:59.000Z",
    votingOpenAt: "2026-06-18T13:00:00.000Z",
    votingCloseAt: "2026-06-28T23:59:59.000Z",
    publishedAt: null,
  };

  it("derives upcoming, nomination, review, voting, and certification from dates", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        now: "2026-05-19T12:00:00.000Z",
      }),
      "Draft",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        now: "2026-05-21T12:00:00.000Z",
      }),
      "Nominations",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        now: "2026-06-12T12:00:00.000Z",
      }),
      "Review",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        now: "2026-06-20T12:00:00.000Z",
      }),
      "Voting",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        now: "2026-06-29T12:00:00.000Z",
      }),
      "Certification",
    );
  });

  it("keeps the portal in review during voting dates until finalists are approved", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 0,
        now: "2026-06-20T12:00:00.000Z",
      }),
      "Review",
    );
  });

  it("shows published only after an admin publish timestamp exists", () => {
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        configuredStage: "published",
        now: "2026-06-29T12:00:00.000Z",
      }),
      "Certification",
    );
    assert.equal(
      getEffectiveCycleStage({
        ...schedule,
        approvedFinalistCount: 4,
        publishedAt: "2026-07-12T13:00:00.000Z",
        now: "2026-07-13T12:00:00.000Z",
      }),
      "Published",
    );
  });
});
