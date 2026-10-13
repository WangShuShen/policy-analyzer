import { and, desc, eq, inArray } from "drizzle-orm";
import db from "@/lib/db";
import { advisors, auditLogs, contentItems, contentVersions, nowText } from "@/lib/schema";
import { SEED_ASSUMPTIONS, type Assumptions } from "@/lib/calc/assumptions";
import { ITEMS, itemDef, validate, diff, SEED_TAG, type Check } from "./registry";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * 後台內容的版本（w1b-06、I3）：存草稿 → 發布（顧問 10/14：管理者自己確認後發布，以後有第二位管理者再改互審）。
 *   ・每個項目同時最多一份草稿；發布後草稿變成新的上線版，舊上線版標 retired（試算參數例外，見下）
 *   ・試算參數（E4）：每一版帶生效日，發布過的都留著；「現在生效的」＝生效日 ≤ 今天（台灣）裡最新的一版
 *   ・每次存草稿、發布、捨棄都寫 audit_logs；版本列上記誰寫（author）誰發布（reviewer）何時
 */
export class ContentError extends Error {}

const parse = (s: string) => JSON.parse(s) as unknown;

async function ensureItem(id: string) {
  const def = itemDef(id);
  if (!def) throw new ContentError("沒有這個項目");
  await db.insert(contentItems).values({ id, kind: def.kind, branch: def.group }).onConflictDoNothing();
  return def;
}

async function log(adminId: string, action: string, itemId: string, versionId: string) {
  await db.insert(auditLogs).values({ actor_id: adminId, actor_role: "admin", action, target_type: "content", target_id: `${itemId}@${versionId}` });
}

// ── 後台 ─────────────────────────────────────────────────────────

export interface ItemSummary { id: string; kind: string; group: string; title: string; state: "seed" | "live"; hasDraft: boolean; updatedAt: string | null }

export async function listItems(): Promise<ItemSummary[]> {
  const rows = await db.select({ id: contentVersions.item_id, status: contentVersions.status, at: contentVersions.created_at }).from(contentVersions)
    .where(inArray(contentVersions.status, ["draft", "live"]));
  return ITEMS().map(d => {
    const mine = rows.filter(r => r.id === d.id);
    return { id: d.id, kind: d.kind, group: d.group, title: d.title, state: mine.some(r => r.status === "live") ? "live" : "seed",
      hasDraft: mine.some(r => r.status === "draft"), updatedAt: mine.map(r => r.at).sort().at(-1) ?? null };
  });
}

export interface VersionView {
  id: string; status: string; body: unknown; source: string | null; sourceYear: string | null; effectiveFrom: string | null; note: string | null;
  author: string | null; publisher: string | null; createdAt: string; publishedAt: string | null;
}

export async function itemDetail(id: string, now = Date.now()) {
  const def = itemDef(id);
  if (!def) throw new ContentError("沒有這個項目");
  const rows = await db.select().from(contentVersions).where(eq(contentVersions.item_id, id)).orderBy(desc(contentVersions.created_at));
  const names = new Map((await db.select({ id: advisors.id, name: advisors.name }).from(advisors)).map(a => [a.id, a.name]));
  const view = (r: typeof rows[number]): VersionView => ({
    id: r.id, status: r.status, body: parse(r.body), source: r.source, sourceYear: r.source_year, effectiveFrom: r.effective_from, note: r.note,
    author: r.author_id ? names.get(r.author_id) ?? r.author_id : null, publisher: r.reviewer_id ? names.get(r.reviewer_id) ?? r.reviewer_id : null,
    createdAt: r.created_at, publishedAt: r.reviewed_at,
  });
  const versions = rows.map(view);
  const live = pickLive(def.hasEffectiveDate, rows, now);
  return {
    def, seed: def.seed,
    live: live ? view(live) : null,
    draft: versions.find(v => v.status === "draft") ?? null,
    scheduled: def.hasEffectiveDate ? versions.filter(v => v.status === "live" && (v.effectiveFrom ?? "") > taipeiDay(now)) : [],
    history: versions.filter(v => v.status !== "draft"),
  };
}

