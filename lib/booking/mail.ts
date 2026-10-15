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

// 色票照原型（app/radia.css 的 .rd 變數）；信件不能用 CSS 變數，只能寫死
const C = { ground: "#f6f8f6", surface: "#ffffff", line: "#dfe4e1", ink: "#151a19", ink2: "#4e5755", muted: "#838c89", brand: "#2f7a6b", brandInk: "#1f5a4e", sunk: "#eef1ee", amber: "#a9712a" };
const FONT = `'PingFang TC','Noto Sans TC','Microsoft JhengHei','Helvetica Neue',Arial,sans-serif`;
export const linkStyle = `color:${C.brandInk};text-decoration:underline`;
export const MUTED = C.muted, AMBER = C.amber;

/** 名字本身有「顧問」就不再加（「林顧問（測試） 顧問」） */
export const advisorTitle = (name: string) => /顧問/.test(name) ? name : `${name} 顧問`;

export interface MailLayout {
  title: string;
  preheader?: string;                 // 收件匣預覽那一行（不顯示在信裡）
  rows: [string, string][];           // 面談資訊：顧問／時間／方式…
  intro?: string[];                   // 按鈕上面的說明，一段一個
  cta?: { href: string; text: string };   // 唯一的主要動作
  notes?: { title: string; items: string[] };   // 次要說明（改期、取消…），條列
  outro?: string;                     // 卡片最後一句
  foot?: string[];                    // 卡片外的小字（日曆附件…）
}

/*
 * 所有預約信共用的版型（顧問 10/14：層次要清楚、只有一個主要動作）。
 * 標題 → 面談資訊 → 說明 → 主要按鈕 → 次要說明（條列）→ 卡片外小字。
 * 信件 HTML：全部 inline style、表格排版、按鈕用 table＋a（Outlook 也能顯示）。寬度用 100%＋max-width 560（手機才縮得下來），Outlook 不認 max-width，用條件註解包一層 560。
 */
