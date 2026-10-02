-- /c/, /collection/ and /keys are new top-level routes that would hide a graph with that name.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "graph" WHERE lower("name") IN ('c', 'collection', 'keys')) THEN
    RAISE EXCEPTION 'A graph is named c, collection or keys; rename the route or the graph before migrating';
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE "c_path" (
	"path" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"owner_id" text NOT NULL,
	"index_access" text DEFAULT 'open' NOT NULL,
	"default_access" text DEFAULT 'open' NOT NULL,
	"password_hash" text,
	"password_version" integer DEFAULT 0 NOT NULL,
	"show_authors" boolean DEFAULT true NOT NULL,
	"indexable" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"discoverable" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "collection_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"collection_id" text NOT NULL,
	"publication_id" text NOT NULL,
	"entry_uid" text NOT NULL,
	"listing" text DEFAULT 'listed' NOT NULL,
	"access" text DEFAULT 'inherit' NOT NULL,
	"password_hash" text,
	"password_version" integer DEFAULT 0 NOT NULL,
	"show_author" text DEFAULT 'inherit' NOT NULL,
	"added_by" text,
	"position" integer DEFAULT 0 NOT NULL,
	"origin_graph_name" text NOT NULL,
	"origin_root_uid" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_entry_entry_uid_unique" UNIQUE("entry_uid")
);
--> statement-breakpoint
CREATE TABLE "collection_member" (
	"collection_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_member_collection_id_user_id_pk" PRIMARY KEY("collection_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "graph_default_collection" (
	"graph_id" text NOT NULL,
	"collection_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_default_collection_graph_id_collection_id_pk" PRIMARY KEY("graph_id","collection_id")
);
--> statement-breakpoint
CREATE TABLE "graph_member" (
	"graph_id" text NOT NULL,
	"user_id" text NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graph_member_graph_id_user_id_pk" PRIMARY KEY("graph_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "invite" (
	"id" text PRIMARY KEY NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" text NOT NULL,
	"invitee_user_id" text NOT NULL,
	"email" text NOT NULL,
	"invited_by" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report" DROP CONSTRAINT "report_target_check";--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "index_access" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "default_access" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "password_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "show_authors" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "new_pages_in_graph" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "published_by" text;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "in_graph" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "access" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "password_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "show_author" text DEFAULT 'inherit' NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "collection_id" text;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD CONSTRAINT "collection_entry_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD CONSTRAINT "collection_entry_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entry" ADD CONSTRAINT "collection_entry_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_member" ADD CONSTRAINT "collection_member_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_member" ADD CONSTRAINT "collection_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_member" ADD CONSTRAINT "collection_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_default_collection" ADD CONSTRAINT "graph_default_collection_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_default_collection" ADD CONSTRAINT "graph_default_collection_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_member" ADD CONSTRAINT "graph_member_graph_id_graph_id_fk" FOREIGN KEY ("graph_id") REFERENCES "public"."graph"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_member" ADD CONSTRAINT "graph_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graph_member" ADD CONSTRAINT "graph_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invitee_user_id_user_id_fk" FOREIGN KEY ("invitee_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite" ADD CONSTRAINT "invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_entry_collection_publication_idx" ON "collection_entry" USING btree ("collection_id","publication_id");--> statement-breakpoint
CREATE INDEX "collection_entry_publication_idx" ON "collection_entry" USING btree ("publication_id");--> statement-breakpoint
CREATE INDEX "collection_member_user_idx" ON "collection_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "graph_member_user_idx" ON "graph_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_pending_idx" ON "invite" USING btree ("target_type","target_id","invitee_user_id","kind") WHERE "invite"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "invite_pending_transfer_idx" ON "invite" USING btree ("target_type","target_id") WHERE "invite"."status" = 'pending' and "invite"."kind" = 'transfer';--> statement-breakpoint
CREATE INDEX "invite_invitee_idx" ON "invite" USING btree ("invitee_user_id","status");--> statement-breakpoint
CREATE INDEX "invite_target_idx" ON "invite" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_collection_id_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_collection_idx" ON "report" USING btree ("collection_id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_check" CHECK (num_nonnulls("report"."graph_id", "report"."collection_id", "report"."profile_user_id") = 1);--> statement-breakpoint
-- Every existing page was published by its graph's owner.
UPDATE "publication" SET "published_by" = "graph"."user_id" FROM "graph" WHERE "graph"."id" = "publication"."graph_id";
