ALTER TABLE "publication" ADD COLUMN "tags_added" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "tags_hidden" text[] DEFAULT '{}'::text[] NOT NULL;