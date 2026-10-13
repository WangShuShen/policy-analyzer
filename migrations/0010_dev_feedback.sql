CREATE TABLE "dev_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"page_url" text NOT NULL,
	"role" text NOT NULL,
	"user_id" text,
	"user_name" text,
	"status" text DEFAULT 'new' NOT NULL,
	"handler_note" text,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "dev_feedback_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE INDEX "dev_feedback_status" ON "dev_feedback" USING btree ("status","seq");