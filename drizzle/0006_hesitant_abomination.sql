ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "nominee_staff_scope" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "staff_type" text DEFAULT 'main' NOT NULL;
