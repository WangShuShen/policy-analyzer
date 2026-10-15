import db, { nowText } from "@/lib/db";
import { aiUsage, passbookUploads, clientPolicies, policies } from "@/lib/schema";
import { and, asc, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { encryptJson, decryptJson } from "@/lib/fieldCrypto";
import { readPassbook, type PassbookContent, type PassbookPolicy, type ReadUsage } from "./read";
import { matchPolicy, MATCH_REASON } from "./catalog";
import { BUCKETS, bucketGuess, bucketOf, evaluateItem, fmtValue, type AnalysisJson, type BucketKey, type ItemValue } from "./coverage";

/*
 * 保險存摺的流程（實作設計 P1–P4）：
 *
 *   上傳（瀏覽器已解鎖）→ queued → reading（AI 讀清單）→ confirming（等客戶確認）
 *     → matching（對版本、找公式，必要時讀條款）→ done ／ failed
 *
 * 背景執行（P2）：API 回應後用 after() 接著跑；對話照常繼續，不等它。
 * 卡住的（函式逾時、部署中斷）在客戶下次查狀態時自動重跑（W1b 換成正式佇列＋Cron，T7）。
 *
 * client_policies.raw_enc 存一整包（加密）：讀到的原始欄位、客戶的修改、對版本結果。
 * match_status：unconfirmed（還沒確認）→ matched（公式已審）｜ai_read（AI 初步讀取）｜pending（待補）｜removed（客戶說已解約）
 */

export interface StoredPolicy {
  read: PassbookPolicy;                               // AI 讀到的（不改）
  idx?: number;                                       // 在存摺裡的順序（同一批寫入 created_at 相同，排不出先後）
  edits?: { amount?: number | null; amount_unit?: string | null; plan?: string | null };   // 客戶確認時改的
  match?: { planCode: string; productName: string; productType: string | null; how: string; dateCheck: string } | { reason: string; detail?: string };
}

const oneYearLater = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); };
const MAX_TEXT = 200_000, MAX_IMAGES = 10, MAX_IMAGE_B64 = 1_000_000, MAX_TOTAL_B64 = 4_000_000;   // Vercel 函式請求上限 4.5MB

export class PassbookError extends Error {}

// ── 上傳 ──────────────────────────────────────────────────────────

export async function createUpload(userId: string, convId: string | null, c: PassbookContent): Promise<string> {
  if (c.kind === "text") {
    const len = c.pages.reduce((a, p) => a + p.length, 0);
    if (len < 30) throw new PassbookError("這份檔案讀不到文字，可能是掃描檔——請改用截圖上傳");
    if (len > MAX_TEXT) throw new PassbookError("檔案太大了，請只上傳保單清單那幾頁");
  } else {
    if (!c.images.length || c.images.length > MAX_IMAGES) throw new PassbookError(`截圖請上傳 1～${MAX_IMAGES} 張`);
    if (c.images.some(i => i.data.length > MAX_IMAGE_B64) || c.images.reduce((a, i) => a + i.data.length, 0) > MAX_TOTAL_B64) {
      throw new PassbookError("截圖太大了，請少傳幾張或重新截圖");
    }
  }
  if (c.kind === "text") c = { kind: "text", pages: c.pages.map(p => p.normalize("NFKC")) };
  const id = crypto.randomUUID();
  await db.insert(passbookUploads).values({
    id, user_id: userId, conversation_id: convId,
    file_ref_enc: encryptJson(c),                     // W1a：解鎖後的內容加密存在這裡（不存原檔）；W1b 視量改物件儲存
    mime: c.kind === "text" ? "text/plain" : c.images[0].mime,
    status: "queued", expires_at: oneYearLater(),
  });
  return id;
}

async function setStatus(id: string, status: string, error: string | null = null) {
  await db.update(passbookUploads).set({ status, error, updated_at: nowText }).where(eq(passbookUploads.id, id));
}

