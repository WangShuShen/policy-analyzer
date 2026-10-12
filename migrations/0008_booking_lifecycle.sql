CREATE TABLE "email_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"to_addr" text NOT NULL,
	"reply_to" text,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"ics" text,
	"ics_method" text,
	"kind" text NOT NULL,
	"booking_id" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_try_at" text,
	"sent_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"recipient_type" text NOT NULL,
	"recipient_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"booking_id" text,
	"read_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "rescheduled_from" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reschedule_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminded_24h_at" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "reminded_1h_at" text;--> statement-breakpoint
CREATE INDEX "email_outbox_status" ON "email_outbox" USING btree ("status","next_try_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient" ON "notifications" USING btree ("recipient_id","created_at");