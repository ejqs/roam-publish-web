-- A readable page keeps nothing from when it was encrypted (lib/encryption.ts plainColumns).
UPDATE "publication" SET "cipher" = NULL, "title_cipher" = NULL, "encryption_version" = NULL, "encrypted_by" = NULL, "needs_republish" = false
WHERE NOT "encrypted" AND ("cipher" IS NOT NULL OR "title_cipher" IS NOT NULL OR "encryption_version" IS NOT NULL OR "encrypted_by" IS NOT NULL OR "needs_republish");--> statement-breakpoint
-- Every encrypted page has a version since 0042, which set 1 on the ones before it.
UPDATE "publication" SET "encryption_version" = 1 WHERE "encrypted" AND "encryption_version" IS NULL;--> statement-breakpoint
-- NOT VALID: enforced on every write from now on, without failing the deploy over an older row it can't fix.
ALTER TABLE "publication" ADD CONSTRAINT "publication_content_state" CHECK ("publication"."encrypted" = ("publication"."cipher" is not null) and "publication"."encrypted" = ("publication"."encryption_version" is not null) and ("publication"."encrypted" or ("publication"."title_cipher" is null and "publication"."encrypted_by" is null and not "publication"."needs_republish"))) NOT VALID;
