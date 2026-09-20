CREATE TABLE "graph" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication" (
	"id" text PRIMARY KEY,
	"graph_id" text NOT NULL,
	"uid" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"scope" text,
	"status" text DEFAULT 'published' NOT NULL,
	"content_fingerprint" text,
	"published_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "graph_name_uidx" ON "graph" ("name");--> statement-breakpoint
CREATE INDEX "graph_userId_idx" ON "graph" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_graph_uid_uidx" ON "publication" ("graph_id","uid");--> statement-breakpoint
CREATE INDEX "publication_graphId_idx" ON "publication" ("graph_id");--> statement-breakpoint
ALTER TABLE "graph" ADD CONSTRAINT "graph_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_graph_id_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graph"("id") ON DELETE CASCADE;
