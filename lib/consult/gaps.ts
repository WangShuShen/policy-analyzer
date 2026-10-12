import db from "@/lib/db";
import { gapOverrides, facts as factsTable, bookings, advisors, auditLogs } from "@/lib/schema";
import { and, asc, eq } from "drizzle-orm";
import { encryptJson, decryptJson } from "@/lib/fieldCrypto";
import { currentAssumptions } from "@/lib/calc/assumptions";
import { gradeGaps, applyOverrides, LEVEL_LABEL, type FinalGapRow, type GapFacts, type GapKey, type GapLevel, type GapOverride } from "@/lib/calc/gaps";
import { view as passbookView, type PassbookView } from "@/lib/passbook/service";
import { computeAll, inputsFromFacts } from "@/lib/calc/engine";

/*
 * 缺口分級的資料面（實作設計 G1–G8）：把客戶的需求點與全險圖整理成判級輸入，套上顧問的改級。
 * 客戶端（我的分析）與顧問端看的是同一份——客戶看到的就是顧問核過的版本。
 */

/** 這位客戶所有對話的需求點（同一個 key 取最新）。分級是看「這個人」，不是看某一段對話 */
export async function userFacts(userId: string): Promise<Map<string, { display: string; number: number | null }>> {
  const rows = await db.select().from(factsTable).where(eq(factsTable.user_id, userId)).orderBy(asc(factsTable.updated_at));
  const m = new Map<string, { display: string; number: number | null }>();
  for (const r of rows) m.set(r.key, decryptJson(r.value_enc));
  return m;
}

export function gapFactsOf(f: Map<string, { display: string; number: number | null }>, survivorNeed: number | null): GapFacts {
  const d = (k: string) => f.get(k)?.display ?? null;
  return { care: d("care"), incomeShare: d("income_share"), debt: d("debt"), family: d("family"), buffer: d("buffer"), survivorNeed };
}

async function overridesOf(userId: string): Promise<GapOverride[]> {
  const rows = await db.select({ o: gapOverrides, name: advisors.name }).from(gapOverrides)
    .leftJoin(advisors, eq(advisors.id, gapOverrides.advisor_id))
    .where(eq(gapOverrides.user_id, userId)).orderBy(asc(gapOverrides.seq));
  // seq 遞增 → 用 seq 當排序鍵（created_at 只到秒）
  return rows.map(r => ({ key: r.o.gap_key as GapKey, level: r.o.level as GapLevel, reason: decryptJson<string>(r.o.reason_enc), advisorName: r.name, at: String(r.o.seq).padStart(12, "0") }));
}

/** 沒有存摺、或存摺還沒算出任何一張 → 判不了級（回 null） */
export async function computeGaps(userId: string, pb: Omit<PassbookView, "lifeCover"> | null, survivorNeed: number | null): Promise<FinalGapRow[] | null> {
  if (!pb?.coverage || pb.counts.counted === 0) return null;
  const cover = pb.coverage.map(c => ({ key: c.key as GapKey, label: c.label, amount: c.amount, display: c.value, preliminary: c.preliminary, missing: c.missing }));
  const rows = gradeGaps(cover, gapFactsOf(await userFacts(userId), survivorNeed), currentAssumptions());
  return applyOverrides(rows, await overridesOf(userId));
}

/** 顧問只能看、只能改自己有預約的客戶（應用層隔離，設計準則 §1） */
export async function advisorCanSee(advisorId: string, userId: string): Promise<boolean> {
  const [b] = await db.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.advisor_id, advisorId), eq(bookings.user_id, userId))).limit(1);
  return !!b;
}

export async function audit(advisorId: string, action: string, userId: string, targetType: string, targetId: string | null = null) {
  await db.insert(auditLogs).values({ actor_id: advisorId, actor_role: "advisor", action, target_user_id: userId, target_type: targetType, target_id: targetId });
}

const oneYearLater = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); };

/** 顧問改級（G1）：理由必填；改回系統原判也記一筆（等於撤銷） */
export async function overrideGap(advisorId: string, userId: string, key: GapKey, level: GapLevel, reason: string, systemLevel: GapLevel): Promise<void> {
  await db.insert(gapOverrides).values({
    id: crypto.randomUUID(), user_id: userId, advisor_id: advisorId, gap_key: key, level, system_level: systemLevel,
    reason_enc: encryptJson(reason), expires_at: oneYearLater(),
  });
  await audit(advisorId, "override_gap", userId, "gap", key);
}

/** 顧問端用：不經過某段對話，直接以這個人的全部需求點＋最新存摺算 */
export async function computeGapsForUser(userId: string): Promise<FinalGapRow[] | null> {
  const f = await userFacts(userId);
  const inputs = inputsFromFacts([...f.entries()].map(([key, v]) => ({ key, number: v.number })));
  const survivorNeed = inputs.inc !== undefined ? computeAll(inputs, currentAssumptions()).survivor.longNeed : null;
  const { stuck: _s, lifeCover: _l, ...pb } = await passbookView(userId);
  return computeGaps(userId, pb, survivorNeed);
}

export { LEVEL_LABEL };
