CREATE TABLE "advisor_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"advisor_id" text NOT NULL,
	"user_id" text NOT NULL,
	"source" text DEFAULT 'platform' NOT NULL,
	"outcome" text DEFAULT 'open' NOT NULL,
	"outcome_note" text,
	"follow_up_on" text,
	"follow_up_note" text,
	"phone" text,
	"note" text,
	"consent_by" text,
	"consent_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_interactions" (
	"id" text PRIMARY KEY NOT NULL,
	"advisor_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"happened_on" text NOT NULL,
	"summary" text NOT NULL,
	"deleted_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "todo_states" (
	"advisor_id" text NOT NULL,
	"key" text NOT NULL,
	"snoozed_until" text,
	"dismissed_at" text,
	"dismiss_reason" text,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	CONSTRAINT "todo_states_advisor_id_key_pk" PRIMARY KEY("advisor_id","key")
);
--> statement-breakpoint
CREATE TABLE "view_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"page" text NOT NULL,
	"ref_id" text,
	"sections" text,
	"duration_ms" integer,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advisors" ADD COLUMN "response_label" text;--> statement-breakpoint
ALTER TABLE "advisors" ADD COLUMN "response_median_min" integer;--> statement-breakpoint
ALTER TABLE "advisors" ADD COLUMN "response_samples" integer;--> statement-breakpoint
ALTER TABLE "advisors" ADD COLUMN "response_on" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "passbook_reminded_at" text;--> statement-breakpoint
ALTER TABLE "advisor_clients" ADD CONSTRAINT "advisor_clients_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_clients" ADD CONSTRAINT "advisor_clients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_interactions" ADD CONSTRAINT "client_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "todo_states" ADD CONSTRAINT "todo_states_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_events" ADD CONSTRAINT "view_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "advisor_clients_pair" ON "advisor_clients" USING btree ("advisor_id","user_id");--> statement-breakpoint
CREATE INDEX "advisor_clients_follow" ON "advisor_clients" USING btree ("advisor_id","follow_up_on");--> statement-breakpoint
CREATE INDEX "client_interactions_pair" ON "client_interactions" USING btree ("advisor_id","user_id","happened_on");--> statement-breakpoint
CREATE INDEX "view_events_user" ON "view_events" USING btree ("user_id","page","created_at");