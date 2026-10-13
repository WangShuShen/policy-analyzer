CREATE TABLE "advisor_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"google_name" text,
	"name" text NOT NULL,
	"license_no" text NOT NULL,
	"company" text NOT NULL,
	"phone" text NOT NULL,
	"intro" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" text,
	"review_note" text,
	"advisor_id" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE INDEX "advisor_applications_status" ON "advisor_applications" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_applications_one_pending" ON "advisor_applications" USING btree ("email") WHERE status = 'pending';