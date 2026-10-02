ALTER TABLE "graph" ADD COLUMN "append_next_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "append_backoff" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "changelog_entry_status_idx" ON "changelog_entry" USING btree ("status","created_at");