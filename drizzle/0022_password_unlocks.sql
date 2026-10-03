CREATE TABLE "password_unlock" (
	"scope" text NOT NULL,
	"target_id" text NOT NULL,
	"password_version" integer NOT NULL,
	"unlocks" integer DEFAULT 0 NOT NULL,
	"last_unlock_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_unlock_scope_target_id_password_version_pk" PRIMARY KEY("scope","target_id","password_version")
);
