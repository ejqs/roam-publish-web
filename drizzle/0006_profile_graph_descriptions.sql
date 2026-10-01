ALTER TABLE "report" ALTER COLUMN "graph_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "show_owner" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "graph" ADD COLUMN "hide_unlisted_breadcrumbs" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "report" ADD COLUMN "profile_user_id" text;--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_profile_user_id_user_id_fk" FOREIGN KEY ("profile_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_profile_user_idx" ON "report" USING btree ("profile_user_id");--> statement-breakpoint
ALTER TABLE "report" ADD CONSTRAINT "report_target_check" CHECK (("report"."graph_id" is null) <> ("report"."profile_user_id" is null));