ALTER TABLE "changelog_entry" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "changelog_entry" ADD COLUMN "roam_text" text;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "change_log_off" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "change_log_merge" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "change_log_by_day" boolean DEFAULT true NOT NULL;