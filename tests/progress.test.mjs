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

  it("counts approved finalist categories and active member vote receipts", () => {
    const progress = getCycleProgress({
      categories,
      finalists: [
        { categoryId: "cat-1", status: "approved" },
        { categoryId: "cat-2", status: "draft" },
        { categoryId: "cat-3", status: "approved" },
      ],
      members,
      voteReceipts: [
        { memberId: "mem-1" },
        { memberId: "mem-3" },
      ],
    });

    assert.equal(progress.approvedCategoryCount, 1);
    assert.equal(progress.approvedFinalistCount, 1);
    assert.equal(progress.voteReceiptCount, 1);
    assert.equal(progress.votingRequiredCount, 2);
  });
});
