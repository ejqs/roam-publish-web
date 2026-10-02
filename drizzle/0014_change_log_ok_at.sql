ALTER TABLE "graph" ADD COLUMN "append_token_ok_at" timestamp with time zone;--> statement-breakpoint
-- Tokens stored before this column: Roam accepted them when they were added.
UPDATE "graph" SET "append_token_ok_at" = "append_token_added_at" WHERE "append_token_enc" IS NOT NULL AND "append_token_status" IS DISTINCT FROM 'invalid';
