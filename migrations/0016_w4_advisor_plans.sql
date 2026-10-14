CREATE TABLE "advisor_plan_versions" (
	"plan_id" text NOT NULL,
	"version" integer NOT NULL,
	"plan_enc" text NOT NULL,
	"schema_version" text NOT NULL,
	"saved_by" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	CONSTRAINT "advisor_plan_versions_plan_id_version_pk" PRIMARY KEY("plan_id","version")
);
--> statement-breakpoint
CREATE TABLE "advisor_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"advisor_id" text NOT NULL,
	"user_id" text NOT NULL,
	"plan_enc" text NOT NULL,
	"schema_version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"unlocked_at" text,
	"unlocked_by" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advisor_plan_versions" ADD CONSTRAINT "advisor_plan_versions_plan_id_advisor_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."advisor_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_plans" ADD CONSTRAINT "advisor_plans_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advisor_plans" ADD CONSTRAINT "advisor_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advisor_plans_user" ON "advisor_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "advisor_plans_advisor" ON "advisor_plans" USING btree ("advisor_id","updated_at");