export interface DraftInput { body: unknown; source?: string | null; sourceYear?: string | null; effectiveFrom?: string | null; note?: string | null }

/** 存草稿（同一項目只有一份草稿，再存就覆蓋）。有錯回 errors 不存；警告照存 */
export async function saveDraft(adminId: string, id: string, input: DraftInput): Promise<{ versionId: string | null } & Check> {
  const def = await ensureItem(id);
  const check = validate(def, input.body, input);
  if (check.errors.length) return { versionId: null, ...check };
  const values = {
    body: JSON.stringify(input.body), source: input.source?.trim() || null, source_year: input.sourceYear?.trim() || null,
    effective_from: def.hasEffectiveDate ? input.effectiveFrom || null : null, note: input.note?.trim() || null, author_id: adminId,
  };
  const [draft] = await db.select({ id: contentVersions.id }).from(contentVersions)
    .where(and(eq(contentVersions.item_id, id), eq(contentVersions.status, "draft"))).limit(1);
  let versionId: string;
  if (draft) { versionId = draft.id; await db.update(contentVersions).set(values).where(eq(contentVersions.id, draft.id)); }
  else { versionId = crypto.randomUUID(); await db.insert(contentVersions).values({ id: versionId, item_id: id, status: "draft", ...values }); }
  await log(adminId, "save_content_draft", id, versionId);
  return { versionId, ...check };
}

/** 發布前預覽：草稿跟目前上線版（沒有就跟種子）差在哪 */
export async function previewPublish(id: string) {
  const d = await itemDetail(id);
  if (!d.draft) throw new ContentError("沒有草稿可以發布");
  return { changes: diff(d.live?.body ?? JSON.parse(JSON.stringify(d.seed)), d.draft.body), check: validate(d.def, d.draft.body, d.draft) };
}

export async function publish(adminId: string, id: string): Promise<void> {
  const def = itemDef(id);
  if (!def) throw new ContentError("沒有這個項目");
  await db.transaction(async tx => {
    const [draft] = await tx.select().from(contentVersions)
      .where(and(eq(contentVersions.item_id, id), eq(contentVersions.status, "draft"))).limit(1).for("update");
    if (!draft) throw new ContentError("沒有草稿可以發布（可能已經發布過）");
    const check = validate(def, parse(draft.body), { source: draft.source, sourceYear: draft.source_year, effectiveFrom: draft.effective_from });
    if (check.errors.length) throw new ContentError(check.errors.join("；"));
    // 試算參數：舊版都留著（依生效日挑）；沒填生效日＝今天起
    if (def.hasEffectiveDate) {
      if (!draft.effective_from) await tx.update(contentVersions).set({ effective_from: taipeiDay(Date.now()) }).where(eq(contentVersions.id, draft.id));
    } else {
      await tx.update(contentVersions).set({ status: "retired" }).where(and(eq(contentVersions.item_id, id), eq(contentVersions.status, "live")));
    }
    await tx.update(contentVersions).set({ status: "live", reviewer_id: adminId, reviewed_at: nowText }).where(eq(contentVersions.id, draft.id));
    await tx.update(contentItems).set({ live_version_id: draft.id, updated_at: nowText }).where(eq(contentItems.id, id));
    await tx.insert(auditLogs).values({ actor_id: adminId, actor_role: "admin", action: "publish_content", target_type: "content", target_id: `${id}@${draft.id}` });
  });
  invalidate();
}

export async function discardDraft(adminId: string, id: string): Promise<void> {
  const rows = await db.delete(contentVersions).where(and(eq(contentVersions.item_id, id), eq(contentVersions.status, "draft"))).returning({ id: contentVersions.id });
  if (!rows.length) throw new ContentError("沒有草稿");
  await log(adminId, "discard_content_draft", id, rows[0].id);
}

