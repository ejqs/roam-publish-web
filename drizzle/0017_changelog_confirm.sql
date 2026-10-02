ALTER TABLE "shortlink" ADD COLUMN "anchor_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shortlink" ADD COLUMN "anchor_missing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shortlink" ADD COLUMN "anchor_missing_dismissed_at" timestamp with time zone;