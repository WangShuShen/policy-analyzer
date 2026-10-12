import { bookingIcs } from "./ics";
import { fmtTaipei } from "./slots";
import { appUrl, esc, layout, whereText } from "./mail";
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
const link = (path: string, text: string) => `<a href="${appUrl()}${path}" style="color:#1f5a4e">${text}</a>`;

/** 客戶改期：舊的取消、新的成立 */
export function rescheduledMails(oldB: BookingDetail, newB: BookingDetail, count: number): OutMail[] {
  const was = fmtTaipei(oldB.startsAt), now = fmtTaipei(newB.startsAt), w = whereText(newB);
  return [
    { to: newB.client.email, replyTo: newB.advisor.email, kind: "rescheduled", bookingId: newB.id,
      subject: `改好了：${now} 跟 ${newB.advisor.name} 顧問聊聊`,
      html: layout("時間改好了", [["顧問", esc(newB.advisor.name)], ["新時間", `${now}（約 40 分鐘）`], ["原本", `<s style="color:#838c89">${was}</s>`], ["方式", w.html]],
        `附件已經更新你的日曆：舊時間會取消、新時間會加上。<br>還要再改，到 ${link("/me", "我的頁面")} 就可以（面談前 2 小時以前）。`),
      ics: [ics(oldB, "client", true), ics(newB, "client")] },
    { to: newB.advisor.email, replyTo: newB.client.email, kind: count >= 3 ? "reschedule_often" : "rescheduled", bookingId: newB.id,
      subject: `${count >= 3 ? `第 ${count} 次改期` : "客戶改期"}：${clientName(newB)} 改到 ${now}`,
      html: layout("客戶改了時間", [["客戶", esc(clientName(newB))], ["新時間", now], ["原本", `<s style="color:#838c89">${was}</s>`], ["方式", w.html]],
        `${count >= 3 ? `<b>這是這位客戶第 ${count} 次改期</b>，可能意願在降，面談前可以先關心一下。<br>` : ""}${link(`/clients/${newB.client.id}`, "打開客戶頁")}`),
      ics: [ics(oldB, "advisor", true), ics(newB, "advisor")] },
  ];
}

/** 客戶自己取消 */
export function clientCancelledMails(b: BookingDetail): OutMail[] {
  const when = fmtTaipei(b.startsAt);
  return [
    { to: b.client.email, replyTo: b.advisor.email, kind: "cancelled_by_client", bookingId: b.id,
      subject: `已取消：${when} 跟 ${b.advisor.name} 顧問的面談`,
      html: layout("已經幫你取消了", [["顧問", esc(b.advisor.name)], ["原本時間", when]],
        `你在 RADIA 留下的資料都還在。之後想談，${link("/advisors", "再挑一次時間")}就好。`),
      ics: [ics(b, "client", true)] },
    { to: b.advisor.email, replyTo: b.client.email, kind: "cancelled_by_client", bookingId: b.id,
      subject: `客戶取消：${when} ${clientName(b)}`,
      html: layout("客戶取消了面談", [["客戶", esc(clientName(b))], ["原本時間", when]], `這個時段已經重新開放給其他客戶預約。`),
      ics: [ics(b, "advisor", true)] },
  ];
}

/** 顧問取消（原因必填，會寫給客戶看） */
export function advisorCancelledMails(b: BookingDetail, reason: string): OutMail[] {
  const when = fmtTaipei(b.startsAt);
  return [
    { to: b.client.email, replyTo: b.advisor.email, kind: "cancelled_by_advisor", bookingId: b.id,
      subject: `${b.advisor.name} 顧問取消了 ${when} 的面談`,
      html: layout("面談取消了", [["顧問", esc(b.advisor.name)], ["原本時間", when], ["原因", esc(reason)]],
        `很抱歉臨時取消。你的資料都還在，${link("/advisors", "重新挑一個時間或另一位顧問")}，前面講過的狀況會一起帶過去。`),
      ics: [ics(b, "client", true)] },
    { to: b.advisor.email, replyTo: b.client.email, kind: "cancelled_by_advisor", bookingId: b.id,
      subject: `你已取消：${when} ${clientName(b)}`,
      html: layout("已取消並通知客戶", [["客戶", esc(clientName(b))], ["原本時間", when], ["你寫的原因", esc(reason)]], `客戶會收到你寫的原因，以及重新預約的連結。`),
      ics: [ics(b, "advisor", true)] },
  ];
}

/** 面談前一天（雙方）、前 1 小時（只給客戶） */
export function reminderMails(b: BookingDetail, kind: "24h" | "1h", opts: { advisorViewed: boolean; hasPassbook: boolean }): OutMail[] {
  const when = fmtTaipei(b.startsAt), w = whereText(b);
  const join = b.mode === "online" && b.advisor.meetingLink ? `<br><br>時間到了點這裡加入：<a href="${esc(b.advisor.meetingLink)}" style="color:#1f5a4e">${esc(b.advisor.meetingLink)}</a>` : "";
  const out: OutMail[] = [{
    to: b.client.email, replyTo: b.advisor.email, kind: `reminder_${kind}`, bookingId: b.id,
    subject: kind === "24h" ? `明天提醒：${when} 跟 ${b.advisor.name} 顧問聊聊` : `再 1 小時：${b.advisor.name} 顧問的面談`,
    html: layout(kind === "24h" ? "明天見" : "再 1 小時就開始", [["顧問", esc(b.advisor.name)], ["時間", `${when}（約 40 分鐘）`], ["方式", w.html]],
      `${kind === "24h" ? (opts.hasPassbook ? "保險存摺已經給顧問看過了，明天直接開始談就好。" : `還沒上傳保險存摺的話，今天${link("/consult", "上傳")}還來得及。`) + `<br>要改時間，到 ${link("/me", "我的頁面")}（面談前 2 小時以前）。` : "臨時有事的話，直接回覆這封信跟顧問說。"}${join}`),
  }];
  if (kind === "24h") out.push({
    to: b.advisor.email, replyTo: b.client.email, kind: "reminder_24h", bookingId: b.id,
    subject: `明天面談：${when} ${clientName(b)}`,
    html: layout("明天有一場面談", [["客戶", esc(clientName(b))], ["時間", when], ["方式", w.html], ["保單", opts.hasPassbook ? "已上傳保險存摺" : "<span style=\"color:#a9712a\">還沒上傳存摺</span>"]],
      `${opts.advisorViewed ? "" : "<b>你還沒看過這位客戶的諮詢紀錄</b>，面談前記得先看。<br>"}${link(`/clients/${b.client.id}`, "打開客戶頁")}`),
  });
  return out;
}