/** ① 讀清單 */
export async function processRead(uploadId: string): Promise<ReadUsage | null> {
  const [u] = await db.select().from(passbookUploads).where(eq(passbookUploads.id, uploadId)).limit(1);
  if (!u || !["queued", "reading"].includes(u.status)) return null;
  await setStatus(uploadId, "reading");
  try {
    const { result, usage } = await readPassbook(decryptJson<PassbookContent>(u.file_ref_enc));
    // 費用記進 ai_usage：後台監控看得到，但不算進客戶每天上限（10/15 #15）。記失敗不影響讀存摺
    await db.insert(aiUsage).values({ id: crypto.randomUUID(), kind: "passbook_read", ref_id: uploadId, user_id: u.user_id, model: usage.model,
      tokens_in: usage.tokensIn, tokens_out: usage.tokensOut, cost_micro_usd: usage.costMicroUsd }).catch(e => console.error("[passbook] usage", e));
    if (!result.is_passbook) { await setStatus(uploadId, "failed", "這份檔案看起來不是保險存摺，要不要再確認一下？"); return usage; }
    if (!result.policies.length) { await setStatus(uploadId, "failed", "存摺裡沒有讀到任何保單，可能是頁面不完整"); return usage; }
    await db.delete(clientPolicies).where(eq(clientPolicies.upload_id, uploadId));    // 重跑時不重複
    await db.insert(clientPolicies).values(result.policies.map((p, idx) => ({
      id: crypto.randomUUID(), user_id: u.user_id, upload_id: uploadId,
      raw_enc: encryptJson({ read: p, idx } satisfies StoredPolicy),
      match_status: "unconfirmed", expires_at: oneYearLater(),
    })));
    // AI 的讀取備註（哪裡看不清楚）是給顧問核對用的，不給客戶看——寫在伺服器紀錄，不放進 error
    if (result.unreadable_note) console.info("[passbook] read note", uploadId, result.unreadable_note);
    await setStatus(uploadId, "confirming");
    return usage;
  } catch (e) {
    console.error("[passbook] read failed", uploadId, e);
    await setStatus(uploadId, "failed", "讀取時出了問題，請再上傳一次；還是不行的話面談時帶紙本也可以");
    return null;
  }
}

// ── ② 客戶確認 ────────────────────────────────────────────────────

export interface ConfirmItem { id: string; keep: boolean; amount?: number | null; amount_unit?: string | null; plan?: string | null }

export async function confirm(userId: string, uploadId: string, items: ConfirmItem[]): Promise<void> {
  const [u] = await db.select().from(passbookUploads)
    .where(and(eq(passbookUploads.id, uploadId), eq(passbookUploads.user_id, userId))).limit(1);
  if (!u) throw new PassbookError("找不到這份存摺");
  if (u.status !== "confirming") throw new PassbookError("這份存摺已經確認過了");
  const rows = await db.select().from(clientPolicies).where(and(eq(clientPolicies.upload_id, uploadId), eq(clientPolicies.user_id, userId)));
  for (const r of rows) {
    const it = items.find(i => i.id === r.id);
    const sp = decryptJson<StoredPolicy>(r.raw_enc);
    if (it && (it.amount !== undefined || it.amount_unit !== undefined || it.plan !== undefined)) {
      sp.edits = { amount: it.amount, amount_unit: it.amount_unit, plan: it.plan };
    }
    await db.update(clientPolicies).set({
      raw_enc: encryptJson(sp), confirmed_by_user: 1,
      match_status: it && !it.keep ? "removed" : "unconfirmed", updated_at: nowText,
    }).where(eq(clientPolicies.id, r.id));
  }
  await setStatus(uploadId, "matching");
}

// ── ③ 對版本＋找公式 ──────────────────────────────────────────────

/**
 * 命中目錄但條款還沒分析：不在現場呼叫 API，排進 skill 批次分析佇列（訂閱額度，2026-10-12 顧問決定）。
 * scripts/skill-fetch.mjs 會先拿 requested_at 有值的；分析完寫回 policies，view() 下次讀到就自動變「初步」。
 */
