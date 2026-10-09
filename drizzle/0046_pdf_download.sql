ALTER TABLE "collection" ADD COLUMN "pdf_download" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "pdf_style" jsonb;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD COLUMN "pdf_download" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "pdf_download" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "pdf_style" jsonb;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "pdf_download" text DEFAULT 'inherit' NOT NULL;