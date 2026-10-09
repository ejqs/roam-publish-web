CREATE TABLE "link_pin" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text,
	"entry_id" text,
	"graph_id" text,
	"collection_id" text,
	"shared_at" text[] NOT NULL,
	"pinned_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "link_pin_one_target" CHECK (num_nonnulls("link_pin"."publication_id", "link_pin"."entry_id", "link_pin"."graph_id", "link_pin"."collection_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "link_pin" ADD CONSTRAINT "link_pin_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_pin" ADD CONSTRAINT "link_pin_entry_id_collection_entry_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entry"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_pin" ADD CONSTRAINT "link_pin_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_pin" ADD CONSTRAINT "link_pin_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_pin" ADD CONSTRAINT "link_pin_pinned_by_user_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "link_pin_publication_idx" ON "link_pin" USING btree ("publication_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_pin_entry_idx" ON "link_pin" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_pin_graph_idx" ON "link_pin" USING btree ("graph_id");--> statement-breakpoint
CREATE UNIQUE INDEX "link_pin_collection_idx" ON "link_pin" USING btree ("collection_id");