async function requestAnalysis(planCode: string): Promise<void> {
  await db.update(policies)
    .set({ requested_at: sql`coalesce(${policies.requested_at}, ${nowText})`, request_count: sql`${policies.request_count} + 1`, updated_at: nowText })
    .where(and(eq(policies.plan_code, planCode), eq(policies.status, "pending_analysis")));
}

async function formulaStatus(planCode: string): Promise<"matched" | "ai_read" | "none"> {
  const rows = await db.select({ status: policies.status }).from(policies)
    .where(and(eq(policies.plan_code, planCode), isNotNull(policies.analysis_json), inArray(policies.status, ["archived", "uploaded"])));
  if (rows.some(r => r.status === "archived")) return "matched";
  return rows.length ? "ai_read" : "none";
}

export async function processMatch(uploadId: string): Promise<void> {
  const [u] = await db.select().from(passbookUploads).where(eq(passbookUploads.id, uploadId)).limit(1);
  if (!u || u.status !== "matching") return;
  const rows = await db.select().from(clientPolicies)
    .where(and(eq(clientPolicies.upload_id, uploadId), eq(clientPolicies.match_status, "unconfirmed")));

  for (const r of rows) {
    const sp = decryptJson<StoredPolicy>(r.raw_enc);
    const m = matchPolicy({ company: sp.read.company, productName: sp.read.product_name, effectiveDate: sp.read.effective_date });
    let status: "matched" | "ai_read" | "pending" = "pending";
    if (m.ok) {
      sp.match = { planCode: m.product.planCode, productName: m.product.productName, productType: m.product.productType, how: m.how, dateCheck: m.dateCheck };
      const f = await formulaStatus(m.product.planCode);
      if (f !== "none") status = f;
      else await requestAnalysis(m.product.planCode);
    } else {
      sp.match = { reason: MATCH_REASON[m.reason], detail: m.candidates?.join("、") };
    }
    await db.update(clientPolicies).set({ raw_enc: encryptJson(sp), match_status: status, updated_at: nowText }).where(eq(clientPolicies.id, r.id));
  }

  await setStatus(uploadId, "done");
  // 有約好的顧問 → 通知他客戶的存摺好了（動態載入，避免跟預約模組互相引用）
  await import("@/lib/booking/lifecycle").then(m => m.notifyPassbookReady(u.user_id)).catch(e => console.error("[passbook] notify advisor failed", e));
}

// ── 狀態與全險圖 ──────────────────────────────────────────────────

export interface PolicyView {
  id: string; company: string; productName: string; amountText: string; effectiveDate: string | null; status: string | null;
  isRider: boolean | null; forOther: string | null;          // 被保險人不是本人時的關係
  matchStatus: string; matchNote: string | null; edited: boolean;
  items: { name: string; value: string }[];                  // 算出來的給付（客戶端看得到的事實）
}
export interface CoverageRow { key: BucketKey; label: string; value: string | null; amount: number; preliminary: boolean; missing: number }   // amount：元（同格的期間單位），給缺口分級比較用
export interface PassbookView {
  upload: { id: string; status: string; error: string | null; createdAt: string } | null;
  policies: PolicyView[];
  coverage: CoverageRow[] | null;              // done 之後才有
  lifeCover: { amount: number; preliminary: boolean; missing: number } | null;   // 給遺族缺口用（現有壽險）
  counts: { total: number; counted: number; preliminary: number; pending: number; others: number; removed: number };
}

const amountText = (p: PassbookPolicy, e?: StoredPolicy["edits"]) => {
  const amount = e?.amount !== undefined ? e.amount : p.amount, unit = e?.amount_unit !== undefined ? e.amount_unit : p.amount_unit;
  const plan = e?.plan !== undefined ? e.plan : p.plan;
  return [amount !== null && amount !== undefined ? `${amount.toLocaleString()} ${unit ?? ""}`.trim() : null, plan ? `計劃 ${plan.replace(/^計劃\s*/, "")}` : null].filter(Boolean).join("・") || "—";
};

