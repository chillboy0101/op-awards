import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getCycleProgress } from "../src/lib/awards/progress.mjs";

describe("cycle completion progress", () => {
  const members = [
    { id: "mem-1", status: "active" },
    { id: "mem-2", status: "active" },
    { id: "mem-3", status: "inactive" },
  ];
  const categories = [
    { id: "cat-1", active: true },
    { id: "cat-2", active: true },
    { id: "cat-3", active: false },
  ];

  it("counts a nomination-complete member only after every active category is covered", () => {
    const progress = getCycleProgress({
      categories,
      members,
      nominations: [
        { categoryId: "cat-1", nominatorId: "mem-1" },
        { categoryId: "cat-2", nominatorId: "mem-1" },
        { categoryId: "cat-1", nominatorId: "mem-2" },
        { categoryId: "cat-3", nominatorId: "mem-2" },
        { categoryId: "cat-1", nominatorId: "mem-3" },
      ],
    });

    assert.equal(progress.eligibleMemberCount, 2);
    assert.equal(progress.activeCategoryCount, 2);
    assert.equal(progress.nominationSubmissionCount, 3);
    assert.equal(progress.nominationCompletionCount, 1);
    assert.equal(progress.nominationsRequiredCount, 4);
  });

  it("does not count historical self-nominations toward nomination progress", () => {
    const progress = getCycleProgress({
      categories,
      members,
      nominations: [
        { categoryId: "cat-1", nomineeId: "mem-1", nominatorId: "mem-1" },
        { categoryId: "cat-2", nomineeId: "mem-2", nominatorId: "mem-1" },
      ],
    });

    assert.equal(progress.nominationSubmissionCount, 1);
    assert.equal(progress.nominationCompletionCount, 0);
  });

  it("counts approved finalist categories and active member vote receipts", () => {
    const progress = getCycleProgress({
      ballotScope: "main",
      categories,
      finalists: [
        { categoryId: "cat-1", status: "approved", ballotScope: "main" },
        { categoryId: "cat-2", status: "draft", ballotScope: "main" },
        { categoryId: "cat-3", status: "approved", ballotScope: "main" },
      ],
      members,
      voteReceipts: [
        { memberId: "mem-1", ballotScope: "main" },
        { memberId: "mem-2", ballotScope: "runoff-cat-1" },
        { memberId: "mem-3", ballotScope: "main" },
      ],
    });

    assert.equal(progress.approvedCategoryCount, 1);
    assert.equal(progress.approvedFinalistCount, 1);
    assert.equal(progress.voteReceiptCount, 1);
    assert.equal(progress.votingRequiredCount, 2);
  });

  it("counts a voter complete only when their receipt covers every required visible category", () => {
    const progress = getCycleProgress({
      ballotScope: "main",
      categories: [
        { id: "cat-1", active: true, ballotScope: "main" },
        { id: "cat-2", active: true, ballotScope: "main" },
      ],
      finalists: [
        { id: "fin-1", categoryId: "cat-1", nomineeId: "mem-2", status: "approved" },
        { id: "fin-2", categoryId: "cat-2", nomineeId: "mem-1", status: "approved" },
        { id: "fin-3", categoryId: "cat-2", nomineeId: "mem-3", status: "approved" },
      ],
      members,
      voteReceipts: [
        { memberId: "mem-1", ballotScope: "main", categoryIds: ["cat-1"] },
        { memberId: "mem-2", ballotScope: "main", categoryIds: ["cat-1", "cat-2"] },
      ],
    });

    assert.equal(progress.voteReceiptCount, 1);
    assert.equal(progress.votingRequiredCount, 2);
  });

  it("does not mark every voter complete before finalists exist", () => {
    const progress = getCycleProgress({
      ballotScope: "main",
      categories,
      members,
      nominations: [
        { categoryId: "cat-1", nominatorId: "mem-1" },
        { categoryId: "cat-2", nominatorId: "mem-1" },
      ],
      voteReceipts: [],
    });

    assert.equal(progress.approvedFinalistCount, 0);
    assert.equal(progress.voteReceiptCount, 0);
    assert.equal(progress.votingRequiredCount, 2);
  });

  it("counts only categories and receipts in the requested ballot scope", () => {
    const progress = getCycleProgress({
      ballotScope: "runoff-cat-1",
      categories: [
        { id: "cat-1", active: true, ballotScope: "main" },
        { id: "cat-1-runoff", active: true, ballotScope: "runoff-cat-1" },
      ],
      finalists: [
        { categoryId: "cat-1", status: "approved", ballotScope: "main" },
        { categoryId: "cat-1-runoff", status: "approved", ballotScope: "runoff-cat-1" },
      ],
      members,
      voteReceipts: [
        { memberId: "mem-1", ballotScope: "main" },
        { memberId: "mem-1", ballotScope: "runoff-cat-1" },
        { memberId: "mem-2", ballotScope: "runoff-cat-1" },
      ],
    });

    assert.equal(progress.activeCategoryCount, 1);
    assert.equal(progress.approvedCategoryCount, 1);
    assert.equal(progress.voteReceiptCount, 2);
  });

  it("counts only members currently eligible to participate", () => {
    const progress = getCycleProgress({
      categories,
      members: [
        { id: "mem-1", awardsEligible: true, status: "active" },
        { id: "mem-2", awardsEligible: false, status: "active" },
        { id: "mem-3", awardsEligible: true, status: "inactive" },
      ],
      finalists: [
        { categoryId: "cat-1", status: "approved" },
      ],
      nominations: [
        { categoryId: "cat-1", nominatorId: "mem-1" },
        { categoryId: "cat-2", nominatorId: "mem-1" },
        { categoryId: "cat-1", nominatorId: "mem-2" },
        { categoryId: "cat-2", nominatorId: "mem-2" },
      ],
      voteReceipts: [
        { memberId: "mem-1", ballotScope: "main" },
        { memberId: "mem-2", ballotScope: "main" },
      ],
    });

    assert.equal(progress.eligibleMemberCount, 1);
    assert.equal(progress.nominationCompletionCount, 1);
    assert.equal(progress.nominationsRequiredCount, 2);
    assert.equal(progress.voteReceiptCount, 1);
    assert.equal(progress.votingRequiredCount, 1);
  });
});
