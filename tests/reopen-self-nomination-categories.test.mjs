import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  planSelfNominationRepair,
  summarizeSelfNominationRepair,
} from "../scripts/reopen-self-nomination-categories.mjs";

describe("self-nomination repair planning", () => {
  it("deletes only self-nominations and reports affected nominators/categories", () => {
    const plan = planSelfNominationRepair({
      nominations: [
        {
          id: "nom-1",
          categoryId: "cat-worker",
          nomineeId: "mem-1",
          nominatorId: "mem-1",
        },
        {
          id: "nom-2",
          categoryId: "cat-nsp",
          nomineeId: "mem-2",
          nominatorId: "mem-1",
        },
        {
          id: "nom-3",
          categoryId: "cat-nsp",
          nomineeId: "mem-3",
          nominatorId: "mem-3",
        },
      ],
    });

    assert.deepEqual(plan, {
      affectedCategoryIds: ["cat-nsp", "cat-worker"],
      affectedNominatorIds: ["mem-1", "mem-3"],
      deletedNominationIds: ["nom-1", "nom-3"],
    });
    assert.deepEqual(summarizeSelfNominationRepair(plan), {
      affectedCategoryCount: 2,
      affectedCategoryIds: ["cat-nsp", "cat-worker"],
      affectedNominatorCount: 2,
      deletedNominationCount: 2,
    });
  });
});
