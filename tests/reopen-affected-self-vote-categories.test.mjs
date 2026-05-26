import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  planAffectedCategoryRevote,
  summarizeRevotePlan,
} from "../scripts/reopen-affected-self-vote-categories.mjs";

describe("affected self-vote category repair planning", () => {
  const categories = [
    { id: "cat-1", active: true, ballotScope: "main", title: "Leadership" },
    { id: "cat-2", active: true, ballotScope: "main", title: "Service" },
    { id: "cat-3", active: true, ballotScope: "runoff-cat-3", title: "Runoff" },
  ];
  const finalists = [
    { id: "fin-1", categoryId: "cat-1", nomineeId: "mem-1", status: "approved" },
    { id: "fin-2", categoryId: "cat-2", nomineeId: "mem-3", status: "approved" },
    { id: "fin-3", categoryId: "cat-3", nomineeId: "mem-2", status: "approved" },
  ];
  const votes = [
    { id: "vote-1", categoryId: "cat-1", ballotScope: "main" },
    { id: "vote-2", categoryId: "cat-2", ballotScope: "main" },
    { id: "vote-3", categoryId: "cat-3", ballotScope: "runoff-cat-3" },
  ];
  const voteReceipts = [
    {
      id: "receipt-1",
      ballotScope: "main",
      categoryIds: ["cat-1", "cat-2"],
      memberId: "mem-1",
    },
    {
      id: "receipt-2",
      ballotScope: "main",
      categoryIds: ["cat-2"],
      memberId: "mem-2",
    },
    {
      id: "receipt-3",
      ballotScope: "runoff-cat-3",
      categoryIds: ["cat-3"],
      memberId: "mem-2",
    },
  ];

  it("dry-run planning resets only affected categories and preserves unaffected receipt categories", () => {
    const plan = planAffectedCategoryRevote({
      ballotScope: "main",
      categories,
      finalists,
      voteReceipts,
      votes,
    });

    assert.deepEqual(plan.affectedCategoryIds, ["cat-1"]);
    assert.deepEqual(plan.deletedVoteIds, ["vote-1"]);
    assert.deepEqual(plan.receiptUpdates, [
      {
        categoryIds: ["cat-2"],
        id: "receipt-1",
        memberId: "mem-1",
      },
    ]);
    assert.deepEqual(plan.deletedReceiptIds, []);
    assert.deepEqual(summarizeRevotePlan(plan), {
      affectedCategoryCount: 1,
      affectedCategoryIds: ["cat-1"],
      deletedReceiptCount: 0,
      deletedVoteCount: 1,
      updatedReceiptCount: 1,
    });
  });

  it("deletes receipts that only covered affected categories", () => {
    const plan = planAffectedCategoryRevote({
      ballotScope: "runoff-cat-3",
      categories,
      finalists,
      voteReceipts,
      votes,
    });

    assert.deepEqual(plan.affectedCategoryIds, ["cat-3"]);
    assert.deepEqual(plan.deletedVoteIds, ["vote-3"]);
    assert.deepEqual(plan.receiptUpdates, []);
    assert.deepEqual(plan.deletedReceiptIds, ["receipt-3"]);
  });
});
