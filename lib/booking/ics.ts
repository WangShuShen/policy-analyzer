/*
 * 日曆邀請（實作設計 B2）：預約成立寄 .ics 給雙方，一鍵加入 Google／Apple／Outlook 日曆。
 * 用 METHOD:PUBLISH（「加入日曆」），不用 REQUEST——REQUEST 需要有主辦人信箱處理回覆，W1a 沒有。
 * 改期／取消（W1b）用同一個 UID、SEQUENCE 加一、STATUS:CANCELLED 更新同一筆。
 */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// RFC 5545：每行最多 75 個位元組，超過要折行（續行以一個空白開頭）
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = []; let cur = "", len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) { out.push(cur); cur = ""; len = 0; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function bookingIcs(b: {
  id: string; startsAt: string; endsAt: string; summary: string; description: string; location: string | null; url?: string | null; sequence?: number; cancelled?: boolean;
}): string {
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//RADIA//Booking//ZH-TW", "CALSCALE:GREGORIAN",
    `METHOD:${b.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${b.id}@radia`,
    `SEQUENCE:${b.sequence ?? 0}`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(b.startsAt)}`,
    `DTEND:${stamp(b.endsAt)}`,
    `SUMMARY:${esc(b.summary)}`,
    `DESCRIPTION:${esc(b.description)}`,
    ...(b.location ? [`LOCATION:${esc(b.location)}`] : []),
    ...(b.url ? [`URL:${b.url}`] : []),
    `STATUS:${b.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:RADIA 面談", "TRIGGER:-PT30M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
