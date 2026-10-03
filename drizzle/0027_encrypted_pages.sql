CREATE TABLE "lock_key" (
	"scope" text NOT NULL,
	"target_id" text NOT NULL,
	"public_key" text NOT NULL,
	"wrapped_private_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lock_key_scope_target_id_pk" PRIMARY KEY("scope","target_id")
);
--> statement-breakpoint
CREATE TABLE "publication_key" (
	"publication_id" text NOT NULL,
	"scope" text NOT NULL,
	"target_id" text NOT NULL,
	"sealed_key" text NOT NULL,
	CONSTRAINT "publication_key_publication_id_scope_target_id_pk" PRIMARY KEY("publication_id","scope","target_id")
);
--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "encrypted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "cipher" text;--> statement-breakpoint
ALTER TABLE "publication" ADD COLUMN "needs_republish" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "publication_key" ADD CONSTRAINT "publication_key_publication_id_publication_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publication"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publication_key_lock_idx" ON "publication_key" USING btree ("scope","target_id");