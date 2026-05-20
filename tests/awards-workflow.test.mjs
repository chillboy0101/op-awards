import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  approveFinalists,
  buildAwardCategorySetup,
  buildDraftFinalists,
  buildNominationDirectory,
  calculateResults,
  createResultCertificationSnapshot,
  createRunoffCategory,
  createVoteReceipt,
  getUnresolvedTieCategoryIds,
  recordAnonymousVotes,
  suggestFinalists,
  validateNominationBatch,
  validateBallotSelections,
  validateCategorySetup,
  validateNomination,
} from "../src/lib/awards/workflow.mjs";

const members = [
  { id: "mem-1", name: "Ari Morgan", email: "ari@cpa.test", status: "active" },
  { id: "mem-2", name: "Blair Chen", email: "blair@cpa.test", status: "active" },
  { id: "mem-3", name: "Casey Rivera", email: "casey@cpa.test", status: "inactive" },
  { id: "mem-4", name: "Devon Patel", email: "devon@cpa.test", status: "active" },
];

const category = {
  id: "cat-leadership",
  title: "Leadership Excellence",
  nominationLimit: 1,
  finalistLimit: 3,
};

describe("nomination validation", () => {
  it("accepts one peer nomination for an active O&P member", () => {
    const result = validateNomination({
      members,
      category,
      existingNominations: [],
      nominatorId: "mem-1",
      nomineeId: "mem-2",
    });

    assert.deepEqual(result, { ok: true });
  });

  it("rejects self-nominations, inactive nominees, and duplicate category nominations", () => {
    assert.equal(
      validateNomination({
        members,
        category,
        existingNominations: [],
        nominatorId: "mem-1",
        nomineeId: "mem-1",
      }).reason,
      "SELF_NOMINATION_NOT_ALLOWED",
    );

    assert.equal(
      validateNomination({
        members,
        category,
        existingNominations: [],
        nominatorId: "mem-1",
        nomineeId: "mem-3",
      }).reason,
      "NOMINEE_NOT_ACTIVE_MEMBER",
    );

    assert.equal(
      validateNomination({
        members,
        category,
        existingNominations: [
          {
            id: "nom-1",
            categoryId: "cat-leadership",
            nominatorId: "mem-1",
            nomineeId: "mem-2",
          },
        ],
        nominatorId: "mem-1",
        nomineeId: "mem-4",
      }).reason,
      "CATEGORY_NOMINATION_LIMIT_REACHED",
    );
  });
});

describe("nomination directory", () => {
  it("filters the signed-in member out of nomination search results", () => {
    const directory = buildNominationDirectory({
      currentMemberId: "mem-1",
      members,
      query: "ari",
    });

    assert.deepEqual(directory, []);
  });
});

describe("nomination ballot", () => {
  const categories = [
    { id: "cat-leadership", title: "Leadership Excellence", active: true, nominationLimit: 1 },
    { id: "cat-service", title: "Member Service", active: true, nominationLimit: 1 },
  ];

  it("requires one peer selection per active category and keeps reasons optional", () => {
    assert.deepEqual(
      validateNominationBatch({
        categories,
        existingNominations: [],
        members,
        nominations: [
          { categoryId: "cat-leadership", nomineeId: "mem-2", statement: "" },
        ],
        nominatorId: "mem-1",
      }),
      { ok: false, reason: "INCOMPLETE_NOMINATION_BALLOT" },
    );

    assert.deepEqual(
      validateNominationBatch({
        categories,
        existingNominations: [],
        members,
        nominations: [
          { categoryId: "cat-leadership", nomineeId: "mem-2", statement: "" },
          { categoryId: "cat-service", nomineeId: "mem-4", statement: "Helpful during clinics" },
        ],
        nominatorId: "mem-1",
      }),
      {
        ok: true,
        nominations: [
          { categoryId: "cat-leadership", nomineeId: "mem-2", statement: "" },
          { categoryId: "cat-service", nomineeId: "mem-4", statement: "Helpful during clinics" },
        ],
      },
    );
  });
});

