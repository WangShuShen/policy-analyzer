ALTER TABLE "policies" ADD COLUMN "requested_at" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "request_count" integer DEFAULT 0 NOT NULL;