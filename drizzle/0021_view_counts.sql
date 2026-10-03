CREATE TABLE "background_job" (
	"name" text PRIMARY KEY NOT NULL,
	"interval_ms" integer NOT NULL,
	"next_due_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_until" timestamp with time zone,
	"last_started_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_duration_ms" integer,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"run_count" integer DEFAULT 0 NOT NULL,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"last_result" jsonb,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text,
	"entry_id" text,
	"path" text NOT NULL,
	"baseline" integer DEFAULT 0 NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	"countries" jsonb,
	"countries_synced_at" timestamp with time zone,
	"countries_next_sync_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_views_one_place" CHECK (("page_views"."publication_id" is null) <> ("page_views"."entry_id" is null))
);
--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "views" text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "show_view_countries" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD COLUMN "views" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD COLUMN "show_view_countries" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "views" text DEFAULT 'show' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "show_view_countries" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "views" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "show_view_countries" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_entry_id_collection_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_publication_idx" ON "page_views" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_views_entry_idx" ON "page_views" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "page_views_countries_due_idx" ON "page_views" USING btree ("countries_next_sync_at");