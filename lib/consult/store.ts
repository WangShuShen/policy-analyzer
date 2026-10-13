import db, { nowText } from "@/lib/db";
import { conversations, messages, facts, complianceBlocks } from "@/lib/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { encryptJson, decryptJson } from "@/lib/fieldCrypto";
import { SCRIPT_VERSION } from "./script";
import type { FlowState } from "./engine";
import type { Usage } from "./ai";

/*
 * 諮詢的資料存取。所有個資欄位加密（D2）；每次互動把 expires_at 往後推 1 年（D3）。
 * 每個函式都強制帶 userId：只能讀寫自己的對話（設計準則 §1 應用層隔離）。
 */
export type ConversationRow = typeof conversations.$inferSelect;

/** 對話內容的種類（加密後存在 messages.content_enc） */
export type MessageContent =
  | { kind: "user"; text: string }
  | { kind: "ai"; html: string; chips?: string[]; ask?: string }   // chips：4-ai 需求點引導時 AI 產生的選項（可能含健康資訊，跟著內容一起加密）；ask：這一句在問哪個需求點
  | { kind: "trend"; title: string; body: string; forYou: string }
  | { kind: "panel"; key: string }
  | { kind: "note"; text: string };

export interface StoredMessage { id: string; role: string; content: MessageContent; createdAt: string }
export interface StoredFact { key: string; display: string; number: number | null; confidence: string; health: boolean; updatedAt: string }

const oneYearLater = () => {
  const d = new Date(); d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
};

// 對話標題只用分支名稱——不能含個資（例如「媽媽中風」是健康資料）
const TITLES: Record<string, string> = {
  health: "保單健檢", "finance:ret": "財務規劃 · 退休", "finance:tax": "財務規劃 · 傳承與稅",
  "finance:edu": "財務規劃 · 子女教育", finance: "財務規劃",
};
export const titleOf = (branch: string | null, sub: string | null) =>
  (branch && (TITLES[sub ? `${branch}:${sub}` : branch] ?? TITLES[branch])) || "這次的對話";

export async function createConversation(userId: string): Promise<ConversationRow> {
  const [row] = await db.insert(conversations).values({
    id: crypto.randomUUID(), user_id: userId, flow_cursor: "0", expires_at: oneYearLater(),
  }).returning();
  return row;
}

export async function getConversation(userId: string, id: string): Promise<ConversationRow | null> {
  const [row] = await db.select().from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.user_id, userId))).limit(1);
  return row ?? null;
}

export async function listConversations(userId: string): Promise<ConversationRow[]> {
  return db.select().from(conversations).where(eq(conversations.user_id, userId))
    .orderBy(desc(conversations.last_active_at));
}

export async function loadState(conv: ConversationRow): Promise<FlowState> {
  const rows = await db.select({ key: facts.key, value: facts.value_enc }).from(facts).where(eq(facts.conversation_id, conv.id));
  const values = new Map(rows.map(r => [r.key, decryptJson<{ display: string }>(r.value).display] as const));
  return {
    cursor: Number(conv.flow_cursor ?? 0),
    branch: (conv.branch as FlowState["branch"]) ?? null,
    sub: (conv.sub_route as FlowState["sub"]) ?? null,
    filled: new Set(values.keys()),
    values,
  };
}

export async function saveState(userId: string, convId: string, st: FlowState, done: boolean): Promise<void> {
  await db.update(conversations).set({
    flow_cursor: String(st.cursor),
    branch: st.branch,
    sub_route: st.sub,
    status: done ? "done" : "active",
    title: titleOf(st.branch, st.sub),
    last_active_at: nowText,
    expires_at: oneYearLater(),      // 每次互動重新起算 1 年（D3）
    updated_at: nowText,
  }).where(and(eq(conversations.id, convId), eq(conversations.user_id, userId)));
}

export async function addMessage(convId: string, role: "user" | "assistant", content: MessageContent,
  extra: { stepId?: string; usage?: Usage; rewritten?: boolean; quickReplies?: string[] } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(messages).values({
    id, conversation_id: convId, role,
    content_enc: encryptJson(content),
    quick_replies: extra.quickReplies ? JSON.stringify(extra.quickReplies) : null,
    content_version_id: extra.stepId ? `${SCRIPT_VERSION}:${extra.stepId}` : null,
    model: extra.usage?.model ?? null,
    tokens_in: extra.usage?.tokensIn ?? null,
    tokens_out: extra.usage?.tokensOut ?? null,
    cost_micro_usd: extra.usage?.costMicroUsd ?? null,
    compliance_rewritten: extra.rewritten ? 1 : 0,
  });
  return id;
}

export async function getMessages(convId: string): Promise<StoredMessage[]> {
  const rows = await db.select().from(messages).where(eq(messages.conversation_id, convId))
    .orderBy(asc(messages.seq));
  return rows.map(r => ({ id: r.id, role: r.role, content: decryptJson<MessageContent>(r.content_enc), createdAt: r.created_at }));
}

export async function upsertFact(convId: string, userId: string, f: {
  key: string; display: string; number: number | null; bucket: string | null; health: boolean;
  confidence: "clear" | "estimated" | "confirmed"; sourceMessageId?: string;
}): Promise<void> {
  const value = encryptJson({ display: f.display, number: f.number });
  const bucket = f.health ? null : f.bucket;   // 健康類一律不存級距（D2）
  await db.insert(facts).values({
    id: crypto.randomUUID(), conversation_id: convId, user_id: userId, key: f.key,
    value_enc: value, bucket, is_health: f.health ? 1 : 0, confidence: f.confidence,
    source_message_id: f.sourceMessageId ?? null,
  }).onConflictDoUpdate({
    target: [facts.conversation_id, facts.key],
    set: { value_enc: value, bucket, confidence: f.confidence, source_message_id: f.sourceMessageId ?? null, updated_at: nowText },
  });
}

export async function getFacts(convId: string): Promise<StoredFact[]> {
  const rows = await db.select().from(facts).where(eq(facts.conversation_id, convId)).orderBy(asc(facts.created_at));
  return rows.map(r => {
    const v = decryptJson<{ display: string; number: number | null }>(r.value_enc);
    return { key: r.key, display: v.display, number: v.number, confidence: r.confidence, health: r.is_health === 1, updatedAt: r.updated_at };
  });
}

export async function recordBlocks(convId: string, blocks: { reason: string; original: string; attempt: number; layer?: string }[], replacement?: string): Promise<void> {
  if (blocks.length === 0) return;
  await db.insert(complianceBlocks).values(blocks.map(b => ({
    id: crypto.randomUUID(), conversation_id: convId, layer: b.layer ?? "rule", reason: b.reason,
    original_enc: encryptJson(b.original), replacement_enc: replacement ? encryptJson(replacement) : null, attempt: b.attempt,
  })));
}
