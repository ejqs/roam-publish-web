CREATE TABLE "inbox_reply" (
	"id" text PRIMARY KEY NOT NULL,
	"email_id" text NOT NULL,
	"admin_id" text,
	"to" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbox_reply" ADD CONSTRAINT "inbox_reply_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbox_reply_email_idx" ON "inbox_reply" USING btree ("email_id");