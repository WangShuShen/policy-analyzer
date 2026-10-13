import { desc, eq, gte, sql } from "drizzle-orm";
import db from "@/lib/db";
import { loginEvents, presence } from "@/lib/schema";

/*
 * 誰在線、登入紀錄（w1b-04、C8）。
 * recordLogin 由登入流程呼叫（Google 回呼、測試登入；卡 A 接）；寫入失敗不能擋登入。
 */
export const ONLINE_WINDOW_MS = 5 * 60_000;

export interface LoginWho { id: string; role: "advisor" | "customer"; email?: string | null; method: "google" | "dev" }

export async function recordLogin(who: LoginWho, req?: { headers: Headers }): Promise<void> {
  try {
    const h = req?.headers;
    const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() || h?.get("x-real-ip") || null;
    await db.insert(loginEvents).values({ actor_id: who.id, role: who.role, email: who.email ?? null, method: who.method, ip, user_agent: h?.get("user-agent")?.slice(0, 300) ?? null });
  } catch (e) {
    console.error("[recordLogin]", e);   // 紀錄寫不進去也照常登入
  }
}

export async function heartbeat(who: { id: string; role: string; isAdmin: boolean; name: string }, path: string | null, now = Date.now()): Promise<void> {
  const iso = new Date(now).toISOString(), cutoff = new Date(now - ONLINE_WINDOW_MS).toISOString();
  const p = path?.split("?")[0].slice(0, 200) ?? null;
  await db.insert(presence).values({ actor_id: who.id, role: who.role, is_admin: who.isAdmin ? 1 : 0, name: who.name, path: p, last_seen: iso, first_seen: iso })
    .onConflictDoUpdate({ target: presence.actor_id, set: {
      role: who.role, is_admin: who.isAdmin ? 1 : 0, name: who.name, path: p, last_seen: iso,
      // 中斷超過 5 分鐘算新的一段
      first_seen: sql`case when ${presence.last_seen} < ${cutoff} then ${iso} else ${presence.first_seen} end`,
    } });
}

export async function onlineNow(now = Date.now()) {
  const rows = await db.select().from(presence).where(gte(presence.last_seen, new Date(now - ONLINE_WINDOW_MS).toISOString())).orderBy(desc(presence.last_seen));
  return rows.map(r => ({ id: r.actor_id, role: r.role, isAdmin: r.is_admin === 1, name: r.name, path: r.path, lastSeen: r.last_seen, since: r.first_seen }));
}

export async function listLogins(f: { actorId?: string; role?: string; limit?: number }) {
  const where = f.actorId ? eq(loginEvents.actor_id, f.actorId) : f.role ? eq(loginEvents.role, f.role) : undefined;
  const rows = await db.select().from(loginEvents).where(where).orderBy(desc(loginEvents.id)).limit(Math.min(f.limit ?? 100, 500));
  return rows.map(r => ({ id: r.id, actorId: r.actor_id, role: r.role, email: r.email, method: r.method, ip: r.ip, userAgent: r.user_agent, at: r.created_at }));
}
