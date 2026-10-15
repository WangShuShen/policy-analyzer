import { and, eq, isNull } from "drizzle-orm";
import db, { nowText } from "@/lib/db";
import { bookings } from "@/lib/schema";
import { bookingDetailById, type BookingDetail } from "./service";
import { advisorTitle, appUrl, layout, mailAdvisor } from "./mail";
import { sendNow, type OutMail } from "@/lib/notify/outbox";

/*
 * 「你的完整分析已經打開」（決議 4-at #2）：顧問按「已面談」解鎖的那一刻寄給客戶，按鈕帶回 /analysis。
 *   ・只在按下去的當下觸發，沒有排程補寄（已經是已面談的舊預約不會收到）
 *   ・一筆預約只寄一次：先把 bookings.unlock_mailed_at 標上再寄（撤銷後再解鎖、連按兩次都不會重寄）
 *   ・信裡不放分析內容（N8），只給連結
 */
export function unlockedMail(b: BookingDetail): OutMail {
  const adv = advisorTitle(b.advisor.name);
  return {
    to: b.client.email, replyTo: b.advisor.email, kind: "analysis_unlocked", bookingId: b.id,
    subject: `你的完整分析已經打開了`,
    html: layout({
      title: "你的完整分析已經打開了",
      preheader: `跟 ${adv}談完了，該補什麼、方向與保費試算都看得到了`,
      advisor: mailAdvisor(b),
      intro: [`謝謝你跟 ${adv}聊。面談前鎖住的部分——<b>該補什麼、方向確認與保費試算</b>——現在都打開了，隨時可以回來看。`, "有不清楚的地方，直接回覆這封信問顧問就好。"],
      cta: { href: `${appUrl()}/analysis`, text: "看我的完整分析" },
    }),
  };
}

/** 按「已面談」之後呼叫：第一次才寄。寄失敗不影響標記（佇列會重試） */
export async function sendUnlockedMailOnce(bookingId: string): Promise<boolean> {
  const claimed = await db.update(bookings).set({ unlock_mailed_at: nowText })
    .where(and(eq(bookings.id, bookingId), eq(bookings.status, "met"), isNull(bookings.unlock_mailed_at))).returning({ id: bookings.id });
  if (!claimed.length) return false;
  const d = await bookingDetailById(bookingId);
  if (!d) return false;
  await sendNow([unlockedMail(d)]);
  return true;
}
