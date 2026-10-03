CREATE TABLE "endpoint_metric" (
	"name" text NOT NULL,
	"minute" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"sum_ms" integer DEFAULT 0 NOT NULL,
	"max_ms" integer DEFAULT 0 NOT NULL,
	"hist" integer[] NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	CONSTRAINT "endpoint_metric_name_minute_pk" PRIMARY KEY("name","minute")
);
--> statement-breakpoint
CREATE INDEX "endpoint_metric_minute_idx" ON "endpoint_metric" USING btree ("minute");