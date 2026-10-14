import { and, desc, eq } from "drizzle-orm";
import db from "@/lib/db";
import { advisors, auditLogs, newsArticles, newsReviews, nowText } from "@/lib/schema";
import { checkCompliance } from "@/lib/consult/compliance";
import { plainText } from "./markdown";

/*
 * 保險快訊（W3、N3）：寫稿 → 送審 → 審核通過才公開；下架也留紀錄。
 *   ・編輯稿 status：draft（可改）→ pending（送審中，鎖住）→ approved（跟公開版一樣）
 *   ・公開頁只讀 pub_*：已發布的文章再改，公開頁照樣是舊版，新稿審核通過才換上
 *   ・下架：visible=0；重新上架要再送審一次
 *   ・每一步寫 news_reviews（給後台看）＋ audit_logs（稽核）
 * 只有管理者能寫、能審（API 層檢查）。目前只有一位管理者，自己寫的稿自己審也可以（同 w1b-06，紀錄照留）。
 */
export class NewsError extends Error {}

export const CATEGORIES = ["實用教學", "健保與政策", "理賠觀念", "家庭規劃"] as const;
export const COVERS = ["i-doc", "i-money", "i-done", "i-kid", "i-elder", "i-chart", "i-cal", "i-lock", "i-radar", "i-p2"] as const;
export const LIMITS = { title: 40, summary: 120, body: 20000, sources: 500 };

export interface ArticleInput { slug: string; title: string; summary: string; body: string; category: string; cover?: string; sources?: string | null }
export interface Check { errors: string[]; warnings: string[] }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// 4-aj：客戶端一律不能出現公司名；N13：不提同業
const BANNED = /三商美邦|三商人壽|三商/;
// N17：內文出現統計數字（百分比、幾萬人、幾成）就一定要有資料來源
const HAS_STAT = /\d[\d,，.]*\s*(%|％|萬人|人次|成的|倍)|每\s*\d+\s*(人|個)/;

export function validate(a: ArticleInput): Check {
  const errors: string[] = [], warnings: string[] = [];
  if (!SLUG.test(a.slug) || a.slug.length < 3 || a.slug.length > 80) errors.push("網址代稱只能用小寫英文、數字和 -，3～80 字（例：insurance-passbook-how-to）");
  if (!a.title?.trim() || a.title.length > LIMITS.title) errors.push(`標題不能空白，${LIMITS.title} 字以內`);
  if (!a.summary?.trim() || a.summary.length > LIMITS.summary) errors.push(`摘要不能空白，${LIMITS.summary} 字以內`);
  else if (a.summary.length < 30) warnings.push("摘要少於 30 字，Google 搜尋結果可能會自己抓內文");
  if (!a.body?.trim() || a.body.length > LIMITS.body) errors.push(`內文不能空白，${LIMITS.body} 字以內`);
  if (!CATEGORIES.includes(a.category as never)) errors.push("分類不在清單裡");
  if (a.cover && !COVERS.includes(a.cover as never)) errors.push("封面圖示不在清單裡");
  if ((a.sources ?? "").length > LIMITS.sources) errors.push(`資料來源 ${LIMITS.sources} 字以內`);
  const all = `${a.title}\n${a.summary}\n${plainText(a.body ?? "")}`;
  if (BANNED.test(all)) errors.push("不能出現「三商美邦人壽」或顧問所屬公司（4-aj）");
  if (HAS_STAT.test(all) && !/\d{3,4}/.test(a.sources ?? "")) errors.push("內文有統計數字，資料來源要寫出處和年份（N17）");
  for (const s of all.split(/[。！？\n]/)) {
    const r = checkCompliance(s);
    if (!r.ok && r.reason === "提到公司名") { errors.push(`提到保險公司名稱：「${s.trim().slice(0, 30)}」（N13）`); continue; }
    if (!r.ok && r.reason !== "思考外洩") warnings.push(`合規規則會判「${r.reason}」：「${s.trim().slice(0, 30)}」——請確認`);
  }
  return { errors, warnings: [...new Set(warnings)] };
}

