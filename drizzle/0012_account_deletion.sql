CREATE TABLE "blocked_identity" (
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"moderation_action_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocked_identity_kind_value_pk" PRIMARY KEY("kind","value")
);
