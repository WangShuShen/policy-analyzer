import { bookingIcs } from "./ics";
import { fmtTaipei } from "./slots";
import { advisorTitle, appUrl, AMBER, esc, ICS_FOOT, layout, linkStyle, MUTED, whereText } from "./mail";
import type { OutMail, IcsFile } from "@/lib/notify/outbox";
import type { BookingDetail } from "./service";

/*
 * 預約之後的通知信（實作設計 B3）：改期、客戶取消、顧問取消、面談前一天與前 1 小時提醒。
 * 跟確認信同一個版型；日曆附件用同一個 UID 更新（取消＝METHOD:CANCEL），客戶日曆上的舊時間會自己消失。
 * 信裡不放需求點、保單內容（N8）。
 */
const clientName = (b: BookingDetail) => b.client.name ?? "客戶";

function ics(b: BookingDetail, who: "client" | "advisor", cancelled = false): IcsFile {
  const where = whereText(b);
  const summary = who === "client" ? `RADIA 面談：${b.advisor.name} 顧問` : `RADIA 面談：${clientName(b)}`;
  return {
    filename: cancelled ? "radia-cancel.ics" : "radia-meeting.ics", method: cancelled ? "CANCEL" : "PUBLISH",
    content: bookingIcs({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, summary, description: `${fmtTaipei(b.startsAt)}｜${where.label}${where.plain ? `｜${where.plain}` : ""}`,
      location: where.plain, url: b.mode === "online" ? b.advisor.meetingLink : null, sequence: cancelled ? 1 : 0, cancelled }),
  };
}
const link = (path: string, text: string) => `<a href="${appUrl()}${path}" style="${linkStyle}">${text}</a>`;
const timeCell = (when: string) => `${when}<br><span style="color:${MUTED};font-size:13px">約 40 分鐘</span>`;
const struck = (when: string) => `<s style="color:${MUTED}">${when}</s>`;
const cancelFoot = "附件會把這場面談從你的日曆移除。";

/** 客戶改期：舊的取消、新的成立 */
export function rescheduledMails(oldB: BookingDetail, newB: BookingDetail, count: number): OutMail[] {
  const was = fmtTaipei(oldB.startsAt), now = fmtTaipei(newB.startsAt), w = whereText(newB), adv = advisorTitle(newB.advisor.name);
  return [
    { to: newB.client.email, replyTo: newB.advisor.email, kind: "rescheduled", bookingId: newB.id,
      subject: `改好了：${now} 跟 ${adv}聊聊`,
      html: layout({ title: "時間改好了", preheader: `新時間：${now}`,
        rows: [["顧問", esc(newB.advisor.name)], ["新時間", timeCell(now)], ["原本", struck(was)], ["方式", w.html]],
        intro: ["附件已經更新你的日曆：舊時間會取消、新時間會加上。"],
        cta: { href: `${appUrl()}/me`, text: "查看我的預約" },
        notes: { title: "還要再改", items: [`到 ${link("/me", "我的頁面")} 自己改（面談前 2 小時以前）`, "2 小時內臨時有事：直接回覆這封信"] },
        foot: [ICS_FOOT] }),
      ics: [ics(oldB, "client", true), ics(newB, "client")] },
    { to: newB.advisor.email, replyTo: newB.client.email, kind: count >= 3 ? "reschedule_often" : "rescheduled", bookingId: newB.id,
      subject: `${count >= 3 ? `第 ${count} 次改期` : "客戶改期"}：${clientName(newB)} 改到 ${now}`,
      html: layout({ title: "客戶改了時間", preheader: `${clientName(newB)} 改到 ${now}`,
        rows: [["客戶", esc(clientName(newB))], ["新時間", now], ["原本", struck(was)], ["方式", w.html]],
        intro: count >= 3 ? [`<b>這是這位客戶第 ${count} 次改期</b>，可能意願在降，面談前可以先關心一下。`] : undefined,
        cta: { href: `${appUrl()}/clients/${newB.client.id}`, text: "打開客戶頁" },
        foot: [ICS_FOOT] }),
      ics: [ics(oldB, "advisor", true), ics(newB, "advisor")] },
  ];
}

/** 客戶自己取消 */
export function clientCancelledMails(b: BookingDetail): OutMail[] {
  const when = fmtTaipei(b.startsAt), adv = advisorTitle(b.advisor.name);
  return [
    { to: b.client.email, replyTo: b.advisor.email, kind: "cancelled_by_client", bookingId: b.id,
      subject: `已取消：${when} 跟 ${adv}的面談`,
      html: layout({ title: "已經幫你取消了", preheader: `${when} 的面談已取消`,
        rows: [["顧問", esc(b.advisor.name)], ["原本時間", struck(when)]],
        intro: ["你在 RADIA 留下的資料都還在。之後想談，再挑一次時間就好。"],
        cta: { href: `${appUrl()}/advisors`, text: "再挑一次時間" },
        foot: [cancelFoot] }),
      ics: [ics(b, "client", true)] },
    { to: b.advisor.email, replyTo: b.client.email, kind: "cancelled_by_client", bookingId: b.id,
      subject: `客戶取消：${when} ${clientName(b)}`,
      html: layout({ title: "客戶取消了面談", preheader: `${clientName(b)} 取消了 ${when}`,
        rows: [["客戶", esc(clientName(b))], ["原本時間", struck(when)]],
        outro: "這個時段已經重新開放給其他客戶預約。",
        foot: [cancelFoot] }),
      ics: [ics(b, "advisor", true)] },
  ];
}

