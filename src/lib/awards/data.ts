export type AwardStage =
  | "Draft"
  | "Nominations"
  | "Review"
  | "Voting"
  | "Certification"
  | "Published";

export type Member = {
  id: string;
  name: string;
  email: string;
  chapter: string;
  status: "active" | "inactive";
  joined: string;
  photoUrl?: string | null;
};

export type Category = {
  active: boolean;
  ballotScope: string;
  id: string;
  kind?: string;
  parentCategoryId?: string | null;
  title: string;
  description: string;
  finalistLimit: number;
  nominationLimit: number;
  question: string;
};

export type Nomination = {
  id: string;
  categoryId: string;
  nomineeId: string;
  nominatorId: string;
  statement: string;
  link?: string;
  reviewerScore: number;
  status: "new" | "recommended" | "needs-info" | "approved";
  duplicateRisk: "clear" | "possible" | "resolved";
};

export type Finalist = {
  id: string;
  ballotScope?: string;
  categoryId: string;
  nomineeId: string;
  displayName: string;
  nominationCount: number;
  summary?: string | null;
  photoUrl?: string | null;
  status: "draft" | "approved";
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  time: string;
};

export const awardModel = {
  cycle: {
    id: "cycle-2026",
    title: "2026 O&P Excellence Awards",
    stage: "Voting" as AwardStage,
    nominationsOpen: "May 20",
    nominationsClose: "June 10",
    nominationsOpenAt: "2026-05-20T13:00:00.000Z",
    nominationsCloseAt: "2026-06-10T23:59:59.000Z",
    votingOpen: "June 18",
    votingClose: "June 28",
    votingOpenAt: "2026-06-18T13:00:00.000Z",
    votingCloseAt: "2026-06-28T23:59:59.000Z",
    publishAt: "2026-07-12T13:00:00.000Z",
    publishDate: "July 12",
    publishedAt: null,
  },
  phases: [
    { label: "Draft", detail: "Categories and roster locked" },
    { label: "Nominations", detail: "Peer nominations collected" },
    { label: "Review", detail: "Reviewers score and merge" },
    { label: "Voting", detail: "Members cast anonymous ballots" },
    { label: "Certification", detail: "Admins certify results" },
    { label: "Published", detail: "Winners archive opens" },
  ] as const,
  members: [
    {
      id: "mem-1",
      name: "Ari Morgan",
      email: "ari@cpa.example",
      chapter: "North",
      status: "active",
      joined: "2019",
    },
    {
      id: "mem-2",
      name: "Blair Chen",
      email: "blair@cpa.example",
      chapter: "Central",
      status: "active",
      joined: "2017",
    },
    {
      id: "mem-3",
      name: "Casey Rivera",
      email: "casey@cpa.example",
      chapter: "West",
      status: "active",
      joined: "2021",
    },
    {
      id: "mem-4",
      name: "Devon Patel",
      email: "devon@cpa.example",
      chapter: "South",
      status: "active",
      joined: "2016",
    },
    {
      id: "mem-5",
      name: "Elliot Brooks",
      email: "elliot@cpa.example",
      chapter: "East",
      status: "inactive",
      joined: "2020",
    },
  ] satisfies Member[],
  categories: [
    {
      active: true,
      ballotScope: "main",
      id: "cat-leadership",
      kind: "standard",
      title: "Leadership Excellence",
      description: "Recognizes a member whose leadership improved the O&P community.",
      finalistLimit: 3,
      nominationLimit: 1,
      question: "What leadership action created measurable value for members?",
    },
    {
      active: true,
      ballotScope: "main",
      id: "cat-service",
      kind: "standard",
      title: "Member Service",
      description: "Honors a member who gave exceptional service to peers.",
      finalistLimit: 3,
      nominationLimit: 1,
      question: "How did this member serve others beyond their regular role?",
    },
    {
      active: true,
      ballotScope: "main",
      id: "cat-innovation",
      kind: "standard",
      title: "Practice Innovation",
      description: "Celebrates a member who modernized practice, process, or education.",
      finalistLimit: 3,
      nominationLimit: 1,
      question: "Which new idea or process should the association recognize?",
    },
  ] satisfies Category[],
  nominations: [
    {
      id: "nom-1",
      categoryId: "cat-leadership",
      nomineeId: "mem-2",
      nominatorId: "mem-1",
      statement:
        "Blair coordinated the chapter mentoring program and doubled first-year participation.",
      link: "https://example.org/mentor-report",
      reviewerScore: 94,
      status: "recommended",
      duplicateRisk: "clear",
    },
    {
      id: "nom-2",
      categoryId: "cat-leadership",
      nomineeId: "mem-4",
      nominatorId: "mem-3",
      statement:
        "Devon led the standards roundtable and turned member feedback into published guidance.",
      reviewerScore: 91,
      status: "recommended",
      duplicateRisk: "clear",
    },
    {
      id: "nom-3",
      categoryId: "cat-service",
      nomineeId: "mem-3",
      nominatorId: "mem-2",
      statement:
        "Casey organized volunteer review clinics for members preparing for annual compliance deadlines.",
      reviewerScore: 88,
      status: "needs-info",
      duplicateRisk: "possible",
    },
    {
      id: "nom-4",
      categoryId: "cat-innovation",
      nomineeId: "mem-1",
      nominatorId: "mem-4",
      statement:
        "Ari built a repeatable quality checklist that several firms adopted across their audit teams.",
      reviewerScore: 96,
      status: "approved",
      duplicateRisk: "resolved",
    },
  ] satisfies Nomination[],
  finalists: [
    {
      id: "fin-1",
      ballotScope: "main",
      categoryId: "cat-leadership",
      nomineeId: "mem-2",
      displayName: "Blair Chen",
      nominationCount: 5,
      status: "approved",
    },
    {
      id: "fin-2",
      ballotScope: "main",
      categoryId: "cat-leadership",
      nomineeId: "mem-4",
      displayName: "Devon Patel",
      nominationCount: 4,
      status: "approved",
    },
    {
      id: "fin-3",
      ballotScope: "main",
      categoryId: "cat-service",
      nomineeId: "mem-3",
      displayName: "Casey Rivera",
      nominationCount: 6,
      status: "approved",
    },
    {
      id: "fin-4",
      ballotScope: "main",
      categoryId: "cat-innovation",
      nomineeId: "mem-1",
      displayName: "Ari Morgan",
      nominationCount: 7,
      status: "approved",
    },
  ] satisfies Finalist[],
  results: [
    {
      category: "Leadership Excellence",
      leader: "Blair Chen",
      count: 42,
      status: "tie-check",
    },
    {
      category: "Member Service",
      leader: "Casey Rivera",
      count: 51,
      status: "ready",
    },
    {
      category: "Practice Innovation",
      leader: "Ari Morgan",
      count: 49,
      status: "ready",
    },
  ],
  audit: [
    {
      id: "aud-1",
      actor: "Admin",
      action: "Opened voting",
      target: "2026 cycle",
      time: "Today, 14:10",
    },
    {
      id: "aud-2",
      actor: "Reviewer",
      action: "Resolved duplicate",
      target: "Practice Innovation",
      time: "Yesterday, 17:45",
    },
    {
      id: "aud-3",
      actor: "Admin",
      action: "Approved finalists",
      target: "Leadership Excellence",
      time: "Yesterday, 10:05",
    },
  ] satisfies AuditEvent[],
};

export function getMemberName(memberId: string) {
  return awardModel.members.find((member) => member.id === memberId)?.name ?? "Unknown";
}

export function getCategoryTitle(categoryId: string) {
  return (
    awardModel.categories.find((category) => category.id === categoryId)?.title ??
    "Unknown category"
  );
}
