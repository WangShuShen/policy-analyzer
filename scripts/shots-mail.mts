/*
 * 驗收截圖用：把客戶會收到的每一種信渲染成 HTML 檔，不寄信、不連資料庫。由 scripts/shots.mjs 呼叫。
 *   npx tsx scripts/shots-mail.mts <輸出資料夾>
 * 輸出 <key>.html，並在 stdout 印一行 JSON：[{ key, item, label, subject }]（item＝掛在哪個驗收項目）
 * 範例資料是虛構的；信件版型跟真正寄出的是同一組函式。地址用佔位字照樣顯示（不特判）。
 */
import fs from "node:fs";
import path from "node:path";
process.env.APP_URL ??= "https://radia-dev-woad.vercel.app";
const { buildBookingEmails } = await import("../lib/booking/mail");
const N = await import("../lib/booking/notices");
const { passbookReminderMail } = await import("../lib/crm/passbookReminder");
const { unlockedMail } = await import("../lib/booking/unlocked").catch(() => ({ unlockedMail: null }));
const out = process.argv[2];
if (!out) { console.error("用法: npx tsx scripts/shots-mail.mts <輸出資料夾>"); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const t0 = Date.parse("2026-10-16T04:00:00Z");   // 台灣 10/16（五）12:00
const B = (mode: "online" | "onsite", dt = 0) => ({ id: "preview-0001", startsAt: new Date(t0 + dt).toISOString(), endsAt: new Date(t0 + dt + 120 * 60e3).toISOString(), mode, status: "booked", conversationId: null,
  advisor: { id: "dev-adv-a", name: "林顧問（測試）", email: "adv@example.invalid", licenseNo: "A1234567", meetingLink: mode === "online" ? "https://meet.google.com/abc-defg-hij" : null,
    onsiteLocation: mode === "onsite" ? "台北市大安區復興南路一段 100 號 5 樓" : null, specialties: [] },
  client: { id: "demo-preview", name: "王小明", email: "client@example.invalid" } }) as any;   // eslint-disable-line @typescript-eslint/no-explicit-any

const mails: { key: string; item: string; label: string; subject: string; html: string }[] = [];
const add = (key: string, item: string, label: string, m: { subject: string; html: string }) => mails.push({ key, item, label, subject: m.subject, html: m.html });
add("mail-confirm-online", "w1-06", "預約確認信（線上、還沒傳存摺）", buildBookingEmails(B("online"), { hasPassbook: false })[0]);
add("mail-confirm-onsite", "w1-06", "預約確認信（面對面、傳過存摺）", buildBookingEmails(B("onsite"), { hasPassbook: true })[0]);
add("mail-reminder-24h", "w1-06", "面談前一天提醒信（面對面、還沒傳存摺）", N.reminderMails(B("onsite"), "24h", { advisorViewed: false, hasPassbook: false })[0]);
add("mail-reminder-1h", "w1-06", "面談前 1 小時提醒信（線上）", N.reminderMails(B("online"), "1h", { advisorViewed: true, hasPassbook: true })[0]);
add("mail-rescheduled", "w1b-02", "改期信", N.rescheduledMails(B("onsite"), B("onsite", 86400e3), 1)[0]);
add("mail-cancel-client", "w1b-02", "客戶自己取消的確認信", N.clientCancelledMails(B("online"))[0]);
add("mail-cancel-advisor", "w1b-02", "顧問取消、通知客戶的信", N.advisorCancelledMails(B("online"), "家裡臨時有事，很抱歉")[0]);
add("mail-passbook-reminder", "w2-06", "存摺提醒信（預約後 24 小時還沒上傳）", passbookReminderMail(B("onsite")));
if (unlockedMail) add("mail-unlocked", "w1-04", "完整分析打開的通知信（顧問標已面談）", unlockedMail(B("onsite")));

for (const m of mails) fs.writeFileSync(path.join(out, `${m.key}.html`), m.html);
console.log(JSON.stringify(mails.map(({ html: _h, ...rest }) => rest)));
process.exit(0);