const fields = (a: ArticleInput) => ({
  slug: a.slug.trim(), title: a.title.trim(), summary: a.summary.trim(), body: a.body, category: a.category,
  cover: a.cover || "i-doc", sources: a.sources?.trim() || null,
});
const snap = (r: typeof newsArticles.$inferSelect) => JSON.stringify({ title: r.title, summary: r.summary, body: r.body, category: r.category, cover: r.cover, sources: r.sources });

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function log(tx: Tx | typeof db, actorId: string, articleId: string, action: string, note?: string | null, snapshot?: string | null) {
  await tx.insert(newsReviews).values({ id: crypto.randomUUID(), article_id: articleId, actor_id: actorId, action, note: note ?? null, snapshot: snapshot ?? null });
  await tx.insert(auditLogs).values({ actor_id: actorId, actor_role: "admin", action: `news_${action}`, target_type: "news", target_id: articleId });
}

async function lockRow(tx: Tx, id: string) {
  const [r] = await tx.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1).for("update");
  if (!r) throw new NewsError("找不到這篇文章");
  return r;
}

// ── 後台 ─────────────────────────────────────────────────────────

/** 後台顯示用的狀態（一個標籤） */
export function stage(r: Pick<typeof newsArticles.$inferSelect, "status" | "visible" | "published_at">): "draft" | "pending" | "live" | "live_editing" | "live_pending" | "off" {
  if (r.visible) return r.status === "approved" ? "live" : r.status === "pending" ? "live_pending" : "live_editing";
  if (r.published_at && r.status !== "pending") return r.status === "approved" ? "off" : "draft";
  return r.status === "pending" ? "pending" : "draft";
}

export async function listAdmin() {
  const rows = await db.select().from(newsArticles).orderBy(desc(newsArticles.updated_at));
  return rows.map(r => ({ id: r.id, slug: r.slug, title: r.title, category: r.category, stage: stage(r), updatedAt: r.updated_at, publishedAt: r.published_at }));
}

export async function getAdmin(id: string) {
  const [r] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!r) throw new NewsError("找不到這篇文章");
  const logs = await db.select().from(newsReviews).where(eq(newsReviews.article_id, id)).orderBy(desc(newsReviews.created_at));
  const names = new Map((await db.select({ id: advisors.id, name: advisors.name }).from(advisors)).map(a => [a.id, a.name]));
  return {
    article: { ...r, stage: stage(r) },
    check: validate(r),
    reviews: logs.map(l => ({ id: l.id, action: l.action, note: l.note, at: l.created_at, actor: names.get(l.actor_id) ?? l.actor_id })),
  };
}

export async function createArticle(actorId: string, a: ArticleInput): Promise<{ id: string | null } & Check> {
  const check = validate(a);
  // 草稿階段只擋格式；合規、出處在送審時才擋（寫到一半也要能存）
  const blocking = check.errors.filter(e => /網址代稱|不能空白|字以內|分類|封面/.test(e));
  if (blocking.length) return { id: null, errors: blocking, warnings: [] };
  const [dup] = await db.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.slug, a.slug.trim())).limit(1);
  if (dup) return { id: null, errors: ["這個網址代稱已經有文章用了"], warnings: [] };
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(newsArticles).values({ id, ...fields(a), status: "draft", author_id: actorId });
    await log(tx, actorId, id, "create");
  });
  return { id, ...check };
}

export async function updateArticle(actorId: string, id: string, a: ArticleInput): Promise<{ saved: boolean } & Check> {
  const check = validate(a);
  const blocking = check.errors.filter(e => /網址代稱|不能空白|字以內|分類|封面/.test(e));
  if (blocking.length) return { saved: false, errors: blocking, warnings: [] };
  await db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (r.status === "pending") throw new NewsError("送審中的文章不能改；要改請先「撤回送審」，或由審核人退回");
    if (r.published_at && a.slug.trim() !== r.slug) throw new NewsError("發布過的文章不能改網址（Google 已經收錄舊網址）");
    if (a.slug.trim() !== r.slug) {
      const [dup] = await tx.select({ id: newsArticles.id }).from(newsArticles).where(eq(newsArticles.slug, a.slug.trim())).limit(1);
      if (dup) throw new NewsError("這個網址代稱已經有文章用了");
    }
    await tx.update(newsArticles).set({ ...fields(a), status: "draft", updated_at: nowText }).where(eq(newsArticles.id, id));
    await log(tx, actorId, id, "edit");
  });
  return { saved: true, ...check };
}

