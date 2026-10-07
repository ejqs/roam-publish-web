CREATE TABLE "folder" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text,
	"collection_id" text,
	"parent_id" text,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_one_place" CHECK (("folder"."graph_id" is null) <> ("folder"."collection_id" is null))
);
--> statement-breakpoint
ALTER TABLE "collection" ADD COLUMN "front_layout" text DEFAULT 'shelves' NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "front_layout" text DEFAULT 'shelves' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "folder_id" text;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder" ADD CONSTRAINT "folder_parent_id_folder_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."folder"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_graph_slug_idx" ON "folder" USING btree ("graph_id","slug") WHERE "folder"."graph_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_collection_slug_idx" ON "folder" USING btree ("collection_id","slug") WHERE "folder"."collection_id" is not null;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD CONSTRAINT "collection_entry_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_folder_id_folder_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."folder"("id") ON DELETE set null ON UPDATE no action;