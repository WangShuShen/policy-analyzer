import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import db from "@/lib/db";
import { advisors, auditLogs, users } from "@/lib/schema";

/*
 * 查閱紀錄（w1b-07、N12）：誰在何時讀了誰的個案資料。
 * 只列「誰看了哪一類」，不帶任何個案內容——管理者預設只看統計與軌跡（N12）。
 * 管理者打開這份紀錄本身也記一筆（view_audit_log），查閱紀錄的人也會被看到。
 */
export const ACTION_LABEL: Record<string, string> = {
  view_client: "看客戶頁",
  view_conversation: "看諮詢紀錄",
  view_gaps: "看保障分析",
  override_gap: "改缺口分級",
  mark_met: "標記已面談（解鎖）",
  mark_no_show: "標記客戶沒出現",
  undo_met: "撤銷已面談",
  undo_no_show: "撤銷沒出現",
  cancel_booking: "取消預約",
  view_audit_log: "查看查閱紀錄",
};

export interface AuditFilter { actorId?: string; userId?: string; action?: string; from?: string; to?: string; limit?: number }

export interface AuditRow {
  id: number;
  at: string;
  actorId: string;
  actorName: string | null;
  actorRole: string;
  action: string;
  actionLabel: string;
  userId: string | null;
  userName: string | null;
  targetType: string | null;
  targetId: string | null;
}

const actor = alias(advisors, "actor");

export async function listAudit(f: AuditFilter): Promise<AuditRow[]> {
  const where: SQL[] = [];
  if (f.actorId) where.push(eq(auditLogs.actor_id, f.actorId));
  if (f.userId) where.push(eq(auditLogs.target_user_id, f.userId));
  if (f.action) where.push(eq(auditLogs.action, f.action));
  // 時間欄位是 "YYYY-MM-DD HH:MM:SS"（UTC）字串，日期字串直接比得動
  if (f.from) where.push(gte(auditLogs.created_at, f.from));
  if (f.to) where.push(lt(auditLogs.created_at, f.to));
  const rows = await db.select({ log: auditLogs, actorName: actor.name, userName: users.name, userEmail: users.email })
    .from(auditLogs)
    .leftJoin(actor, eq(actor.id, auditLogs.actor_id))
    .leftJoin(users, eq(users.id, auditLogs.target_user_id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLogs.id))
    .limit(Math.min(Math.max(f.limit ?? 200, 1), 1000));
  return rows.map(({ log, actorName, userName, userEmail }) => ({
    id: log.id, at: log.created_at, actorId: log.actor_id, actorName, actorRole: log.actor_role,
    action: log.action, actionLabel: ACTION_LABEL[log.action] ?? log.action,
    userId: log.target_user_id, userName: userName ?? userEmail ?? null, targetType: log.target_type, targetId: log.target_id,
  }));
}

export async function auditAdminView(adminId: string, f: AuditFilter): Promise<void> {
  await db.insert(auditLogs).values({ actor_id: adminId, actor_role: "admin", action: "view_audit_log", target_user_id: f.userId ?? null, target_type: "audit_log", target_id: null });
}
