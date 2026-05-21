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
  formatCategoryVotingSummary,
  getIncompleteBallotCategoryTitles,
  getNominationSupportThreshold,
  getResetCategoryIds,
  getSubmittedNominationCategoryIds,
  getUnresolvedTieCategoryIds,
  groupNominationsByNominator,
  recordAnonymousVotes,
  suggestFinalists,
  toggleSelection,
  hasSubmittedCompleteNominationBallot,
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

  it("allows self-nominations but still rejects inactive nominees and duplicate category nominations", () => {
    assert.deepEqual(
      validateNomination({
        members,
        category,
        existingNominations: [],
        nominatorId: "mem-1",
        nomineeId: "mem-1",
      }),
      { ok: true },
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

  it("rejects excluded nominators and nominees", () => {
    const roster = [
      { id: "mem-1", name: "Ari Morgan", email: "ari@cpa.test", awardsEligible: true, status: "active" },
      { id: "mem-2", name: "Blair Chen", email: "blair@cpa.test", awardsEligible: false, status: "active" },
      { id: "mem-4", name: "Devon Patel", email: "devon@cpa.test", awardsEligible: true, status: "active" },
    ];

    assert.equal(
      validateNomination({
        members: roster,
        category,
        existingNominations: [],
        nominatorId: "mem-2",
        nomineeId: "mem-4",
      }).reason,
      "NOMINATOR_NOT_ACTIVE_MEMBER",
    );

    assert.equal(
      validateNomination({
        members: roster,
        category,
        existingNominations: [],
        nominatorId: "mem-1",
        nomineeId: "mem-2",
      }).reason,
      "NOMINEE_NOT_ACTIVE_MEMBER",
    );
  });
});

describe("nomination directory", () => {
  it("toggles a selected person off when they are tapped again", () => {
    assert.equal(toggleSelection("", "mem-1"), "mem-1");
    assert.equal(toggleSelection("mem-1", "mem-1"), "");
    assert.equal(toggleSelection("mem-1", "mem-2"), "mem-2");
  });

  it("includes the signed-in member as a selectable nomination candidate", () => {
    const directory = buildNominationDirectory({
      currentMemberId: "mem-1",
      members,
      query: "ari",
    });

    assert.deepEqual(
      directory.map((member) => ({
        id: member.id,
        isSelf: member.isSelf,
        selectable: member.selectable,
      })),
      [{ id: "mem-1", isSelf: true, selectable: true }],
    );
  });

  it("filters excluded members out of nomination search results", () => {
    const directory = buildNominationDirectory({
      currentMemberId: "mem-1",
      members: [
        ...members,
        {
          id: "mem-5",
          name: "Excluded Member",
          email: "excluded@cpa.test",
          awardsEligible: false,
          status: "active",
        },
      ],
      query: "excluded",
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

  it("accepts self-selection inside a complete nomination ballot", () => {
    assert.deepEqual(
      validateNominationBatch({
        categories,
        existingNominations: [],
        members,
        nominations: [
          { categoryId: "cat-leadership", nomineeId: "mem-1", statement: "Leading the work" },
          { categoryId: "cat-service", nomineeId: "mem-4", statement: "" },
        ],
        nominatorId: "mem-1",
      }),
      {
        ok: true,
        nominations: [
          { categoryId: "cat-leadership", nomineeId: "mem-1", statement: "Leading the work" },
          { categoryId: "cat-service", nomineeId: "mem-4", statement: "" },
        ],
      },
    );
  });

  it("detects when a member has already submitted every active nomination category", () => {
    const submittedCategoryIds = getSubmittedNominationCategoryIds({
      categories: [
        ...categories,
        { id: "cat-hidden", title: "Hidden", active: false, nominationLimit: 1 },
      ],
      memberId: "mem-1",
      nominations: [
        { id: "nom-1", categoryId: "cat-service", nomineeId: "mem-2", nominatorId: "mem-1" },
        { id: "nom-2", categoryId: "cat-leadership", nomineeId: "mem-4", nominatorId: "mem-1" },
        { id: "nom-3", categoryId: "cat-hidden", nomineeId: "mem-4", nominatorId: "mem-1" },
      ],
    });

    assert.deepEqual(submittedCategoryIds, ["cat-leadership", "cat-service"]);
    assert.equal(
      hasSubmittedCompleteNominationBallot({
        categories,
        memberId: "mem-1",
        nominations: [
          { id: "nom-1", categoryId: "cat-service", nomineeId: "mem-2", nominatorId: "mem-1" },
          { id: "nom-2", categoryId: "cat-leadership", nomineeId: "mem-4", nominatorId: "mem-1" },
        ],
      }),
      true,
    );
    assert.equal(
      hasSubmittedCompleteNominationBallot({
        categories,
        memberId: "mem-2",
        nominations: [
          { id: "nom-1", categoryId: "cat-service", nomineeId: "mem-2", nominatorId: "mem-2" },
        ],
      }),
      false,
    );
  });
});

describe("finalist workflow", () => {
  it("calculates the automatic nomination threshold from eligible members", () => {
    assert.equal(getNominationSupportThreshold(4), 2);
    assert.equal(getNominationSupportThreshold(16), 3);
    assert.equal(getNominationSupportThreshold(30), 5);
  });

  it("prepares approved voting nominees automatically after nominations complete", () => {
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
          status: "approved",
        },
        {
          ballotScope: "main",
          categoryId: "cat-service",
          displayName: "Devon Patel",
          nominationCount: 2,
          status: "approved",
        },
      ],
    );
  });

  it("selects every nominee meeting the threshold without applying the fixed finalist limit", () => {
    const eligibleMembers = Array.from({ length: 16 }, (_, index) => ({
      id: `mem-${index + 1}`,
      name: `Member ${index + 1}`,
      email: `member-${index + 1}@cpa.test`,
      status: "active",
    }));
    const cappedCategory = { ...category, finalistLimit: 1 };
    const nominations = [
      { id: "nom-1", categoryId: category.id, nomineeId: "mem-1", nominatorId: "mem-4" },
      { id: "nom-2", categoryId: category.id, nomineeId: "mem-1", nominatorId: "mem-5" },
      { id: "nom-3", categoryId: category.id, nomineeId: "mem-1", nominatorId: "mem-6" },
      { id: "nom-4", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-7" },
      { id: "nom-5", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-8" },
      { id: "nom-6", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-9" },
      { id: "nom-7", categoryId: category.id, nomineeId: "mem-3", nominatorId: "mem-10" },
      { id: "nom-8", categoryId: category.id, nomineeId: "mem-3", nominatorId: "mem-11" },
    ];

    const suggestions = suggestFinalists({
      category: cappedCategory,
      members: eligibleMembers,
      nominations,
    });

    assert.deepEqual(
      suggestions.map((suggestion) => ({
        nomineeId: suggestion.nomineeId,
        nominationCount: suggestion.nominationCount,
      })),
      [
        { nomineeId: "mem-1", nominationCount: 3 },
        { nomineeId: "mem-2", nominationCount: 3 },
      ],
    );
  });

  it("falls back to all top-tied nominees when nobody reaches the threshold", () => {
    const nominations = [
      { id: "nom-1", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-1" },
      { id: "nom-2", categoryId: category.id, nomineeId: "mem-4", nominatorId: "mem-2" },
    ];

    const suggestions = suggestFinalists({ members, category, nominations });

    assert.deepEqual(
      suggestions.map((suggestion) => ({
        nomineeId: suggestion.nomineeId,
        nominationCount: suggestion.nominationCount,
      })),
      [
        { nomineeId: "mem-2", nominationCount: 1 },
        { nomineeId: "mem-4", nominationCount: 1 },
      ],
    );
  });

  it("keeps approveFinalists as a compatibility helper without fixed caps", () => {
    const suggestions = [
      { nomineeId: "mem-1", displayName: "Ari Morgan", nominationCount: 3, eligible: true },
      { nomineeId: "mem-2", displayName: "Blair Chen", nominationCount: 3, eligible: true },
    ];

    const finalists = approveFinalists({
      category: { ...category, finalistLimit: 1 },
      approvedById: "admin-1",
      suggestedFinalists: suggestions,
    });

    assert.equal(finalists.length, 2);
    assert.ok(finalists.every((finalist) => finalist.status === "approved"));
  });

  it("does not count excluded nominators or excluded nominees", () => {
    const suggestions = suggestFinalists({
      members: [
        { id: "mem-1", name: "Ari Morgan", email: "ari@cpa.test", awardsEligible: true, status: "active" },
        { id: "mem-2", name: "Blair Chen", email: "blair@cpa.test", awardsEligible: false, status: "active" },
        { id: "mem-4", name: "Devon Patel", email: "devon@cpa.test", awardsEligible: true, status: "active" },
      ],
      category,
      nominations: [
        { id: "nom-1", categoryId: category.id, nomineeId: "mem-2", nominatorId: "mem-1" },
        { id: "nom-2", categoryId: category.id, nomineeId: "mem-1", nominatorId: "mem-2" },
        { id: "nom-3", categoryId: category.id, nomineeId: "mem-4", nominatorId: "mem-1" },
      ],
    });

    assert.deepEqual(
      suggestions.map((suggestion) => suggestion.nomineeId),
      ["mem-4"],
    );
  });
});

describe("admin nomination review", () => {
  it("groups a member's complete nomination ballot into one review card", () => {
    const groups = groupNominationsByNominator({
      categories: [
        { id: "cat-service", title: "Member Service" },
        { id: "cat-leadership", title: "Leadership Excellence" },
      ],
      members,
      nominations: [
        {
          id: "nom-1",
          categoryId: "cat-leadership",
          nomineeId: "mem-2",
          nominatorId: "mem-1",
          statement: "Strong leadership",
        },
        {
          id: "nom-2",
          categoryId: "cat-service",
          nomineeId: "mem-4",
          nominatorId: "mem-1",
          statement: "",
        },
        {
          id: "nom-3",
          categoryId: "cat-service",
          nomineeId: "mem-1",
          nominatorId: "mem-2",
          statement: "Reliable support",
        },
      ],
    });

    assert.deepEqual(
      groups.map((group) => ({
        nominatorName: group.nominatorName,
        nominations: group.nominations.map((nomination) => ({
          categoryTitle: nomination.categoryTitle,
          nomineeName: nomination.nomineeName,
          statement: nomination.statement,
        })),
      })),
      [
        {
          nominatorName: "Ari Morgan",
          nominations: [
            {
              categoryTitle: "Member Service",
              nomineeName: "Devon Patel",
              statement: "",
            },
            {
              categoryTitle: "Leadership Excellence",
              nomineeName: "Blair Chen",
              statement: "Strong leadership",
            },
          ],
        },
        {
          nominatorName: "Blair Chen",
          nominations: [
            {
              categoryTitle: "Member Service",
              nomineeName: "Ari Morgan",
              statement: "Reliable support",
            },
          ],
        },
      ],
    );
  });
});

describe("category setup", () => {
  it("describes automatic nominee selection without a fixed limit", () => {
    assert.equal(
      formatCategoryVotingSummary({}, 16),
      "Automatic: needs 3 nominations, or top tied nominee if below threshold",
    );
    assert.equal(
      formatCategoryVotingSummary({}, 4),
      "Automatic: needs 2 nominations, or top tied nominee if below threshold",
    );
  });

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

  it("marks standard and runoff categories for deletion during awards run reset", () => {
    assert.deepEqual(
      getResetCategoryIds([
        { id: "cat-main", kind: "standard" },
        { id: "cat-runoff", kind: "runoff" },
      ]),
      ["cat-main", "cat-runoff"],
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

  it("accepts a finalist selection for the signed-in member", () => {
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
      { ok: true, categoryIds: [communityCategory.id] },
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

  it("rejects a finalist selection for an excluded nominee", () => {
    const communityCategory = { id: "cat-community", active: true, title: "Community" };
    const approvedFinalists = [
      { id: "fin-excluded", categoryId: communityCategory.id, nomineeId: "mem-2", status: "approved" },
      { id: "fin-peer", categoryId: communityCategory.id, nomineeId: "mem-4", status: "approved" },
    ];

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory],
        currentMemberId: "mem-1",
        finalists: approvedFinalists,
        members: [
          { id: "mem-1", awardsEligible: true, status: "active" },
          { id: "mem-2", awardsEligible: false, status: "active" },
          { id: "mem-4", awardsEligible: true, status: "active" },
        ],
        selections: {
          [communityCategory.id]: "fin-excluded",
        },
      }),
      { ok: false, reason: "INVALID_FINALIST_SELECTION" },
    );

    assert.deepEqual(
      validateBallotSelections({
        categories: [communityCategory],
        currentMemberId: "mem-1",
        finalists: approvedFinalists,
        members: [
          { id: "mem-1", awardsEligible: true, status: "active" },
          { id: "mem-2", awardsEligible: false, status: "active" },
          { id: "mem-4", awardsEligible: true, status: "active" },
        ],
        selections: {
          [communityCategory.id]: "fin-peer",
        },
      }),
      { ok: true, categoryIds: [communityCategory.id] },
    );
  });

  it("names incomplete ballot categories for guided voting feedback", () => {
    assert.deepEqual(
      getIncompleteBallotCategoryTitles({
        categories: [
          { id: "cat-community", active: true, title: "Community" },
          { id: "cat-service", active: true, title: "Service" },
          { id: "cat-hidden", active: false, title: "Hidden" },
        ],
        selections: {
          "cat-community": "fin-1",
        },
      }),
      ["Service"],
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
