CREATE TABLE "shortlink" (
	"id" text PRIMARY KEY NOT NULL,
	"graph_id" text NOT NULL,
	"root_uid" text NOT NULL,
	"anchor_uid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "append_token_enc" text;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "append_token_status" text;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "append_token_added_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "time_zone" text;--> statement-breakpoint
ALTER TABLE "shortlink" ADD CONSTRAINT "shortlink_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shortlink_graph_root_idx" ON "shortlink" USING btree ("graph_id","root_uid");