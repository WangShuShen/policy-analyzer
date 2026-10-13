import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import db from "@/lib/db";
import { advisors, advisorApplications, nowText } from "@/lib/schema";

/*
 * 顧問申請／核准（w1b-03、C4）。
 *
 * 流程：/welcome/advisor-apply 按「用 Google 申請」→ /api/auth/google?flow=advisor_apply
 *   → Google 回呼：已經是顧問就照常登入；不是的話「不建客戶帳號」，改發一張 30 分鐘的申請憑證
 *     （APPLICANT_COOKIE，只證明「這個 email 剛通過 Google 驗證」）→ 回到申請頁填表
 *   → 管理者在顧問管理頁核准，才寫進 advisors（這時才能用 Google 登入顧問工作台）。
 *
 * 申請憑證刻意不是 auth_token：拿著它進不了任何登入後的頁面，只能讀寫自己的申請。
 */
export const APPLICANT_COOKIE = "advisor_applicant";
const TTL_SEC = 30 * 60;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET 未設定");
  return s;
}
const sign = (body: string) => createHmac("sha256", secret()).update(`advisor-apply.${body}`).digest("base64url");

export interface Applicant { email: string; googleName: string }

/** Google 回呼用：產生申請憑證的 cookie 值 */
export function applicantToken(email: string, googleName: string): string {
  const body = Buffer.from(JSON.stringify({ e: email.toLowerCase().trim(), n: googleName, x: Math.floor(Date.now() / 1000) + TTL_SEC })).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** Google 回呼用：cookie 的設定值（與 auth_token 同樣 httpOnly） */
export const applicantCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: TTL_SEC,
  path: "/",
};

export function readApplicant(token: string | undefined): Applicant | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(body)), got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { e: string; n: string; x: number };
    if (p.x < Date.now() / 1000) return null;
    return { email: p.e, googleName: p.n };
  } catch {
    return null;
  }
}

export const ApplicationInput = z.object({
  name: z.string().trim().min(1, "請填姓名").max(30),
  license_no: z.string().trim().min(4, "請填登錄字號").max(40),
  company: z.string().trim().min(1, "請填所屬公司或通路").max(60),
  phone: z.string().trim().regex(/^[0-9+\-\s()]{8,20}$/, "手機格式不對"),
  intro: z.string().trim().min(1, "請寫一句自我介紹").max(100),
});
export type ApplicationInput = z.infer<typeof ApplicationInput>;

export type ApplicationRow = typeof advisorApplications.$inferSelect;

/** 申請人看自己的申請：最新一筆 */
export async function latestApplication(email: string): Promise<ApplicationRow | null> {
  const [row] = await db.select().from(advisorApplications)
    .where(eq(advisorApplications.email, email)).orderBy(desc(advisorApplications.created_at)).limit(1);
  return row ?? null;
}

export class ApplyError extends Error {}

export async function submitApplication(who: Applicant, input: ApplicationInput): Promise<ApplicationRow> {
  // 已經在顧問表裡（包含被停用的）：不走申請，請管理者處理，避免同 email 兩筆顧問
  const [exists] = await db.select({ id: advisors.id }).from(advisors).where(eq(advisors.email, who.email)).limit(1);
  if (exists) throw new ApplyError("這個 Google 帳號已經是顧問帳號，請直接登入；無法登入請聯繫管理者。");
  const prev = await latestApplication(who.email);
  if (prev?.status === "pending") throw new ApplyError("你已經送出申請，管理者審核中。");
  const [row] = await db.insert(advisorApplications).values({
    id: crypto.randomUUID(), email: who.email, google_name: who.googleName, ...input,
  }).returning();
  return row;
}

export async function listApplications(status?: string): Promise<ApplicationRow[]> {
  const q = db.select().from(advisorApplications);
  return (status ? q.where(eq(advisorApplications.status, status)) : q).orderBy(desc(advisorApplications.created_at));
}

/** 管理者核准：申請改成 approved，同一個交易裡建立顧問帳號（登錄字號一起帶過去；公司、手機、自介不帶） */
export async function approveApplication(id: string, adminId: string, note?: string): Promise<{ advisorId: string }> {
  return db.transaction(async tx => {
    const [app] = await tx.select().from(advisorApplications)
      .where(and(eq(advisorApplications.id, id), eq(advisorApplications.status, "pending"))).limit(1).for("update");
    if (!app) throw new ApplyError("找不到這筆待審申請（可能已經處理過）");
    const [exists] = await tx.select({ id: advisors.id }).from(advisors).where(eq(advisors.email, app.email)).limit(1);
    if (exists) throw new ApplyError("這個 email 已經是顧問帳號");
    const advisorId = crypto.randomUUID();
    await tx.insert(advisors).values({ id: advisorId, email: app.email, name: app.name, license_no: app.license_no, is_admin: 0, is_active: 1 });
    await tx.update(advisorApplications)
      .set({ status: "approved", reviewed_by: adminId, reviewed_at: nowText, review_note: note ?? null, advisor_id: advisorId })
      .where(eq(advisorApplications.id, id));
    return { advisorId };
  });
}

export async function rejectApplication(id: string, adminId: string, note?: string): Promise<void> {
  const rows = await db.update(advisorApplications)
    .set({ status: "rejected", reviewed_by: adminId, reviewed_at: nowText, review_note: note ?? null })
    .where(and(eq(advisorApplications.id, id), eq(advisorApplications.status, "pending")))
    .returning({ id: advisorApplications.id });
  if (!rows.length) throw new ApplyError("找不到這筆待審申請（可能已經處理過）");
}
