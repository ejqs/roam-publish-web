CREATE TABLE "changelog_entry" (
	"id" text PRIMARY KEY NOT NULL,
	"shortlink_id" text NOT NULL,
	"key" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changelog_entry" ADD CONSTRAINT "changelog_entry_shortlink_id_shortlink_id_fk" FOREIGN KEY ("shortlink_id") REFERENCES "public"."shortlink"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "changelog_entry_key_idx" ON "changelog_entry" USING btree ("shortlink_id","key");--> statement-breakpoint
CREATE INDEX "changelog_entry_recent_idx" ON "changelog_entry" USING btree ("shortlink_id","created_at");