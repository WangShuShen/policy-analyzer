CREATE TABLE "data_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"due_date" text NOT NULL,
	"handled_by" text,
	"handled_note" text,
	"handled_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE INDEX "data_requests_user" ON "data_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "data_requests_status" ON "data_requests" USING btree ("status","created_at");