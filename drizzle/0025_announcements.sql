CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"key" text,
	"tone" text NOT NULL,
	"message" text NOT NULL,
	"link_url" text,
	"link_text" text,
	"audience" text NOT NULL,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"muted_until" timestamp with time zone,
	"created_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcement_key_idx" ON "announcement" USING btree ("key");--> statement-breakpoint
CREATE INDEX "announcement_ends_idx" ON "announcement" USING btree ("ends_at");