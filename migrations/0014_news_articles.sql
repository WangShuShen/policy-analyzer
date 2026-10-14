CREATE TABLE "news_articles" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body" text NOT NULL,
	"category" text NOT NULL,
	"cover" text DEFAULT 'i-doc' NOT NULL,
	"sources" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"author_id" text,
	"visible" integer DEFAULT 0 NOT NULL,
	"pub_title" text,
	"pub_summary" text,
	"pub_body" text,
	"pub_category" text,
	"pub_cover" text,
	"pub_sources" text,
	"published_at" text,
	"pub_updated_at" text,
	"reviewed_by" text,
	"reviewed_at" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	"updated_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	CONSTRAINT "news_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "news_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"article_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"snapshot" text,
	"created_at" text DEFAULT to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "news_reviews" ADD CONSTRAINT "news_reviews_article_id_news_articles_id_fk" FOREIGN KEY ("article_id") REFERENCES "public"."news_articles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "news_articles_public" ON "news_articles" USING btree ("visible","published_at");--> statement-breakpoint
CREATE INDEX "news_reviews_article" ON "news_reviews" USING btree ("article_id","created_at");