/** 這位客戶最近一份存摺的狀態＋合併後的全險圖。卡住太久的會在這裡重新排進背景（呼叫端負責 after） */
export async function view(userId: string): Promise<PassbookView & { stuck: { id: string; stage: "read" | "match" } | null }> {
  const [u] = await db.select().from(passbookUploads).where(eq(passbookUploads.user_id, userId)).orderBy(desc(passbookUploads.created_at)).limit(1);
  const empty = { total: 0, counted: 0, preliminary: 0, pending: 0, others: 0, removed: 0 };
  if (!u) return { upload: null, policies: [], coverage: null, lifeCover: null, counts: empty, stuck: null };

  const ageSec = (Date.now() - Date.parse(u.updated_at.replace(" ", "T") + "Z")) / 1000;
  const stuck = (["queued", "reading"].includes(u.status) && ageSec > 180) ? { id: u.id, stage: "read" as const }
    : (u.status === "matching" && ageSec > 600) ? { id: u.id, stage: "match" as const } : null;

  const rows = await db.select().from(clientPolicies).where(and(eq(clientPolicies.upload_id, u.id), eq(clientPolicies.user_id, userId))).orderBy(asc(clientPolicies.created_at));
  const planCodes = new Set<string>();
  const parsed = rows.map(r => ({ r, sp: decryptJson<StoredPolicy>(r.raw_enc) })).sort((a, b) => (a.sp.idx ?? 0) - (b.sp.idx ?? 0));
  for (const { sp } of parsed) if (sp.match && "planCode" in sp.match) planCodes.add(sp.match.planCode);

  // 每個 planCode 取一份公式：審過的優先，其次最新的 AI 讀取
  const formulas = new Map<string, AnalysisJson>();
  if (planCodes.size) {
    const fr = await db.select({ plan_code: policies.plan_code, status: policies.status, analysis_json: policies.analysis_json }).from(policies)
      .where(and(inArray(policies.plan_code, [...planCodes]), isNotNull(policies.analysis_json), inArray(policies.status, ["archived", "uploaded"])));
    for (const f of fr.sort((a, b) => (a.status === "archived" ? 1 : 0) - (b.status === "archived" ? 1 : 0))) {
      try { formulas.set(f.plan_code, JSON.parse(f.analysis_json!)); } catch { /* 壞掉的分析當作沒有 */ }
    }
    // 排隊的條款分析好了（skill 批次寫回）→ 這張從「排隊中」變成有結果，順手寫回
    const reviewed = new Set(fr.filter(f => f.status === "archived").map(f => f.plan_code));
    for (const { r, sp } of parsed) {
      const code = sp.match && "planCode" in sp.match ? sp.match.planCode : null;
      if (r.match_status !== "pending" || !code || !formulas.has(code)) continue;
      r.match_status = reviewed.has(code) ? "matched" : "ai_read";
      await db.update(clientPolicies).set({ match_status: r.match_status, updated_at: nowText }).where(eq(clientPolicies.id, r.id));
    }
  }

  const sums = new Map<BucketKey, { lo: number; hi: number; preliminary: boolean }>();
  const missing = new Map<BucketKey, number>();
  const counts = { ...empty, total: rows.length };
  const views: PolicyView[] = parsed.map(({ r, sp }) => {
    const p = sp.read, e = sp.edits;
    const forOther = p.insured_is_owner === false ? (p.insured_label || "家人") : null;
    const m = sp.match;
    const productType = m && "planCode" in m ? m.productType : null;
    let matchNote: string | null = null;
    const items: PolicyView["items"] = [];

    if (r.match_status === "removed") counts.removed++;
    else if (forOther) counts.others++;

    if (m && "reason" in m) matchNote = m.reason;
    else if (r.match_status === "pending") matchNote = "條款排隊分析中，好了會自動更新";

    const f = m && "planCode" in m ? formulas.get(m.planCode) : undefined;
    const counted = r.match_status !== "removed" && !forOther && (r.match_status === "matched" || r.match_status === "ai_read") && f;
    const perPolicy = new Map<BucketKey, { lo: number; hi: number }>();
    if (f && r.match_status !== "removed") {
      const held = { amount: e?.amount !== undefined ? e.amount ?? null : p.amount, unit: e?.amount_unit !== undefined ? e.amount_unit ?? null : p.amount_unit, plan: e?.plan !== undefined ? e.plan ?? null : p.plan };
      for (const it of f.items ?? []) {
        const v: ItemValue | null = evaluateItem(it, held, f.baseUnit);
        if (!v) continue;
        items.push({ name: it.name, value: fmtValue(v.lo, v.hi, v.period) });
        if (!counted) continue;
        const b = bucketOf(it.name, productType, v);
        if (!b) continue;
        // 同一張保單同一格的多個項目是「擇一」（輕度／重度、初期／重度）→ 取最高；不同保單才相加
        const cur = perPolicy.get(b);
        perPolicy.set(b, { lo: Math.max(cur?.lo ?? 0, v.lo), hi: Math.max(cur?.hi ?? 0, v.hi) });
      }
      for (const [b, v] of perPolicy) {
        const s = sums.get(b) ?? { lo: 0, hi: 0, preliminary: false };
        sums.set(b, { lo: s.lo + v.lo, hi: s.hi + v.hi, preliminary: s.preliminary || r.match_status === "ai_read" });
      }
    }
    if (r.match_status !== "removed" && !forOther) {
      if (counted) { counts.counted++; if (r.match_status === "ai_read") counts.preliminary++; }
      else if (r.match_status !== "unconfirmed") {
        counts.pending++;
        const g = bucketGuess(productType ?? guessTypeByName(p.product_name));
        if (g) missing.set(g, (missing.get(g) ?? 0) + 1);
      }
    }
    return {
      id: r.id, company: p.company, productName: p.product_name, amountText: amountText(p, e), effectiveDate: p.effective_date, status: p.status,
      isRider: p.is_rider, forOther, matchStatus: r.match_status, matchNote, edited: !!e, items,
    };
  });

  const done = u.status === "done";
  const coverage = done ? BUCKETS.map(b => {
    const s = sums.get(b.key);
    return { key: b.key, label: b.label, amount: s?.lo ?? 0, value: s ? fmtValue(s.lo, s.hi, b.key === "reimb" ? "/次" : b.key === "daily" ? "/日" : b.key === "disability" ? "/月" : "") : null,
      preliminary: !!s?.preliminary, missing: missing.get(b.key) ?? 0 };
  }) : null;
  const life = sums.get("life");
  return {
    upload: { id: u.id, status: u.status, error: u.error, createdAt: u.created_at },
    policies: views, coverage,
    lifeCover: done ? { amount: life?.lo ?? 0, preliminary: !!life?.preliminary, missing: missing.get("life") ?? 0 } : null,
    counts, stuck,
  };
}

// 對不到目錄的保單，用商品名猜類型（只用來標「尚未含此張」放哪一格）
function guessTypeByName(name: string): string | null {
  const n = name.normalize("NFKC");
  if (/傷害|意外/.test(n)) return "傷害險";
  if (/防癌|癌症/.test(n)) return "防癌險";
  if (/重大疾|重大傷|特定傷病/.test(n)) return "重大疾(傷)病險";
  if (/長期照顧|長照/.test(n)) return "長照險";
  if (/失能/.test(n)) return "失能險";
  if (/醫療|住院/.test(n)) return "醫療定額";
  if (/壽險|人壽/.test(n)) return "終身壽險";
  return null;
}

