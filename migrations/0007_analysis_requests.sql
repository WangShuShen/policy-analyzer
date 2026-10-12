CREATE TABLE "analysis_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"advisor_id" text NOT NULL,
	"filename" text NOT NULL,
	"pdf" "bytea",
	"pdf_sha256" text NOT NULL,
	"held" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"company" text,
	"product_name" text,
	"category" text,
	"result_json" text,
	"note" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"done_at" text
);
--> statement-breakpoint
ALTER TABLE "analysis_requests" ADD CONSTRAINT "analysis_requests_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_requests_status" ON "analysis_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "analysis_requests_sha" ON "analysis_requests" USING btree ("pdf_sha256");