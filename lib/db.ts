import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { eq, and, desc, sql, type AnyColumn } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";
import { advisors, users, nowText } from "./schema";

/*
 * Postgres（Neon）連線。結構定義在 lib/schema.ts，變更一律走 migrations/（設計準則 §1）。
 * 連線字串用 Neon 的 pooled URL（-pooler），serverless 每個實例只開少量連線。
 * 開發模式下快取在 globalThis，避免熱重載時每次都開新的 Pool。
 */
type DB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __radiaPool?: Pool; __radiaDb?: DB };

function connect(): DB {
  if (g.__radiaDb) return g.__radiaDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL 環境變數");
  g.__radiaPool = new Pool({ connectionString: url, max: 5 });
  g.__radiaDb = drizzle(g.__radiaPool, { schema });
  return g.__radiaDb;
}

// 延遲到第一次使用才連線：build 階段沒有 DATABASE_URL 也不會失敗
const db = new Proxy({} as DB, {
  get: (_t, prop) => {
    const real = connect();
    const v = Reflect.get(real, prop);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
export default db;
export { nowText };

/*
 * 空值排序與舊 SQLite 一致：SQLite 把 NULL 當最小（ASC 在前、DESC 在後），
 * Postgres 預設相反。可為空的欄位排序一律用這兩個，否則清單順序會悄悄改變。
 */
export const ascNullsFirst = (c: AnyColumn) => sql`${c} ASC NULLS FIRST`;
export const descNullsLast = (c: AnyColumn) => sql`${c} DESC NULLS LAST`;

export async function getAdvisorByEmail(email: string): Promise<AdvisorRow | null> {
  const rows = await db.select().from(advisors)
    .where(and(eq(advisors.email, email), eq(advisors.is_active, 1))).limit(1);
  return rows[0] ?? null;
}

export async function listAdvisors(): Promise<AdvisorRow[]> {
  return db.select().from(advisors).orderBy(desc(advisors.created_at));
}

// ── 客戶帳號（訂閱制） ──────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

/**
 * 客戶登入時取得帳號，不存在則自動註冊（免費方案）。
 * 回傳的 justCreated 供呼叫端決定是否導向新手引導。
 */
export async function upsertUserOnLogin(
  email: string,
  name: string
): Promise<{ user: UserRow; justCreated: boolean }> {
  const existing = await getUserByEmail(email);
  if (existing) {
    await db.update(users).set({ last_login_at: nowText, name }).where(eq(users.id, existing.id));
    return { user: { ...existing, name, last_login_at: new Date().toISOString() }, justCreated: false };
  }

  const [created] = await db.insert(users)
    .values({ id: crypto.randomUUID(), email, name, plan: "free", last_login_at: nowText })
    .returning();
  if (!created) throw new Error("建立使用者後查詢失敗");
  return { user: created, justCreated: true };
}

export type UserRow = typeof users.$inferSelect;
export type AdvisorRow = typeof advisors.$inferSelect;
export type ProductRow = typeof schema.products.$inferSelect;
export type AnalysisRow = typeof schema.analyses.$inferSelect;
export type CorrectionRow = typeof schema.corrections.$inferSelect;
export type PolicyRow = typeof schema.policies.$inferSelect;

// ── 給付公式型別（審核頁與試算共用）──────────────────────────────

// 金額來源（位階由高到低）：計劃 > 附表/單位別 > 保額計算 > 定額
// 有計劃別就帶計劃撈值、有附表就查表、否則用保額算、再否則定額
// 金額來源（依計算基準）：保額→insured、計劃→plan、單位→unit、固定→fixed、附表→table
export type ValueSource = "plan" | "table" | "insured" | "unit" | "fixed" | "note";

export interface FormulaItem {
  label: string;
  value_source: ValueSource;
  unit: string; // 萬 | 元/日 | 元/次 | 元/月 | 元

  // value_source = "note"（說明型）：無法以公式試算（依所繳保費/加計利息等），顯示說明文字
  formula?: string;

  // 給付性質（正交於 value_source）：true=限額（顯示「限額 X」），未設=定額給付
  is_limit?: boolean;

  // value_source = "plan"：各計劃別對應的實際金額
  plan_values?: Record<string, number>;
  // value_source = "table"：附表/單位別查出的金額範圍（最低～最高）
  table_range?: { min: number; max: number };
  // value_source = "insured"：用保額計算（倍數或百分比；可為單一 rate 或範圍）
  insured_rate?: { type: "multiplier" | "percentage"; rate?: number; min?: number; max?: number };
  // value_source = "fixed"（定額）/ "unit"（每單位金額，試算時 ×單位數 N）：共用 amount
  amount?: number;

  limit?: { days?: number; times?: number };
  restriction?: string;
  note?: string;

  // ── legacy（舊資料相容，新格式不再使用）──
  type?: "fixed" | "multiplier" | "reimbursement" | "range" | "lump_sum";
  multiplier?: number;
  rate_type?: "multiplier" | "percentage";
  min_rate?: number;
  max_rate?: number;
}

export interface FormulaJson {
  base_unit: string;        // 保額單位（萬 / 元/日 …）
  currency?: string;        // 幣別（新台幣 / 美元）
  plans?: string[];         // 計劃清單（如 ["1","2","3"]）；空代表無計劃別
  items: FormulaItem[];
  filled_by: string;
  filled_at: string;
}
