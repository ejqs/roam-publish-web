CREATE TABLE "page_views_day" (
	"page_views_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer NOT NULL,
	CONSTRAINT "page_views_day_page_views_id_day_pk" PRIMARY KEY("page_views_id","day")
);
--> statement-breakpoint
ALTER TABLE "page_views_day" ADD CONSTRAINT "page_views_day_page_views_id_page_views_id_fk" FOREIGN KEY ("page_views_id") REFERENCES "public"."page_views"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_views_day_day_idx" ON "page_views_day" USING btree ("day");