/** 顧問取消（原因必填，會寫給客戶看） */
export function advisorCancelledMails(b: BookingDetail, reason: string): OutMail[] {
  const when = fmtTaipei(b.startsAt), adv = advisorTitle(b.advisor.name);
  return [
    { to: b.client.email, replyTo: b.advisor.email, kind: "cancelled_by_advisor", bookingId: b.id,
      subject: `${adv}取消了 ${when} 的面談`,
      html: layout({ title: "面談取消了", preheader: `${adv}取消了 ${when} 的面談`,
        rows: [["顧問", esc(b.advisor.name)], ["原本時間", struck(when)], ["原因", esc(reason)]],
        intro: ["很抱歉臨時取消。你的資料都還在，可以重新挑一個時間或另一位顧問，前面講過的狀況會一起帶過去。"],
        cta: { href: `${appUrl()}/advisors`, text: "重新預約" },
        foot: [cancelFoot] }),
      ics: [ics(b, "client", true)] },
    { to: b.advisor.email, replyTo: b.client.email, kind: "cancelled_by_advisor", bookingId: b.id,
      subject: `你已取消：${when} ${clientName(b)}`,
      html: layout({ title: "已取消並通知客戶", preheader: `${when} ${clientName(b)}`,
        rows: [["客戶", esc(clientName(b))], ["原本時間", struck(when)], ["你寫的原因", esc(reason)]],
        outro: "客戶會收到你寫的原因，以及重新預約的連結。",
        foot: [cancelFoot] }),
      ics: [ics(b, "advisor", true)] },
  ];
}

/** 面談前一天（雙方）、前 1 小時（只給客戶） */
export function reminderMails(b: BookingDetail, kind: "24h" | "1h", opts: { advisorViewed: boolean; hasPassbook: boolean }): OutMail[] {
  const when = fmtTaipei(b.startsAt), w = whereText(b), adv = advisorTitle(b.advisor.name);
  const meet = b.mode === "online" && b.advisor.meetingLink ? { href: esc(b.advisor.meetingLink), text: "加入視訊面談" } : undefined;
  const rows: [string, string][] = [["顧問", esc(b.advisor.name)], ["時間", timeCell(when)], ["方式", w.html]];
  const client: OutMail = kind === "24h"
    ? { to: b.client.email, replyTo: b.advisor.email, kind: "reminder_24h", bookingId: b.id,
        subject: `明天提醒：${when} 跟 ${adv}聊聊`,
        html: layout({ title: "明天見", preheader: `明天 ${when}，${adv}`, rows,
          // 主要動作：沒存摺就上傳；有了就看預約
          intro: [opts.hasPassbook ? "保險存摺已經給顧問看過了，明天直接開始談就好。" : "還沒上傳保險存摺的話，今天上傳還來得及，顧問明天就能直接談你的保單。"],
          cta: opts.hasPassbook ? { href: `${appUrl()}/me`, text: "查看我的預約" } : { href: `${appUrl()}/consult`, text: "上傳保險存摺" },
          notes: { title: "要改時間或取消", items: [`要改時間：到 ${link("/me", "我的頁面")} 自己改（面談前 2 小時以前）`, `2 小時內臨時有事：直接回覆這封信，會寄到 ${esc(adv)}`] } }) }
    : { to: b.client.email, replyTo: b.advisor.email, kind: "reminder_1h", bookingId: b.id,
        subject: `再 1 小時：${adv}的面談`,
        html: layout({ title: "再 1 小時就開始", preheader: `${when}，${adv}`, rows,
          intro: meet ? ["時間到了按下面的按鈕加入。"] : undefined,
          cta: meet,
          outro: "臨時有事的話，直接回覆這封信跟顧問說。" }) };
  const out: OutMail[] = [client];
  if (kind === "24h") out.push({
    to: b.advisor.email, replyTo: b.client.email, kind: "reminder_24h", bookingId: b.id,
    subject: `明天面談：${when} ${clientName(b)}`,
    html: layout({ title: "明天有一場面談", preheader: `${when} ${clientName(b)}`,
      rows: [["客戶", esc(clientName(b))], ["時間", when], ["方式", w.html], ["保單", opts.hasPassbook ? "已上傳保險存摺" : `<span style="color:${AMBER}">還沒上傳存摺</span>`]],
      intro: opts.advisorViewed ? undefined : ["<b>你還沒看過這位客戶的諮詢紀錄</b>，面談前記得先看。"],
      cta: { href: `${appUrl()}/clients/${b.client.id}`, text: "打開客戶頁" } }),
  });
  return out;
}
