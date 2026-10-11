import { sql } from "drizzle-orm";
import { pgTable, text, integer, primaryKey, unique } from "drizzle-orm/pg-core";

/*
 * 資料庫結構的唯一真實來源。改這裡 → `npm run db:generate` 產生 migration → `npm run db:migrate`。
 * 不准再在程式裡寫 CREATE TABLE IF NOT EXISTS 或 ensureColumn（設計準則 §1）。
 *
 * 時間欄位刻意存成文字，格式與舊 SQLite 的 datetime('now') 相同（UTC，"YYYY-MM-DD HH:MM:SS"），
 * 既有程式裡的字串比對與排序因此不用改。
 */
export const nowText = sql`to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
const createdAt = () => text("created_at").notNull().default(nowText);
const updatedAt = () => text("updated_at").notNull().default(nowText);

export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull().unique(),
  created_at: createdAt(),
});

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  company_id: integer("company_id").notNull().references(() => companies.id),
  product_name: text("product_name").notNull(),
  plan_code: text("plan_code").notNull(),
  plan_type: text("plan_type"),
  year: text("year"),
  version: text("version"),
  category: text("category"),
  coverage_template: text("coverage_template").notNull(),
  file_path: text("file_path"),
  verified: integer("verified").notNull().default(0),
  formula_json: text("formula_json"),
  formula_verified: integer("formula_verified").notNull().default(0),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [unique("products_identity").on(t.company_id, t.plan_code, t.plan_type, t.year, t.version)]);

export const analyses = pgTable("analyses", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  product_id: integer("product_id").notNull().references(() => products.id),
  insured_amount: text("insured_amount").notNull(),
  analysis_json: text("analysis_json").notNull(),
  file_path: text("file_path"),
  created_at: createdAt(),
  // 發起分析的使用者（顧問為 advisors.id、客戶為 users.id），兩種身分共用故不設外鍵
  user_id: text("user_id"),
});

export const corrections = pgTable("corrections", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  product_id: integer("product_id").notNull().references(() => products.id),
  field_path: text("field_path").notNull(),
  old_value: text("old_value"),
  new_value: text("new_value").notNull(),
  note: text("note"),
  created_at: createdAt(),
});

export const advisors = pgTable("advisors", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  is_admin: integer("is_admin").notNull().default(0),
  is_active: integer("is_active").notNull().default(1),
  created_at: createdAt(),
});

export const policyAssignments = pgTable("policy_assignments", {
  id: text("id").primaryKey(),
  policy_uuid: text("policy_uuid").notNull(),
  // 刻意不設外鍵：刪除顧問帳號時保留他的審核歷史（舊 SQLite 未強制外鍵，行為一致）
  advisor_id: text("advisor_id").notNull(),
  assigned_date: text("assigned_date").notNull(),
  status: text("status").notNull().default("pending"),
  completed_at: text("completed_at"),
  created_at: createdAt(),
}, t => [unique("policy_assignments_policy_date").on(t.policy_uuid, t.assigned_date)]);

// 客戶帳號（訂閱制使用者）。與內部顧問白名單 advisors 刻意分離：
// advisors 是員工，users 是付費客戶，兩者權限與生命週期完全不同。
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  plan_expires_at: text("plan_expires_at"),
  quota_used: integer("quota_used").notNull().default(0),
  quota_reset_at: text("quota_reset_at"),
  is_active: integer("is_active").notNull().default(1),
  created_at: createdAt(),
  last_login_at: text("last_login_at"),
});

// 每月用量計數。period 為 YYYY-MM，換月自然產生新列，「每月重置」不需要排程歸零。
export const usageCounters = pgTable("usage_counters", {
  user_id: text("user_id").notNull(),
  period: text("period").notNull(),
  action: text("action").notNull(),
  count: integer("count").notNull().default(0),
  updated_at: updatedAt(),
}, t => [primaryKey({ columns: [t.user_id, t.period, t.action] })]);

// 訂閱狀態（一位使用者同時只會有一筆 active）
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("pending"),
  merchant_trade_no: text("merchant_trade_no").notNull().unique(),
  gwsr: text("gwsr"),
  current_period_end: text("current_period_end"),
  fail_count: integer("fail_count").notNull().default(0),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// 每次扣款的原始紀錄。(merchant_trade_no, trade_no) 唯一，綠界重送 webhook 時據此做冪等。
export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  merchant_trade_no: text("merchant_trade_no").notNull(),
  trade_no: text("trade_no").notNull(),
  user_id: text("user_id"),
  plan: text("plan"),
  amount: integer("amount"),
  rtn_code: integer("rtn_code"),
  rtn_msg: text("rtn_msg"),
  raw: text("raw"),
  created_at: createdAt(),
}, t => [unique("payments_trade").on(t.merchant_trade_no, t.trade_no)]);

// 審核流程的唯一真實來源（取代本機 uuid_registry.json + analyzed/*.json）
export const policies = pgTable("policies", {
  uuid: text("uuid").primaryKey(),
  plan_code: text("plan_code").notNull(),
  company: text("company"),
  product_name: text("product_name"),
  pdf_drive_id: text("pdf_drive_id"),
  rate_drive_id: text("rate_drive_id"),
  filename: text("filename"),
  category: text("category"),
  status: text("status").notNull().default("uploaded"),
  analysis_json: text("analysis_json"),
  uploaded_at: text("uploaded_at"),
  archived_at: text("archived_at"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});
