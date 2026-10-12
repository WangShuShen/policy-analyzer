import { bookingIcs } from "./ics";
import { sendNow, type OutMail } from "@/lib/notify/outbox";
import { fmtTaipei } from "./slots";
import type { BookingDetail } from "./service";

/*
 * 預約成立的通知（實作設計 B3：W1 用 Email，W2 加 LINE 官方帳號）。
 *   客戶：確認信＋.ics＋會議連結或地點；還沒傳存摺的提醒一句
 *   顧問：新預約通知＋.ics＋客戶需求點摘要的連結
 * 信件不放任何需求點內容與保單資料——信會被轉寄、會留在信箱裡（N8：可查不可匯出）。
 * 寄信一律走佇列（lib/notify/outbox.ts）：當下試寄，失敗由排程重試（W1b，T7）。寄失敗不影響預約本身。
 */

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const layout = (title: string, rows: [string, string][], body: string) => `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f8f6;font-family:'Helvetica Neue',Arial,'PingFang TC','Noto Sans TC',sans-serif;color:#151a19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f8f6"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%">
<tr><td style="padding:4px 4px 16px;font-size:18px;font-weight:800;letter-spacing:-.02em">RAD<span style="color:#2f7a6b">IA</span></td></tr>
<tr><td style="background:#ffffff;border:1px solid #dfe4e1;border-radius:16px;padding:24px 24px 20px">
<div style="font-size:20px;font-weight:750;margin-bottom:14px">${title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6">
${rows.map(([k, v]) => `<tr><td width="72" valign="top" style="padding:6px 0;color:#838c89">${k}</td><td style="padding:6px 0">${v}</td></tr>`).join("")}
</table>
<div style="font-size:14px;line-height:1.75;color:#4e5755;margin-top:16px">${body}</div>
</td></tr>
<tr><td style="padding:14px 4px;font-size:11.5px;color:#838c89;line-height:1.6">附件是日曆邀請（.ics），點開就能加入 Google／Apple／Outlook 日曆。</td></tr>
</table></td></tr></table></body></html>`;

export function whereText(b: BookingDetail): { label: string; html: string; plain: string | null } {
  if (b.mode === "online") {
    const link = b.advisor.meetingLink;
    return { label: "線上視訊", html: link ? `線上視訊　<a href="${esc(link)}" style="color:#1f5a4e">${esc(link)}</a>` : "線上視訊（連結顧問會另外提供）", plain: link };
  }
  return { label: "面對面", html: `面對面　${esc(b.advisor.onsiteLocation ?? "")}`, plain: b.advisor.onsiteLocation };
}

export type Mail = { from: string; to: string; replyTo: string; subject: string; html: string; attachments: { filename: string; content: string; contentType: string }[] };

/** 預約成立的兩封信：排進寄信佇列並馬上試寄 */
export async function sendBookingEmails(b: BookingDetail, opts: { hasPassbook: boolean }): Promise<void> {
  const [c, a] = buildBookingEmails(b, opts);
  await sendNow([toOut(c, "new_booking", b.id), toOut(a, "new_booking", b.id)]);
}

/** 舊格式（含 attachments）轉成佇列格式 */
export function toOut(m: Mail, kind: string, bookingId: string): OutMail {
  return { to: m.to, replyTo: m.replyTo, subject: m.subject, html: m.html, kind, bookingId,
    ics: m.attachments.map(x => ({ filename: x.filename, content: x.content, method: "PUBLISH" as const })) };
}

/** 組出兩封信（不寄）。測試與預覽用同一份 */
export function buildBookingEmails(b: BookingDetail, opts: { hasPassbook: boolean }): [Mail, Mail] {
  const when = fmtTaipei(b.startsAt);
  const where = whereText(b);
  const ics = (summary: string, description: string) => ({
    filename: "radia-meeting.ics",
    content: bookingIcs({ id: b.id, startsAt: b.startsAt, endsAt: b.endsAt, summary, description, location: where.plain, url: b.mode === "online" ? b.advisor.meetingLink : null }),
    contentType: "text/calendar; charset=utf-8; method=PUBLISH",
  });
  const from = `RADIA <${process.env.GMAIL_USER}>`;

  // 給客戶
  const toClient: Mail = {
      from, to: b.client.email, replyTo: b.advisor.email,
      subject: `約好了：${when} 跟 ${b.advisor.name} 顧問聊聊`,
      html: layout("約好了", [
        ["顧問", `${esc(b.advisor.name)}${b.advisor.licenseNo ? `　<span style="color:#838c89;font-size:12px">登錄字號 ${esc(b.advisor.licenseNo)}</span>` : ""}`],
        ["時間", `${when}（約 40 分鐘）`],
        ["方式", where.html],
      ], `${opts.hasPassbook
        ? `你的保險存摺已經整理好了，${esc(b.advisor.name)} 顧問面談前會先看過，<b>不用再傳一次</b>。`
        : `面談前<b>上傳保險存摺</b>，顧問才做得出專屬你的分析（現在有多少、還差多少）。<a href="${appUrl()}/consult" style="color:#1f5a4e">回到 RADIA 上傳</a>`}
        <br><br>你在對話裡講過的狀況會一起帶給顧問，<b>不用重講一次</b>。<br>
        要改時間或取消，到 <a href="${appUrl()}/me" style="color:#1f5a4e">RADIA 我的頁面</a> 自己改就好（面談前 2 小時以前都可以）；2 小時內臨時有事，直接回覆這封信就會寄到 ${esc(b.advisor.name)} 顧問那裡。不想談了也沒關係，不會有人一直打給你。`),
      attachments: [ics(`RADIA 面談：${b.advisor.name} 顧問`, `${when}｜${where.label}${where.plain ? `｜${where.plain}` : ""}\n要改時間或取消：RADIA 我的頁面（面談前 2 小時以前）。`)],
  };

  // 給顧問（不放需求點內容，只給連結；登入後才看得到，查閱留稽核）
  const toAdvisor: Mail = {
      from, to: b.advisor.email, replyTo: b.client.email,
      subject: `新預約：${when} ${b.client.name ?? "客戶"}`,
      html: layout("你有一個新預約", [
        ["客戶", esc(b.client.name ?? "（未提供姓名）")],
        ["時間", `${when}（約 40 分鐘）`],
        ["方式", where.html],
        ["保單", opts.hasPassbook ? "已上傳保險存摺" : "<span style=\"color:#a9712a\">還沒上傳存摺</span>"],
      ], `面談前請先看過客戶的諮詢紀錄與需求點：<a href="${appUrl()}/clients/${b.client.id}" style="color:#1f5a4e">打開這位客戶的客戶頁</a>（要登入 RADIA 顧問工作台）。<br>
        面談結束後記得在客戶頁標記結果（已面談／沒出現／改期）——<b>標記「已面談」客戶端的完整分析才會解鎖</b>。`),
      attachments: [ics(`RADIA 面談：${b.client.name ?? "客戶"}`, `${when}｜${where.label}${where.plain ? `｜${where.plain}` : ""}`)],
  };
  return [toClient, toAdvisor];
}
