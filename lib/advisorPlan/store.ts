import db, { nowText } from "@/lib/db";
import { advisorPlans, advisorPlanVersions, companies } from "@/lib/schema";
import { and, desc, eq } from "drizzle-orm";
import { decryptJson, encryptJson } from "@/lib/fieldCrypto";
import { advisorHasClient } from "@/lib/advisor/clients";
import { audit } from "@/lib/consult/gaps";
import { PLAN_SCHEMA_VERSION, validatePlan, type Plan } from "./validate";
import { clientView, type ClientPlanView } from "./clientView";

/*
 * 保障規劃書的讀寫（W4 地基 B3a；4-i PlanLock、4-n、N1、N12、4-aj）。
 *
 * - 顧問：只能替「自己的客戶」（advisorHasClient：預約過、或卡 D 的手動客戶）建規劃書；
 *   只讀得到、改得到自己建的。每次讀內容都寫稽核（跟諮詢紀錄一樣，N12）
 * - 客戶：只讀得到自己的、而且是「已解鎖」的；拿到的是 clientView（不含商品名、公司名、收入負債健康）
 * - plan.json 整份加密存；每存一次留一版（advisor_plan_versions，只加不改）
 */
export type PlanStatus = "draft" | "ready" | "unlocked";
export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = { draft: "草稿", ready: "已產出・未解鎖", unlocked: "已解鎖" };

export class PlanError extends Error {
  constructor(message: string, public code: "not_found" | "not_my_client" | "invalid" | "bad_status", public details: string[] = []) { super(message); }
}

export interface PlanMeta { id: string; userId: string; advisorId: string; status: PlanStatus; version: number; schemaVersion: string; unlockedAt: string | null; createdAt: string; updatedAt: string }
const metaOf = (r: typeof advisorPlans.$inferSelect): PlanMeta => ({
  id: r.id, userId: r.user_id, advisorId: r.advisor_id, status: r.status as PlanStatus, version: r.version,
  schemaVersion: r.schema_version, unlockedAt: r.unlocked_at, createdAt: r.created_at, updatedAt: r.updated_at,
});

function checked(plan: unknown): { plan: Plan; warnings: string[] } {
  const c = validatePlan(plan);
  if (!c.ok) throw new PlanError(`plan.json 有 ${c.errors.length} 個錯誤`, "invalid", c.errors);
  return { plan: plan as Plan, warnings: c.warnings };
}

async function ownPlan(advisorId: string, planId: string) {
  const [r] = await db.select().from(advisorPlans).where(and(eq(advisorPlans.id, planId), eq(advisorPlans.advisor_id, advisorId))).limit(1);
  if (!r) throw new PlanError("找不到這份規劃書", "not_found");   // 別的顧問的也回找不到，不透露存在
  return r;
}

/** 建立（第 1 版）。savedBy 給匯入腳本標來源用 */
export async function createPlan(advisorId: string, userId: string, plan: unknown, opts: { status?: PlanStatus; savedBy?: string } = {}) {
  if (!(await advisorHasClient(advisorId, userId))) throw new PlanError("這位客戶不是你的客戶", "not_my_client");
  const { warnings } = checked(plan);
  const status = opts.status ?? "draft";
  if (status === "unlocked") throw new PlanError("新建的規劃書不能直接解鎖，面談時再解鎖", "bad_status");
  const id = crypto.randomUUID(), enc = encryptJson(plan);
  await db.transaction(async tx => {
    await tx.insert(advisorPlans).values({ id, advisor_id: advisorId, user_id: userId, plan_enc: enc, schema_version: PLAN_SCHEMA_VERSION, status, version: 1 });
    await tx.insert(advisorPlanVersions).values({ plan_id: id, version: 1, plan_enc: enc, schema_version: PLAN_SCHEMA_VERSION, saved_by: opts.savedBy ?? advisorId });
  });
  await audit(advisorId, "create_plan", userId, "plan", id);
  return { id, version: 1, warnings };
}