export async function submitArticle(actorId: string, id: string): Promise<Check> {
  return db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (r.status === "pending") throw new NewsError("已經在送審中");
    if (r.status === "approved" && r.visible) throw new NewsError("這篇已經是公開的版本，沒有新的修改可以送審");
    const check = validate(r);
    if (check.errors.length) throw new NewsError(check.errors.join("；"));
    await tx.update(newsArticles).set({ status: "pending", updated_at: nowText }).where(eq(newsArticles.id, id));
    await log(tx, actorId, id, "submit", null, snap(r));
    return check;
  });
}

export async function withdrawArticle(actorId: string, id: string) {
  await db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (r.status !== "pending") throw new NewsError("這篇不在送審中");
    await tx.update(newsArticles).set({ status: "draft", updated_at: nowText }).where(eq(newsArticles.id, id));
    await log(tx, actorId, id, "withdraw");
  });
}

/** 審核通過 → 換上公開版（第一次通過＝發布） */
export async function approveArticle(reviewerId: string, id: string, note?: string | null) {
  await db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (r.status !== "pending") throw new NewsError("只有送審中的文章可以審核");
    const check = validate(r);
    if (check.errors.length) throw new NewsError(check.errors.join("；"));
    await tx.update(newsArticles).set({
      status: "approved", visible: 1,
      pub_title: r.title, pub_summary: r.summary, pub_body: r.body, pub_category: r.category, pub_cover: r.cover, pub_sources: r.sources,
      published_at: r.published_at ?? nowText, pub_updated_at: nowText, reviewed_by: reviewerId, reviewed_at: nowText, updated_at: nowText,
    }).where(eq(newsArticles.id, id));
    await log(tx, reviewerId, id, "approve", note?.trim() || null, snap(r));
  });
}

export async function rejectArticle(reviewerId: string, id: string, note: string) {
  if (!note?.trim()) throw new NewsError("退回要寫原因，寫稿的人才知道要改哪裡");
  await db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (r.status !== "pending") throw new NewsError("只有送審中的文章可以退回");
    await tx.update(newsArticles).set({ status: "draft", updated_at: nowText }).where(eq(newsArticles.id, id));
    await log(tx, reviewerId, id, "reject", note.trim());
  });
}

export async function unpublishArticle(actorId: string, id: string, reason: string) {
  if (!reason?.trim()) throw new NewsError("下架要寫原因");
  await db.transaction(async tx => {
    const r = await lockRow(tx, id);
    if (!r.visible) throw new NewsError("這篇目前沒有公開");
    await tx.update(newsArticles).set({ visible: 0, updated_at: nowText }).where(eq(newsArticles.id, id));
    await log(tx, actorId, id, "unpublish", reason.trim());
  });
}

// ── 公開頁（只讀 pub_*）────────────────────────────────────────────

export interface PublicArticle { slug: string; title: string; summary: string; body: string; category: string; cover: string; sources: string | null; publishedAt: string; updatedAt: string }

const pub = (r: typeof newsArticles.$inferSelect): PublicArticle => ({
  slug: r.slug, title: r.pub_title!, summary: r.pub_summary!, body: r.pub_body!, category: r.pub_category!, cover: r.pub_cover ?? "i-doc",
  sources: r.pub_sources, publishedAt: r.published_at!, updatedAt: r.pub_updated_at ?? r.published_at!,
});

export async function listPublic(category?: string): Promise<PublicArticle[]> {
  const rows = await db.select().from(newsArticles).where(eq(newsArticles.visible, 1)).orderBy(desc(newsArticles.published_at));
  return rows.map(pub).filter(a => !category || a.category === category);
}

export async function getPublic(slug: string): Promise<PublicArticle | null> {
  const [r] = await db.select().from(newsArticles).where(and(eq(newsArticles.slug, slug), eq(newsArticles.visible, 1))).limit(1);
  return r ? pub(r) : null;
}

/** 後台「先看公開版長怎樣」：用編輯稿的內容、公開頁的版型 */
export async function previewDraft(id: string): Promise<PublicArticle> {
  const [r] = await db.select().from(newsArticles).where(eq(newsArticles.id, id)).limit(1);
  if (!r) throw new NewsError("找不到這篇文章");
  return { slug: r.slug, title: r.title, summary: r.summary, body: r.body, category: r.category, cover: r.cover, sources: r.sources,
    publishedAt: r.published_at ?? r.updated_at, updatedAt: r.updated_at };
}
