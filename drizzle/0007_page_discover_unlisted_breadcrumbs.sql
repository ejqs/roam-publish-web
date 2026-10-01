ALTER TABLE "graph" ADD COLUMN "hide_unlisted_breadcrumbs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "discoverable" boolean DEFAULT false NOT NULL;