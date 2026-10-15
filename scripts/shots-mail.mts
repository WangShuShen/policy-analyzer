/*
 * 驗收截圖用（w2-06）：把「存摺提醒信」渲染成 HTML 檔，不寄信、不連資料庫。由 scripts/shots.mjs 呼叫。
 *   npx tsx scripts/shots-mail.mts <輸出的 .html>
 * 範例資料是虛構的（同 tmp/mail-preview.mts），信件版型跟排程真正寄的是同一個函式。
 */
import fs from "node:fs";
process.env.APP_URL ??= "https://radia-dev-woad.vercel.app";
const { passbookReminderMail } = await import("../lib/crm/passbookReminder");
const out = process.argv[2];
if (!out) { console.error("用法: npx tsx scripts/shots-mail.mts <輸出的 .html>"); process.exit(2); }
const t0 = Date.now() + 3 * 86400e3;
const b = { id: "preview-0001", startsAt: new Date(t0).toISOString(), endsAt: new Date(t0 + 40 * 60e3).toISOString(), mode: "online", status: "booked", conversationId: null,
  advisor: { id: "dev-adv-a", name: "林顧問（測試）", email: "adv@example.invalid", licenseNo: "A1234567", meetingLink: "https://meet.google.com/abc-defg-hij", onsiteLocation: null, specialties: [] },
  client: { id: "demo-preview", name: "王小明", email: "client@example.invalid" } };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const m = passbookReminderMail(b as any);
fs.writeFileSync(out, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${m.subject}</title>${m.html}`);
console.log(m.subject);
process.exit(0);
