ALTER TABLE "publication" ADD COLUMN "link_id" text;--> statement-breakpoint
-- 10 random letters and digits per page; the series references the row so each one gets its own.
UPDATE "publication" SET "link_id" = (
  SELECT string_agg(substr('abcdefghijklmnopqrstuvwxyz0123456789', floor(random() * 36)::int + 1, 1), '')
  FROM generate_series(1, 10 + 0 * length("publication"."id"))
);--> statement-breakpoint
ALTER TABLE "publication" ALTER COLUMN "link_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD CONSTRAINT "publication_link_id_unique" UNIQUE("link_id");
