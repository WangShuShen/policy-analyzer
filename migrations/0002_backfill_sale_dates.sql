-- R2：從 coverage_template 回填銷售起訖日（實作設計 P1、設計準則 R2）
-- 爬蟲早就抓了 saleDate／stopDate，只是當初只塞進 coverage_template 的 JSON 字串裡。
-- 用正規表示式抽，不把整欄轉 jsonb：少數舊的分析快取格式不同，硬轉會讓整支 migration 失敗。
-- 只補還是 NULL 的，可重複執行。
UPDATE "products"
SET "sale_start_date" = substring("coverage_template" from '"_saleDate":"([0-9]{4}-[0-9]{2}-[0-9]{2})"')
WHERE "sale_start_date" IS NULL
  AND "coverage_template" ~ '"_saleDate":"[0-9]{4}-[0-9]{2}-[0-9]{2}"';
--> statement-breakpoint
UPDATE "products"
SET "sale_end_date" = substring("coverage_template" from '"_stopDate":"([0-9]{4}-[0-9]{2}-[0-9]{2})"')
WHERE "sale_end_date" IS NULL
  AND "coverage_template" ~ '"_stopDate":"[0-9]{4}-[0-9]{2}-[0-9]{2}"';
