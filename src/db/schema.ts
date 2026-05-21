import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const memberStatus = pgEnum("member_status", ["active", "inactive"]);
export const staffRole = pgEnum("staff_role", ["admin", "reviewer"]);
export const cycleStage = pgEnum("cycle_stage", [
  "draft",
  "nominations",
  "review",
  "voting",
  "certification",
  "published",
]);
export const nominationStatus = pgEnum("nomination_status", [
  "new",
  "recommended",
  "needs_info",
  "approved",
  "rejected",
]);
export const duplicateRisk = pgEnum("duplicate_risk", ["clear", "possible", "resolved"]);
export const finalistStatus = pgEnum("finalist_status", ["draft", "approved"]);
export const certificationStatus = pgEnum("certification_status", [
  "pending",
  "certified",
  "tie",
  "runoff",
  "published",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const members = pgTable(
  "members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id"),
    name: text("name").notNull(),
    email: text("email").notNull(),
    chapter: text("chapter").notNull().default("General"),
    status: memberStatus("status").notNull().default("active"),
    awardsEligible: boolean("awards_eligible").notNull().default(true),
    joinedYear: text("joined_year"),
    photoUrl: text("photo_url"),
    ...timestamps,
  },
  (table) => ({
    clerkUserIdUnique: uniqueIndex("members_clerk_user_id_unique").on(table.clerkUserId),
    emailUnique: uniqueIndex("members_email_unique").on(table.email),
  }),
);

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: staffRole("role").notNull(),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    emailRoleUnique: uniqueIndex("staff_users_email_role_unique").on(
      table.email,
      table.role,
    ),
  }),
);

export const authMagicLinks = pgTable(
  "auth_magic_links",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_magic_links_token_hash_unique").on(table.tokenHash),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex("auth_sessions_token_hash_unique").on(table.tokenHash),
  }),
);

export const awardCycles = pgTable("award_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  stage: cycleStage("stage").notNull().default("draft"),
  nominationsOpenAt: timestamp("nominations_open_at", { withTimezone: true }),
  nominationsCloseAt: timestamp("nominations_close_at", { withTimezone: true }),
  votingOpenAt: timestamp("voting_open_at", { withTimezone: true }),
  votingCloseAt: timestamp("voting_close_at", { withTimezone: true }),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  cycleId: uuid("cycle_id").notNull().references(() => awardCycles.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull(),
  nominationQuestion: text("nomination_question").notNull(),
  nominationLimit: integer("nomination_limit").notNull().default(1),
  finalistLimit: integer("finalist_limit").notNull().default(3),
  active: boolean("active").notNull().default(true),
  parentCategoryId: uuid("parent_category_id"),
  kind: text("kind").notNull().default("standard"),
  ballotScope: text("ballot_scope").notNull().default("main"),
  ...timestamps,
});

export const nominations = pgTable(
  "nominations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id").notNull().references(() => awardCycles.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    nominatorId: uuid("nominator_id").notNull().references(() => members.id),
    nomineeId: uuid("nominee_id").notNull().references(() => members.id),
    statement: text("statement").notNull(),
    supportingLink: text("supporting_link"),
    reviewerScore: integer("reviewer_score"),
    status: nominationStatus("status").notNull().default("new"),
    duplicateRisk: duplicateRisk("duplicate_risk").notNull().default("clear"),
    ...timestamps,
  },
  (table) => ({
    oneNominationPerCategory: uniqueIndex("nominations_member_category_unique").on(
      table.categoryId,
      table.nominatorId,
    ),
  }),
);

export const finalists = pgTable(
  "finalists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
    nomineeId: uuid("nominee_id").notNull().references(() => members.id),
    displayName: text("display_name").notNull(),
    summary: text("summary"),
    nominationCount: integer("nomination_count").notNull().default(0),
    status: finalistStatus("status").notNull().default("draft"),
    approvedByStaffId: uuid("approved_by_staff_id").references(() => staffUsers.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    categoryNomineeUnique: uniqueIndex("finalists_category_nominee_unique").on(
      table.categoryId,
      table.nomineeId,
    ),
  }),
);

export const voteReceipts = pgTable(
  "vote_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    cycleId: uuid("cycle_id").notNull().references(() => awardCycles.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
    ballotScope: text("ballot_scope").notNull().default("main"),
    confirmationCode: text("confirmation_code").notNull(),
    categoryIds: jsonb("category_ids").$type<string[]>().notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    oneReceiptPerCycle: uniqueIndex("vote_receipts_cycle_member_unique").on(
      table.cycleId,
      table.memberId,
      table.ballotScope,
    ),
    confirmationUnique: uniqueIndex("vote_receipts_confirmation_unique").on(
      table.confirmationCode,
    ),
  }),
);

export const anonymousVotes = pgTable("anonymous_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  cycleId: uuid("cycle_id").notNull().references(() => awardCycles.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  finalistId: uuid("finalist_id").notNull().references(() => finalists.id, { onDelete: "cascade" }),
  ballotScope: text("ballot_scope").notNull().default("main"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
});

export const resultCertifications = pgTable("result_certifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  categoryId: uuid("category_id").notNull().references(() => categories.id, { onDelete: "cascade" }),
  winnerFinalistId: uuid("winner_finalist_id").references(() => finalists.id),
  status: certificationStatus("status").notNull().default("pending"),
  tallySnapshot: jsonb("tally_snapshot").$type<Record<string, unknown>>().notNull(),
  certifiedByStaffId: uuid("certified_by_staff_id").references(() => staffUsers.id),
  certifiedAt: timestamp("certified_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  ...timestamps,
});

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorMemberId: uuid("actor_member_id").references(() => members.id, { onDelete: "set null" }),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  summary: text("summary"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
