ALTER TABLE "members" ADD COLUMN "clerk_user_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "members_clerk_user_id_unique" ON "members" USING btree ("clerk_user_id");