export function layout(m: MailLayout): string {
  const P = (html: string, last = false) => `<p style="margin:0 0 ${last ? 0 : 12}px;font-size:15px;line-height:1.7;color:${C.ink2}">${html}</p>`;
  const rows = m.rows.map(([k, v]) => `<tr><td width="64" valign="top" style="padding:7px 0;font-size:14px;line-height:1.6;color:${C.muted};white-space:nowrap">${k}</td><td valign="top" style="padding:7px 0 7px 8px;font-size:15px;line-height:1.6;color:${C.ink}">${v}</td></tr>`).join("");
  const cta = m.cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 0"><tr><td align="center" bgcolor="${C.brand}" style="border-radius:8px;background:${C.brand}">
<a href="${m.cta.href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:16px;font-weight:700;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px;white-space:nowrap">${m.cta.text}</a></td></tr></table>` : "";
  const notes = m.notes ? `<tr><td style="padding:20px 24px 0"><div style="border-top:1px solid ${C.line};font-size:0;line-height:0">&nbsp;</div></td></tr>
<tr><td style="padding:16px 24px 0"><div style="font-size:14px;font-weight:700;color:${C.ink};margin:0 0 8px">${m.notes.title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${m.notes.items.map(i => `<tr><td width="14" valign="top" style="padding:3px 0;font-size:14px;line-height:1.65;color:${C.brand}">•</td><td valign="top" style="padding:3px 0;font-size:14px;line-height:1.65;color:${C.ink2}">${i}</td></tr>`).join("")}</table></td></tr>` : "";
  return `<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${m.title}</title></head>
<body style="margin:0;padding:0;background:${C.ground};font-family:${FONT};color:${C.ink};-webkit-text-size-adjust:100%">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${m.preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ground}" style="background:${C.ground}"><tr><td align="center" style="padding:28px 12px 32px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 0 14px;font-family:${FONT};font-size:20px;font-weight:800;letter-spacing:-.02em;color:${C.ink}">RAD<span style="color:${C.brand}">IA</span></td></tr>
<tr><td bgcolor="${C.surface}" style="background:${C.surface};border:1px solid ${C.line};border-radius:14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:26px 24px 6px;font-family:${FONT};font-size:22px;font-weight:800;line-height:1.35;color:${C.ink}">${m.title}</td></tr>
<tr><td style="padding:8px 24px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.sunk}" style="background:${C.sunk};border-radius:10px"><tr><td style="padding:8px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table></td></tr></table></td></tr>
${m.intro?.length || m.cta ? `<tr><td style="padding:18px 24px 0">${(m.intro ?? []).map((x, i, arr) => P(x, !m.cta && i === arr.length - 1)).join("")}${cta}</td></tr>` : ""}
${notes}
${m.outro ? `<tr><td style="padding:16px 24px 0">${P(m.outro, true)}</td></tr>` : ""}
<tr><td style="padding:0 0 24px;font-size:0;line-height:0">&nbsp;</td></tr>
</table></td></tr>
${(m.foot ?? []).map(f => `<tr><td style="padding:12px 2px 0;font-size:12px;line-height:1.6;color:${C.muted}">${f}</td></tr>`).join("")}
<tr><td style="padding:12px 2px 0;font-size:12px;line-height:1.6;color:${C.muted}">RADIA · 保險這件事，先弄懂再決定</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export const ICS_FOOT = "附件是日曆邀請（.ics），點開就能加入 Google／Apple／Outlook 日曆。";

export function whereText(b: BookingDetail): { label: string; html: string; plain: string | null } {
  if (b.mode === "online") {
    const link = b.advisor.meetingLink;
    return { label: "線上視訊", html: link ? `線上視訊<br><a href="${esc(link)}" style="${linkStyle};word-break:break-all">${esc(link)}</a>` : "線上視訊（連結顧問會另外提供）", plain: link };
  }
  return { label: "面對面", html: `面對面${b.advisor.onsiteLocation ? `<br>${esc(b.advisor.onsiteLocation)}` : ""}`, plain: b.advisor.onsiteLocation };
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

  const adv = advisorTitle(b.advisor.name);

  // 給客戶：只有一個主要動作——沒存摺就是「上傳保險存摺」，有了就是「查看我的預約」
  const toClient: Mail = {
      from, to: b.client.email, replyTo: b.advisor.email,
      subject: `約好了：${when} 跟 ${adv}聊聊`,
      html: layout({
        title: "約好了",
        preheader: `${when}，${adv}${opts.hasPassbook ? "會先看過你的保單" : "。面談前上傳保險存摺，分析會更準"}`,
        rows: [
          ["顧問", `${esc(b.advisor.name)}${b.advisor.licenseNo ? `<br><span style="color:${MUTED};font-size:12px">登錄字號 ${esc(b.advisor.licenseNo)}</span>` : ""}`],
          ["時間", `${when}<br><span style="color:${MUTED};font-size:13px">最長約 2 小時</span>`],
          ["方式", where.html],
        ],
        intro: opts.hasPassbook
          ? ["你的保險存摺已經整理好了，顧問面談前會先看過，<b>不用再傳一次</b>。", "你在對話裡講過的狀況也會一起帶給顧問，<b>不用重講一次</b>。"]
          : ["面談前<b>上傳保險存摺</b>，顧問才做得出專屬你的分析——現在有多少、還差多少。", "你在對話裡講過的狀況會一起帶給顧問，<b>不用重講一次</b>。"],
        cta: opts.hasPassbook ? { href: `${appUrl()}/me`, text: "查看我的預約" } : { href: `${appUrl()}/consult`, text: "上傳保險存摺" },
        notes: { title: "要改時間或取消", items: [
          `要改時間：到 <a href="${appUrl()}/me" style="${linkStyle}">我的頁面</a> 自己改（面談前 2 小時以前）`,
          `2 小時內臨時有事：直接回覆這封信，會寄到 ${esc(adv)}`,
          "不想談了也沒關係，不會有人一直打給你",
        ] },
        foot: [ICS_FOOT],
      }),
      attachments: [ics(`RADIA 面談：${adv}`, `${when}｜${where.label}${where.plain ? `｜${where.plain}` : ""}\n要改時間或取消：RADIA 我的頁面（面談前 2 小時以前）。`)],
  };

  // 給顧問（不放需求點內容，只給連結；登入後才看得到，查閱留稽核）
  const toAdvisor: Mail = {
      from, to: b.advisor.email, replyTo: b.client.email,
      subject: `新預約：${when} ${b.client.name ?? "客戶"}`,
      html: layout({
        title: "你有一個新預約",
        preheader: `${when} ${b.client.name ?? "客戶"}`,
        rows: [
          ["客戶", esc(b.client.name ?? "（未提供姓名）")],
          ["時間", `${when}<br><span style="color:${MUTED};font-size:13px">最長約 2 小時</span>`],
          ["方式", where.html],
          ["保單", opts.hasPassbook ? "已上傳保險存摺" : `<span style="color:${AMBER}">還沒上傳存摺</span>`],
        ],
        intro: ["面談前請先看過客戶的諮詢紀錄與需求點（要登入 RADIA 顧問工作台）。"],
        cta: { href: `${appUrl()}/clients/${b.client.id}`, text: "打開客戶頁" },
        notes: { title: "面談結束後", items: ["在客戶頁標記結果：已面談／沒出現（客戶可以自己在面談前 2 小時以前改期，改了你會收到通知）", "<b>標記「已面談」</b>，客戶端的完整分析才會解鎖"] },
        foot: [ICS_FOOT],
      }),
      attachments: [ics(`RADIA 面談：${b.client.name ?? "客戶"}`, `${when}｜${where.label}${where.plain ? `｜${where.plain}` : ""}`)],
  };
  return [toClient, toAdvisor];
}
