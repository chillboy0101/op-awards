CREATE INDEX "anonymous_votes_category_scope_idx" ON "anonymous_votes" USING btree ("category_id","ballot_scope");--> statement-breakpoint
CREATE INDEX "anonymous_votes_cycle_scope_idx" ON "anonymous_votes" USING btree ("cycle_id","ballot_scope");--> statement-breakpoint
CREATE INDEX "award_cycles_created_at_idx" ON "award_cycles" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "categories_cycle_idx" ON "categories" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "categories_cycle_scope_idx" ON "categories" USING btree ("cycle_id","ballot_scope");--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_category_id");--> statement-breakpoint
CREATE INDEX "finalists_category_status_idx" ON "finalists" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "nominations_category_idx" ON "nominations" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "nominations_cycle_idx" ON "nominations" USING btree ("cycle_id");--> statement-breakpoint
CREATE INDEX "result_certifications_category_idx" ON "result_certifications" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "vote_receipts_cycle_scope_idx" ON "vote_receipts" USING btree ("cycle_id","ballot_scope");