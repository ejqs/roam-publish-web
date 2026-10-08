CREATE TABLE "ext_client" (
	"user_id" text NOT NULL,
	"graph_id" text NOT NULL,
	"version" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ext_client_user_id_graph_id_pk" PRIMARY KEY("user_id","graph_id")
);
--> statement-breakpoint
ALTER TABLE "ext_client" ADD CONSTRAINT "ext_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ext_client" ADD CONSTRAINT "ext_client_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ext_client_last_seen_idx" ON "ext_client" USING btree ("last_seen_at");