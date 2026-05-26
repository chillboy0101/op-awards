ALTER TABLE "categories" ADD COLUMN "nominee_staff_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "staff_type" text DEFAULT 'main' NOT NULL;