import db from "@/lib/db";
import { advisors, advisorSlots, bookings, conversations, users } from "@/lib/schema";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { availableSlots, blockProblem, BUFFER_MINUTES, clampRules, ruleProblem, type Block, type Slot, type Taken, type WeeklyRule } from "./slots";

/*
 * 預約（實作設計 B1–B5、4-y）。W1a：顧問頁、時段、預約、確認信＋.ics、會議連結。
 * 提醒、自助改期取消、顧問取消、站內通知在 lib/booking/lifecycle.ts（W1b）。
 *
 * 客戶看得到的顧問：啟用中、有登錄字號（N20：讓客戶可查證身分）、寫了自我介紹、
 * 設了至少一個每週時段、而且有線上連結或面對面地點——少一樣就約不成，不如不列。
 * 卡片刻意不放年資與成交件數（原型：保護新人，客戶會挑看起來最專業的）。
 */

export const SPECS = ["家庭保障規劃", "退休與資產規劃", "保單健檢與理賠", "高資產傳承", "小資族規劃"];
export const STYLES = ["先把數字算清楚再談", "慢慢來，不急著成交", "用故事和案例說明", "直接講重點不囉嗦"];

export interface AdvisorCard {
  id: string; name: string; initial: string; specialties: string[]; style: string | null; intro: string;
  licenseNo: string; modes: ("online" | "onsite")[]; onsiteArea: string | null; slotsThisWeek: number;
  responseLabel: string | null;   // W2 w2-05：系統算的回應速度標籤（新加入或太慢＝null，不顯示）
}

const parseSpecs = (s: string | null) => { try { const a = JSON.parse(s ?? "[]"); return Array.isArray(a) ? a.filter(x => typeof x === "string") : []; } catch { return []; } };

// 封鎖（kind=block）：只有 block_date＝整天；有 start_time／end_time＝那天那段時間（4-ar，沿用同一張表，不用新欄位）
async function rulesOf(advisorIds: string[]) {
  if (!advisorIds.length) return new Map<string, { rules: WeeklyRule[]; blocks: Block[] }>();
  const rows = await db.select().from(advisorSlots).where(inArray(advisorSlots.advisor_id, advisorIds));
  const m = new Map<string, { rules: WeeklyRule[]; blocks: Block[] }>();
  for (const r of rows) {
    const e = m.get(r.advisor_id) ?? { rules: [], blocks: [] };
    if (r.kind === "weekly" && r.weekday !== null && r.start_time && r.end_time) e.rules.push({ weekday: r.weekday, start: r.start_time, end: r.end_time });
    if (r.kind === "block" && r.block_date) e.blocks.push({ date: r.block_date, start: r.start_time, end: r.end_time });
    m.set(r.advisor_id, e);
  }
  return m;
}

/** 已被約走的場次（起訖都要：衝突用實際長度＋緩衝算）。改期時排除客戶自己原本那場 */
async function takenOf(advisorIds: string[], excludeBookingId?: string) {
  const m = new Map<string, Taken[]>();
  if (!advisorIds.length) return m;
  const rows = await db.select({ id: bookings.id, advisor_id: bookings.advisor_id, starts_at: bookings.starts_at, ends_at: bookings.ends_at }).from(bookings)
    .where(and(inArray(bookings.advisor_id, advisorIds), eq(bookings.status, "booked"), gte(bookings.ends_at, new Date(Date.now() - BUFFER_MINUTES * 60_000).toISOString())));
  for (const r of rows) if (r.id !== excludeBookingId) m.set(r.advisor_id, [...(m.get(r.advisor_id) ?? []), { startsAt: r.starts_at, endsAt: r.ends_at }]);
  return m;
}

const modesOf = (a: { meeting_link: string | null; onsite_location: string | null }) =>
  [...(a.meeting_link ? ["online" as const] : []), ...(a.onsite_location ? ["onsite" as const] : [])];

/** 客戶端的顧問列表。順序每天輪替，不讓同一個人永遠排第一（N14：排序規則要公開、不得偏袒） */
export async function listAdvisorCards(now = Date.now()): Promise<AdvisorCard[]> {
  const rows = await db.select().from(advisors)
    .where(and(eq(advisors.is_active, 1), isNotNull(advisors.license_no), ne(advisors.license_no, ""), isNotNull(advisors.intro), ne(advisors.intro, "")))
    .orderBy(asc(advisors.created_at));
  const ok = rows.filter(a => modesOf(a).length > 0);
  const rules = await rulesOf(ok.map(a => a.id));
  const taken = await takenOf(ok.map(a => a.id));
  const cards = ok.flatMap(a => {
    const r = rules.get(a.id);
    if (!r?.rules.length) return [];
    const slots = availableSlots(r.rules, r.blocks, taken.get(a.id) ?? [], now, 7);
    return [{
      id: a.id, name: a.name, initial: a.name.slice(0, 1), specialties: parseSpecs(a.specialties), style: a.style, intro: a.intro!,
      licenseNo: a.license_no!, modes: modesOf(a), onsiteArea: a.onsite_location ? a.onsite_location.slice(0, 12) : null, slotsThisWeek: slots.length,
      responseLabel: a.response_label,
    }];
  });
  const day = Math.floor(now / 86_400_000);
  return cards.map((c, i) => ({ c, k: (i + day) % Math.max(1, cards.length) })).sort((a, b) => a.k - b.k).map(x => x.c);
}

