ALTER TABLE "publication" ADD COLUMN "encryption_version" integer;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "encrypted_by" text;--> statement-breakpoint
-- Every page encrypted so far was encrypted by roam.pub (encryption 1).
UPDATE "publication" SET "encryption_version" = 1 WHERE "encrypted";
