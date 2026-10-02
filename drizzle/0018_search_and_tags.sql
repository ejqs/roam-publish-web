ALTER TABLE "publication" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "search_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "search" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(search_text, '')), 'B')) STORED;--> statement-breakpoint
CREATE INDEX "publication_tags_idx" ON "publication" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "publication_search_idx" ON "publication" USING gin ("search");