export async function advisorCard(id: string, now = Date.now()): Promise<AdvisorCard | null> {
  return (await listAdvisorCards(now)).find(c => c.id === id) ?? null;
}

export async function advisorSlotsFor(id: string, now = Date.now(), excludeBookingId?: string): Promise<Slot[]> {
  const r = (await rulesOf([id])).get(id);
  if (!r) return [];
  return availableSlots(r.rules, r.blocks, (await takenOf([id], excludeBookingId)).get(id) ?? [], now);
}

const isUniqueViolation = (e: unknown) => String((e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code) === "23505";

/**
 * 寫入一筆預約，保證同一位顧問的場次不重疊（含前後 30 分鐘緩衝，4-ar）。
 * 開始時間不同也可能重疊（12:00 跟 13:00），唯一約束擋不到，所以同一位顧問的寫入用 advisory lock 排隊、鎖內再查一次。
 * excludeBookingId：改期時，客戶自己原本那場不算衝突（它稍後會被標成 rescheduled）。
 */
export async function insertBooking(values: typeof bookings.$inferInsert, excludeBookingId?: string) {
  const buf = BUFFER_MINUTES * 60_000;
  const from = new Date(Date.parse(values.starts_at) - buf).toISOString(), to = new Date(Date.parse(values.ends_at) + buf).toISOString();
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"booking:" + values.advisor_id}))`);
      const clash = await tx.select({ id: bookings.id }).from(bookings).where(and(eq(bookings.advisor_id, values.advisor_id), eq(bookings.status, "booked"),
        lt(bookings.starts_at, to), gt(bookings.ends_at, from), ...(excludeBookingId ? [ne(bookings.id, excludeBookingId)] : []))).limit(1);
      if (clash.length) throw new BookingError("這個時段剛剛被約走了，請換一個", "slot_taken");
      await tx.insert(bookings).values(values);
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new BookingError("這個時段剛剛被約走了，請換一個", "slot_taken");
    throw e;
  }
}

/** 客戶目前有效的預約（還沒到、狀態 booked）。W1a 一次只能有一筆，避免同時約好幾位顧問 */
export async function activeBooking(userId: string) {
  const [b] = await db.select({ b: bookings, advisorName: advisors.name }).from(bookings)
    .innerJoin(advisors, eq(advisors.id, bookings.advisor_id))
    .where(and(eq(bookings.user_id, userId), eq(bookings.status, "booked"), gte(bookings.ends_at, new Date().toISOString())))
    .orderBy(asc(bookings.starts_at)).limit(1);
  return b ? { ...b.b, advisorName: b.advisorName } : null;
}

export class BookingError extends Error { constructor(msg: string, public code: string) { super(msg); } }

export async function book(userId: string, input: { advisorId: string; startsAt: string; mode: "online" | "onsite" }, now = Date.now()) {
  const card = await advisorCard(input.advisorId, now);
  if (!card) throw new BookingError("這位顧問目前沒有開放預約", "advisor_unavailable");
  if (!card.modes.includes(input.mode)) throw new BookingError(input.mode === "online" ? "這位顧問沒有提供線上面談" : "這位顧問沒有提供面對面", "mode");
  if (await activeBooking(userId)) throw new BookingError("你已經有一個約好的面談了", "already_booked");
  const startsAt = new Date(input.startsAt).toISOString();
  const slot = (await advisorSlotsFor(input.advisorId, now)).find(s => s.startsAt === startsAt);
  if (!slot) throw new BookingError("這個時段剛剛被約走了，請換一個", "slot_taken");
  // 帶上最近的一段對話（4-y：前面講的一起帶給顧問）
  const [conv] = await db.select({ id: conversations.id }).from(conversations).where(eq(conversations.user_id, userId)).orderBy(desc(conversations.last_active_at)).limit(1);
  const id = crypto.randomUUID();
  // 兩人同時搶同一格或重疊的格：insertBooking 排隊後再檢查一次（B2、4-ar）
  await insertBooking({ id, user_id: userId, advisor_id: input.advisorId, conversation_id: conv?.id ?? null, starts_at: startsAt, ends_at: slot.endsAt, mode: input.mode });
  return id;
}

/** 預約明細（給確認頁、確認信）；只能看自己的 */
export async function bookingDetail(userId: string, id: string) {
  const d = await bookingDetailById(id);
  return d && d.client.id === userId ? d : null;
}

/** 不檢查身分的明細——只給伺服器端內部用（通知、提醒、顧問端已驗過權限的地方） */
export async function bookingDetailById(id: string) {
  const [r] = await db.select({ b: bookings, a: advisors, u: users }).from(bookings)
    .innerJoin(advisors, eq(advisors.id, bookings.advisor_id)).innerJoin(users, eq(users.id, bookings.user_id))
    .where(eq(bookings.id, id)).limit(1);
  if (!r) return null;
  return {
    id: r.b.id, startsAt: r.b.starts_at, endsAt: r.b.ends_at, mode: r.b.mode as "online" | "onsite", status: r.b.status, conversationId: r.b.conversation_id,
    rescheduleCount: r.b.reschedule_count, cancelReason: r.b.cancel_reason,
    advisor: { id: r.a.id, name: r.a.name, email: r.a.email, licenseNo: r.a.license_no, meetingLink: r.a.meeting_link, onsiteLocation: r.a.onsite_location, specialties: parseSpecs(r.a.specialties) },
    client: { id: r.u.id, name: r.u.name, email: r.u.email },
  };
}
export type BookingDetail = NonNullable<Awaited<ReturnType<typeof bookingDetailById>>>;

// ── 顧問端：我的顧問頁（B4、B8）────────────────────────────────────

export async function getProfile(advisorId: string) {
  const [a] = await db.select().from(advisors).where(eq(advisors.id, advisorId)).limit(1);
  if (!a) return null;
  const r = (await rulesOf([advisorId])).get(advisorId) ?? { rules: [], blocks: [] };
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  // 4-ar：改版前的設定（例如 09:00 開始）先裁進 12:00–22:00 給顧問看，按儲存就換成新規則
  const sorted = r.rules.sort((x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start));
  const clamped = clampRules(sorted);
  return {
    name: a.name, specialties: parseSpecs(a.specialties), style: a.style ?? STYLES[0], intro: a.intro ?? "",
    meetingLink: a.meeting_link ?? "", onsiteLocation: a.onsite_location ?? "", licenseNo: a.license_no ?? "",
    rules: clamped.rules, rulesAdjusted: clamped.adjusted,
    blocked: r.blocks.filter(b => !b.start && b.date >= today).map(b => b.date).sort(),
    blockRanges: r.blocks.filter(b => b.start && b.end && b.date >= today).map(b => ({ date: b.date, start: b.start!, end: b.end! }))
      .sort((x, y) => x.date.localeCompare(y.date) || x.start.localeCompare(y.start)),
    // W2 w2-05：回應速度（系統每天重算，唯讀）
    response: { label: a.response_label, medianMin: a.response_median_min, samples: a.response_samples ?? 0, on: a.response_on },
  };
}
export type AdvisorProfile = NonNullable<Awaited<ReturnType<typeof getProfile>>>;

export interface BlockRange { date: string; start: string; end: string }
export async function saveProfile(advisorId: string, p: { specialties: string[]; style: string; intro: string; meetingLink: string; onsiteLocation: string; rules: WeeklyRule[]; blocked: string[]; blockRanges?: BlockRange[] }) {
  if (p.specialties.length > 2 || p.specialties.some(s => !SPECS.includes(s))) throw new BookingError("專長最多選 2 個", "specs");
  if (!STYLES.includes(p.style)) throw new BookingError("請選一種諮詢風格", "style");
  if (p.intro.length > 40) throw new BookingError("自我介紹 40 字以內", "intro");
  if (p.meetingLink && !/^https:\/\/\S+$/.test(p.meetingLink)) throw new BookingError("線上面談連結要是 https:// 開頭的網址", "link");
  // 4-ar：每週時段要在 12:00–22:00 之間、至少 2 小時
  for (const r of p.rules) { const why = ruleProblem(r); if (why) throw new BookingError(why, "rules"); }
  if (p.blocked.some(d => !/^\d{4}-\d{2}-\d{2}$/.test(d))) throw new BookingError("封鎖日期格式不對", "blocked");
  for (const b of p.blockRanges ?? []) { const why = blockProblem(b); if (why) throw new BookingError(why, "blocked"); }
  await db.update(advisors).set({
    specialties: JSON.stringify(p.specialties), style: p.style, intro: p.intro.trim(),
    meeting_link: p.meetingLink.trim() || null, onsite_location: p.onsiteLocation.trim() || null,
  }).where(eq(advisors.id, advisorId));
  // 時段整組替換（已經約好的預約不受影響——它們存在 bookings，不依賴時段設定）
  await db.delete(advisorSlots).where(eq(advisorSlots.advisor_id, advisorId));
  const rows = [
    ...p.rules.map(r => ({ id: crypto.randomUUID(), advisor_id: advisorId, kind: "weekly", weekday: r.weekday, start_time: r.start, end_time: r.end })),
    ...[...new Set(p.blocked)].map(d => ({ id: crypto.randomUUID(), advisor_id: advisorId, kind: "block", block_date: d })),
    ...(p.blockRanges ?? []).map(b => ({ id: crypto.randomUUID(), advisor_id: advisorId, kind: "block", block_date: b.date, start_time: b.start, end_time: b.end })),
  ];
  if (rows.length) await db.insert(advisorSlots).values(rows);
}