/** 試算參數：撤下一筆還沒生效的排程版本 */
export async function cancelScheduled(adminId: string, versionId: string, now = Date.now()): Promise<void> {
  const [r] = await db.select().from(contentVersions).where(and(eq(contentVersions.id, versionId), eq(contentVersions.status, "live"))).limit(1);
  if (!r || !itemDef(r.item_id)?.hasEffectiveDate || (r.effective_from ?? "") <= taipeiDay(now)) throw new ContentError("只能撤下還沒生效的參數版本");
  await db.update(contentVersions).set({ status: "retired" }).where(eq(contentVersions.id, versionId));
  await log(adminId, "cancel_scheduled_content", r.item_id, versionId);
  invalidate();
}

// ── 給諮詢流程讀（接線屬卡 F：lib/consult、lib/calc 改成讀這裡）──────────────

type Row = typeof contentVersions.$inferSelect;
function pickLive(byDate: boolean, rows: Row[], now: number): Row | null {
  const live = rows.filter(r => r.status === "live");
  if (!byDate) return live[0] ?? null;
  const today = taipeiDay(now);
  return live.filter(r => (r.effective_from ?? "") <= today).sort((a, b) => (b.effective_from ?? "").localeCompare(a.effective_from ?? "") || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export interface LiveContent {
  tag: string;                                        // 記進 messages.content_version_id／snapshot：這段對話用的是哪一組內容
  get<T>(id: string): T;                              // 有發布版用發布版，沒有就用種子
  versionOf(id: string): string;                      // 這一項目前的版本 id（種子＝"seed"）
  assumptions(): Assumptions;                         // 依生效日挑好的試算參數，version 換成資料庫版本 id
}

const TTL_MS = 60_000;
let cache: { at: number; day: string; v: LiveContent } | null = null;
export const invalidate = () => { cache = null; };

/** 目前上線的內容（快取 60 秒；發布時清掉）。請在每輪開頭 await 一次，之後同步取用 */
export async function liveContent(now = Date.now()): Promise<LiveContent> {
  const day = taipeiDay(now);
  if (cache && now - cache.at < TTL_MS && cache.day === day) return cache.v;
  const rows = await db.select().from(contentVersions).where(eq(contentVersions.status, "live"));
  const byItem = new Map<string, Row>();
  for (const id of new Set(rows.map(r => r.item_id))) {
    const r = pickLive(!!itemDef(id)?.hasEffectiveDate, rows.filter(x => x.item_id === id), now);
    if (r) byItem.set(id, r);
  }
  const bodies = new Map([...byItem].map(([id, r]) => [id, parse(r.body)]));
  const tag = byItem.size ? `${SEED_TAG}|${[...byItem].map(([id, r]) => `${id}@${r.id.slice(0, 8)}`).sort().join(",")}` : SEED_TAG;
  const v: LiveContent = {
    tag,
    get: <T,>(id: string) => (bodies.get(id) ?? itemDef(id)?.seed) as T,
    versionOf: id => byItem.get(id)?.id ?? "seed",
    assumptions: () => {
      const r = byItem.get("params.assumptions");
      if (!r) return SEED_ASSUMPTIONS;
      const body = parse(r.body) as Omit<Assumptions, "version" | "effectiveFrom" | "sources">;
      // JSON 存不了 Infinity（遺產稅最高級距「以上」），讀回來補上
      body.estate.brackets = body.estate.brackets.map(b => ({ ...b, upTo: b.upTo ?? Infinity }));
      return { ...body, version: r.id, effectiveFrom: r.effective_from ?? day,
        sources: [{ item: "全域假設參數", value: `後台版本 ${r.id.slice(0, 8)}`, source: `${r.source ?? ""}（${r.source_year ?? ""}）` }, ...SEED_ASSUMPTIONS.sources] };
    },
  };
  cache = { at: now, day, v };
  return v;
}
