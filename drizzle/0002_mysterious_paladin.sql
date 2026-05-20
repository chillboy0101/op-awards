DROP INDEX "vote_receipts_cycle_member_unique";--> statement-breakpoint
ALTER TABLE "anonymous_votes" ADD COLUMN "ballot_scope" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "ballot_scope" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD COLUMN "ballot_scope" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "vote_receipts_cycle_member_unique" ON "vote_receipts" USING btree ("cycle_id","member_id","ballot_scope");