/** 改內容：存成新的一版（舊版留著）。已解鎖的照樣能改，客戶看到的就是最新版 */
export async function updatePlan(advisorId: string, planId: string, plan: unknown, opts: { savedBy?: string } = {}) {
  const { warnings } = checked(plan);
  const enc = encryptJson(plan);
  const r = await ownPlan(advisorId, planId);
  const version = await db.transaction(async tx => {
    // 鎖住這一列再 +1，兩個分頁同時存也不會撞同一個版本號
    const [cur] = await tx.select({ v: advisorPlans.version }).from(advisorPlans).where(eq(advisorPlans.id, planId)).for("update");
    const v = cur.v + 1;
    await tx.update(advisorPlans).set({ plan_enc: enc, schema_version: PLAN_SCHEMA_VERSION, version: v, updated_at: nowText }).where(eq(advisorPlans.id, planId));
    await tx.insert(advisorPlanVersions).values({ plan_id: planId, version: v, plan_enc: enc, schema_version: PLAN_SCHEMA_VERSION, saved_by: opts.savedBy ?? advisorId });
    return v;
  });
  await audit(advisorId, "update_plan", r.user_id, "plan", planId);
  return { id: planId, version, warnings };
}

/** 改狀態：draft → ready（已產出未解鎖）→ unlocked（面談時解鎖）；也可以退回 */
export async function setPlanStatus(advisorId: string, planId: string, status: PlanStatus) {
  const r = await ownPlan(advisorId, planId);
  const unlocked = status === "unlocked";
  await db.update(advisorPlans).set({
    status, updated_at: nowText,
    unlocked_at: unlocked ? (r.status === "unlocked" ? r.unlocked_at : nowText) : null,
    unlocked_by: unlocked ? (r.status === "unlocked" ? r.unlocked_by : advisorId) : null,
  }).where(eq(advisorPlans.id, planId));
  await audit(advisorId, unlocked ? "unlock_plan" : status === "ready" ? "ready_plan" : "draft_plan", r.user_id, "plan", planId);
  const [after] = await db.select().from(advisorPlans).where(eq(advisorPlans.id, planId));
  return metaOf(after);
}

/** 顧問讀完整內容（含商品名，只有顧問端）。寫稽核 */
export async function getPlanForAdvisor(advisorId: string, planId: string, version?: number) {
  const r = await ownPlan(advisorId, planId);
  let enc = r.plan_enc;
  if (version && version !== r.version) {
    const [v] = await db.select().from(advisorPlanVersions).where(and(eq(advisorPlanVersions.plan_id, planId), eq(advisorPlanVersions.version, version)));
    if (!v) throw new PlanError("沒有這一版", "not_found");
    enc = v.plan_enc;
  }
  await audit(advisorId, "view_plan", r.user_id, "plan", planId);
  const plan = decryptJson<Plan>(enc);
  return { meta: metaOf(r), shownVersion: version ?? r.version, plan, warnings: validatePlan(plan).warnings };
}

/** 顧問看某位客戶有哪些規劃書（只有清單，不含內容） */
export async function listPlansForClient(advisorId: string, userId: string): Promise<PlanMeta[]> {
  if (!(await advisorHasClient(advisorId, userId))) throw new PlanError("這位客戶不是你的客戶", "not_my_client");
  const rows = await db.select().from(advisorPlans).where(and(eq(advisorPlans.advisor_id, advisorId), eq(advisorPlans.user_id, userId))).orderBy(desc(advisorPlans.created_at));
  return rows.map(metaOf);
}

export async function listVersions(advisorId: string, planId: string) {
  await ownPlan(advisorId, planId);
  return db.select({ version: advisorPlanVersions.version, savedBy: advisorPlanVersions.saved_by, createdAt: advisorPlanVersions.created_at })
    .from(advisorPlanVersions).where(eq(advisorPlanVersions.plan_id, planId)).orderBy(desc(advisorPlanVersions.version));
}

// ── 客戶端 ──
const unlockedOf = (userId: string) => and(eq(advisorPlans.user_id, userId), eq(advisorPlans.status, "unlocked"));

export async function listMyPlans(userId: string) {
  const rows = await db.select().from(advisorPlans).where(unlockedOf(userId)).orderBy(desc(advisorPlans.unlocked_at));
  return rows.map(r => ({ id: r.id, unlockedAt: r.unlocked_at, updatedAt: r.updated_at }));
}

/** 客戶讀自己已解鎖的規劃書：只回 clientView（4-aj），未解鎖或別人的一律「找不到」 */
export async function getMyPlan(userId: string, planId: string): Promise<{ id: string; unlockedAt: string | null; plan: ClientPlanView }> {
  const [r] = await db.select().from(advisorPlans).where(and(eq(advisorPlans.id, planId), unlockedOf(userId))).limit(1);
  if (!r) throw new PlanError("找不到這份規劃書", "not_found");
  const names = (await db.select({ n: companies.name }).from(companies)).map(x => x.n);
  return { id: r.id, unlockedAt: r.unlocked_at, plan: clientView(decryptJson<Plan>(r.plan_enc), names) };
}

