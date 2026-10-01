CREATE TABLE "profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "front_page" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "indexable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "featured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "visibility" text DEFAULT 'unlisted' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_graph_visibility_idx" ON "publication" USING btree ("graph_id","visibility");