describe("finalist workflow", () => {
  it("prepares draft finalists by category after nominations complete", () => {
    const serviceCategory = {
      id: "cat-service",
      title: "Member Service",
      nominationLimit: 1,
      finalistLimit: 2,
      active: true,
      ballotScope: "main",
    };
    const nominations = [
      { id: "nom-1", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-1" },
      { id: "nom-2", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-4" },
      { id: "nom-3", categoryId: category.id, nomineeId: "mem-4", nominatorId: "mem-2" },
      { id: "nom-4", categoryId: serviceCategory.id, nomineeId: "mem-1", nominatorId: "mem-2" },
      { id: "nom-5", categoryId: serviceCategory.id, nomineeId: "mem-4", nominatorId: "mem-1" },
      { id: "nom-6", categoryId: serviceCategory.id, nomineeId: "mem-4", nominatorId: "mem-2" },
    ];

    const drafts = buildDraftFinalists({
      categories: [{ ...category, active: true, ballotScope: "main" }, serviceCategory],
      members,
      nominations,
    });

    assert.deepEqual(
      drafts.map((draft) => ({
        ballotScope: draft.ballotScope,
        categoryId: draft.categoryId,
        displayName: draft.displayName,
        nominationCount: draft.nominationCount,
        status: draft.status,
      })),
      [
        {
          ballotScope: "main",
          categoryId: "cat-leadership",
          displayName: "Blair Chen",
          nominationCount: 2,
          status: "draft",
        },
        {
          ballotScope: "main",
          categoryId: "cat-leadership",
          displayName: "Devon Patel",
          nominationCount: 1,
          status: "draft",
        },
        {
          ballotScope: "main",
          categoryId: "cat-service",
          displayName: "Devon Patel",
          nominationCount: 2,
          status: "draft",
        },
        {
          ballotScope: "main",
          categoryId: "cat-service",
          displayName: "Ari Morgan",
          nominationCount: 1,
          status: "draft",
        },
      ],
    );
  });

  it("suggests finalists by nomination support and admin-approved finalist limit", () => {
    const nominations = [
      { id: "nom-1", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-1" },
      { id: "nom-2", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-4" },
      { id: "nom-3", categoryId: category.id, nomineeId: "mem-4", nominatorId: "mem-1" },
      { id: "nom-4", categoryId: category.id, nomineeId: "mem-1", nominatorId: "mem-2" },
      { id: "nom-5", categoryId: category.id, nomineeId: "mem-3", nominatorId: "mem-4" },
    ];

    const suggestions = suggestFinalists({ members, category, nominations });

    assert.deepEqual(
      suggestions.map((suggestion) => ({
        nomineeId: suggestion.nomineeId,
        nominationCount: suggestion.nominationCount,
        eligible: suggestion.eligible,
      })),
      [
        { nomineeId: "mem-2", nominationCount: 2, eligible: true },
        { nomineeId: "mem-1", nominationCount: 1, eligible: true },
        { nomineeId: "mem-4", nominationCount: 1, eligible: true },
      ],
    );

    const finalists = approveFinalists({
      category,
      approvedById: "admin-1",
      suggestedFinalists: suggestions,
    });

    assert.equal(finalists.length, 3);
    assert.ok(finalists.every((finalist) => finalist.status === "approved"));
  });
});

describe("category setup", () => {
  it("builds hidden defaults for a simple awards category form", () => {
    assert.deepEqual(
      buildAwardCategorySetup({
        active: true,
        finalistLimit: 5,
        title: "  Team Culture ",
      }),
      {
        active: true,
        description: "Team Culture award category.",
        finalistLimit: 5,
        nominationLimit: 1,
        nominationQuestion: "Who should receive Team Culture?",
        title: "Team Culture",
      },
    );
  });

  it("normalizes admin category setup and rejects invalid limits", () => {
    assert.deepEqual(
      validateCategorySetup({
        active: true,
        description: "  Recognizes practical service to the O&P community. ",
        finalistLimit: 4,
        nominationLimit: 2,
        nominationQuestion: " Who deserves this award? ",
        title: "  Community Impact ",
      }),
      {
        ok: true,
        category: {
          active: true,
          description: "Recognizes practical service to the O&P community.",
          finalistLimit: 4,
          nominationLimit: 2,
          nominationQuestion: "Who deserves this award?",
          title: "Community Impact",
        },
      },
    );

    assert.equal(
      validateCategorySetup({
        description: "Too short",
        finalistLimit: 0,
        nominationLimit: 0,
        nominationQuestion: "",
        title: "",
      }).reason,
      "INVALID_CATEGORY_SETUP",
    );
  });
});

describe("anonymous voting", () => {
  const finalists = [
    { id: "fin-1", categoryId: category.id, nomineeId: "mem-2", displayName: "Blair Chen" },
    { id: "fin-2", categoryId: category.id, nomineeId: "mem-4", displayName: "Devon Patel" },
  ];

  it("requires one approved finalist selection for every active ballot category", () => {
    const communityCategory = { id: "cat-community", active: true, title: "Community" };
    const serviceCategory = { id: "cat-service", active: true, title: "Service" };
    const approvedFinalists = [
      { id: "fin-1", categoryId: communityCategory.id, status: "approved" },
      { id: "fin-2", categoryId: serviceCategory.id, status: "approved" },
    ];

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory, serviceCategory],
        finalists: approvedFinalists,
        selections: {
          [communityCategory.id]: "fin-1",
        },
      }),
      { ok: false, reason: "INCOMPLETE_BALLOT" },
    );

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory, serviceCategory],
        finalists: approvedFinalists,
        selections: {
          [communityCategory.id]: "fin-2",
          [serviceCategory.id]: "fin-2",
        },
      }),
      { ok: false, reason: "INVALID_FINALIST_SELECTION" },
    );

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory, serviceCategory],
        finalists: approvedFinalists,
        selections: {
          [communityCategory.id]: "fin-1",
          [serviceCategory.id]: "fin-2",
        },
      }),
      { ok: true, categoryIds: [communityCategory.id, serviceCategory.id] },
    );
  });

  it("rejects a finalist selection for the signed-in member", () => {
    const communityCategory = { id: "cat-community", active: true, title: "Community" };
    const approvedFinalists = [
      { id: "fin-self", categoryId: communityCategory.id, nomineeId: "mem-1", status: "approved" },
      { id: "fin-peer", categoryId: communityCategory.id, nomineeId: "mem-2", status: "approved" },
    ];

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory],
        currentMemberId: "mem-1",
        finalists: approvedFinalists,
        selections: {
          [communityCategory.id]: "fin-self",
        },
      }),
      { ok: false, reason: "SELF_VOTE_NOT_ALLOWED" },
    );

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory],
        currentMemberId: "mem-1",
        finalists: approvedFinalists,
        selections: {
          [communityCategory.id]: "fin-peer",
        },
      }),
      { ok: true, categoryIds: [communityCategory.id] },
    );
  });

  it("creates a voter receipt without linking anonymous vote choices to the member", () => {
    const receipt = createVoteReceipt({
      ballotScope: "main",
      memberId: "mem-1",
      cycleId: "cycle-2026",
      categoryIds: [category.id],
      submittedAt: "2026-05-18T22:00:00.000Z",
    });

    const votes = recordAnonymousVotes({
      receipt,
      selections: [{ categoryId: category.id, finalistId: "fin-1" }],
      finalists,
    });

    assert.equal(receipt.memberId, "mem-1");
    assert.equal(receipt.ballotScope, "main");
    assert.equal(votes.length, 1);
    assert.equal(votes[0].ballotScope, "main");
    assert.equal(votes[0].finalistId, "fin-1");
    assert.equal(Object.hasOwn(votes[0], "memberId"), false);
    assert.equal(Object.hasOwn(votes[0], "receiptId"), false);
  });

  it("tallies winners, flags ties, and creates runoff categories when admins choose one", () => {
    const votes = [
      { id: "vote-1", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-1" },
      { id: "vote-2", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-2" },
    ];

    const result = calculateResults({ category, finalists, votes });

    assert.equal(result.status, "tie");
    assert.deepEqual(
      result.tiedFinalists.map((finalist) => finalist.id).sort(),
      ["fin-1", "fin-2"],
    );

    const runoff = createRunoffCategory({
      category,
      tiedFinalists: result.tiedFinalists,
      createdById: "admin-1",
      runoffCategoryId: "cat-leadership-runoff",
    });

    assert.equal(runoff.category.parentCategoryId, category.id);
    assert.equal(runoff.category.kind, "runoff");
    assert.equal(runoff.category.ballotScope, "runoff-cat-leadership-runoff");
    assert.deepEqual(
      runoff.finalists.map((finalist) => finalist.sourceFinalistId).sort(),
      ["fin-1", "fin-2"],
    );
    assert.ok(runoff.finalists.every((finalist) => finalist.status === "approved"));
  });

  it("creates certification snapshots with winners, ties, and no-vote pending states", () => {
    const winnerResult = calculateResults({
      category,
      finalists,
      votes: [
        { id: "vote-1", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-1" },
        { id: "vote-2", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-1" },
        { id: "vote-3", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-2" },
      ],
    });

    assert.deepEqual(createResultCertificationSnapshot({ category, result: winnerResult }), {
      status: "certified",
      tallySnapshot: {
        category: "Leadership Excellence",
        count: 2,
        leader: "Blair Chen",
        status: "ready",
        totals: [
          { displayName: "Blair Chen", finalistId: "fin-1", voteCount: 2 },
          { displayName: "Devon Patel", finalistId: "fin-2", voteCount: 1 },
        ],
      },
      winnerFinalistId: "fin-1",
    });

    const tieResult = calculateResults({
      category,
      finalists,
      votes: [
        { id: "vote-1", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-1" },
        { id: "vote-2", cycleId: "cycle-2026", categoryId: category.id, finalistId: "fin-2" },
      ],
    });

    assert.equal(createResultCertificationSnapshot({ category, result: tieResult }).status, "tie");
    assert.equal(
      createResultCertificationSnapshot({ category, result: tieResult }).winnerFinalistId,
      null,
    );

    const noVoteResult = calculateResults({ category, finalists, votes: [] });
    assert.equal(
      createResultCertificationSnapshot({ category, result: noVoteResult }).status,
      "pending",
    );
  });

  it("treats tied main categories without certified runoffs as unresolved", () => {
    assert.deepEqual(
      getUnresolvedTieCategoryIds({
        categories: [category],
        certifications: [
          {
            categoryId: category.id,
            status: "tie",
            winnerFinalistId: null,
          },
        ],
      }),
      [category.id],
    );

    assert.deepEqual(
      getUnresolvedTieCategoryIds({
        categories: [
          category,
          {
            id: "cat-leadership-runoff",
            parentCategoryId: category.id,
            ballotScope: "runoff-cat-leadership-runoff",
            kind: "runoff",
          },
        ],
        certifications: [
          {
            categoryId: category.id,
            status: "runoff",
            winnerFinalistId: null,
          },
          {
            categoryId: "cat-leadership-runoff",
            status: "certified",
            winnerFinalistId: "fin-runoff-1",
          },
        ],
      }),
      [],
    );
  });
});
