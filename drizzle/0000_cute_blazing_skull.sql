CREATE EXTENSION IF NOT EXISTS "pgcrypto";--> statement-breakpoint
CREATE TYPE "public"."certification_status" AS ENUM('pending', 'certified', 'tie', 'runoff', 'published');--> statement-breakpoint
CREATE TYPE "public"."cycle_stage" AS ENUM('draft', 'nominations', 'review', 'voting', 'certification', 'published');--> statement-breakpoint
CREATE TYPE "public"."duplicate_risk" AS ENUM('clear', 'possible', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."finalist_status" AS ENUM('draft', 'approved');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."nomination_status" AS ENUM('new', 'recommended', 'needs_info', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('admin', 'reviewer');--> statement-breakpoint
CREATE TABLE "anonymous_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"finalist_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_member_id" uuid,
	"actor_role" text NOT NULL,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"summary" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_magic_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "award_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"stage" "cycle_stage" DEFAULT 'draft' NOT NULL,
	"nominations_open_at" timestamp with time zone,
	"nominations_close_at" timestamp with time zone,
	"voting_open_at" timestamp with time zone,
	"voting_close_at" timestamp with time zone,
	"publish_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"nomination_question" text NOT NULL,
	"nomination_limit" integer DEFAULT 1 NOT NULL,
	"finalist_limit" integer DEFAULT 3 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"parent_category_id" uuid,
	"kind" text DEFAULT 'standard' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cloudinary_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" text NOT NULL,
	"public_id" text NOT NULL,
	"secure_url" text NOT NULL,
	"resource_type" text DEFAULT 'image' NOT NULL,
	"member_id" uuid,
	"uploaded_by_staff_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finalists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"nominee_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"summary" text,
	"nomination_count" integer DEFAULT 0 NOT NULL,
	"status" "finalist_status" DEFAULT 'draft' NOT NULL,
	"approved_by_staff_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"chapter" text DEFAULT 'General' NOT NULL,
	"status" "member_status" DEFAULT 'active' NOT NULL,
	"joined_year" text,
	"photo_url" text,
	"photo_asset_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nominations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"nominator_id" uuid NOT NULL,
	"nominee_id" uuid NOT NULL,
	"statement" text NOT NULL,
	"supporting_link" text,
	"reviewer_score" integer,
	"status" "nomination_status" DEFAULT 'new' NOT NULL,
	"duplicate_risk" "duplicate_risk" DEFAULT 'clear' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"winner_finalist_id" uuid,
	"status" "certification_status" DEFAULT 'pending' NOT NULL,
	"tally_snapshot" jsonb NOT NULL,
	"certified_by_staff_id" uuid,
	"certified_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid,
	"email" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"confirmation_code" text NOT NULL,
	"category_ids" jsonb NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anonymous_votes" ADD CONSTRAINT "anonymous_votes_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_votes" ADD CONSTRAINT "anonymous_votes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anonymous_votes" ADD CONSTRAINT "anonymous_votes_finalist_id_finalists_id_fk" FOREIGN KEY ("finalist_id") REFERENCES "public"."finalists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_member_id_members_id_fk" FOREIGN KEY ("actor_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_magic_links" ADD CONSTRAINT "auth_magic_links_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudinary_assets" ADD CONSTRAINT "cloudinary_assets_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cloudinary_assets" ADD CONSTRAINT "cloudinary_assets_uploaded_by_staff_id_staff_users_id_fk" FOREIGN KEY ("uploaded_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalists" ADD CONSTRAINT "finalists_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalists" ADD CONSTRAINT "finalists_nominee_id_members_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalists" ADD CONSTRAINT "finalists_approved_by_staff_id_staff_users_id_fk" FOREIGN KEY ("approved_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_nominator_id_members_id_fk" FOREIGN KEY ("nominator_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nominations" ADD CONSTRAINT "nominations_nominee_id_members_id_fk" FOREIGN KEY ("nominee_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_certifications" ADD CONSTRAINT "result_certifications_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_certifications" ADD CONSTRAINT "result_certifications_winner_finalist_id_finalists_id_fk" FOREIGN KEY ("winner_finalist_id") REFERENCES "public"."finalists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_certifications" ADD CONSTRAINT "result_certifications_certified_by_staff_id_staff_users_id_fk" FOREIGN KEY ("certified_by_staff_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_cycle_id_award_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."award_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_magic_links_token_hash_unique" ON "auth_magic_links" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_hash_unique" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "finalists_category_nominee_unique" ON "finalists" USING btree ("category_id","nominee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "members_email_unique" ON "members" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "nominations_member_category_unique" ON "nominations" USING btree ("category_id","nominator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_users_email_role_unique" ON "staff_users" USING btree ("email","role");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_receipts_cycle_member_unique" ON "vote_receipts" USING btree ("cycle_id","member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vote_receipts_confirmation_unique" ON "vote_receipts" USING btree ("confirmation_code");
