CREATE TABLE "gap_overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"advisor_id" text NOT NULL,
	"gap_key" text NOT NULL,
	"level" text NOT NULL,
	"system_level" text NOT NULL,
	"reason_enc" text NOT NULL,
	"expires_at" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "gap_overrides_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gap_overrides" ADD CONSTRAINT "gap_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gap_overrides" ADD CONSTRAINT "gap_overrides_advisor_id_advisors_id_fk" FOREIGN KEY ("advisor_id") REFERENCES "public"."advisors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gap_overrides_user" ON "gap_overrides" USING btree ("user_id","seq");