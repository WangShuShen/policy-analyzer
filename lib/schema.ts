import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigint, primaryKey, unique, index, uniqueIndex, customType } from "drizzle-orm/pg-core";

/*
 * 資料庫結構的唯一真實來源。改這裡 → `npm run db:generate` 產生 migration → `npm run db:migrate`。
 * 不准再在程式裡寫 CREATE TABLE IF NOT EXISTS 或 ensureColumn（設計準則 §1）。
 *
 * 時間欄位刻意存成文字，格式與舊 SQLite 的 datetime('now') 相同（UTC，"YYYY-MM-DD HH:MM:SS"），
 * 既有程式裡的字串比對與排序因此不用改。
 */
export const nowText = sql`to_char(now() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS')`;
const createdAt = () => text("created_at").notNull().default(nowText);
const updatedAt = () => text("updated_at").notNull().default(nowText);

export const companies = pgTable("companies", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  name: text("name").notNull().unique(),
  created_at: createdAt(),
});

export const products = pgTable("products", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  company_id: integer("company_id").notNull().references(() => companies.id),
  product_name: text("product_name").notNull(),
  plan_code: text("plan_code").notNull(),
  plan_type: text("plan_type"),
  year: text("year"),
  version: text("version"),
  category: text("category"),
  coverage_template: text("coverage_template").notNull(),
  file_path: text("file_path"),
  verified: integer("verified").notNull().default(0),
  formula_json: text("formula_json"),
  formula_verified: integer("formula_verified").notNull().default(0),
  // R2：銷售起訖（YYYY-MM-DD）。存摺對版本靠「生效日落在哪一版的銷售期間」（實作設計 P1）。
  // sale_end_date 為 NULL ＝ 仍在售。
  sale_start_date: text("sale_start_date"),
  sale_end_date: text("sale_end_date"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [unique("products_identity").on(t.company_id, t.plan_code, t.plan_type, t.year, t.version)]);

export const analyses = pgTable("analyses", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  product_id: integer("product_id").notNull().references(() => products.id),
  insured_amount: text("insured_amount").notNull(),
  analysis_json: text("analysis_json").notNull(),
  file_path: text("file_path"),
  created_at: createdAt(),
  // 發起分析的使用者（顧問為 advisors.id、客戶為 users.id），兩種身分共用故不設外鍵
  user_id: text("user_id"),
});

export const corrections = pgTable("corrections", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  product_id: integer("product_id").notNull().references(() => products.id),
  field_path: text("field_path").notNull(),
  old_value: text("old_value"),
  new_value: text("new_value").notNull(),
  note: text("note"),
  created_at: createdAt(),
});

export const advisors = pgTable("advisors", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  is_admin: integer("is_admin").notNull().default(0),
  is_active: integer("is_active").notNull().default(1),
  // 顧問頁（4-a／B4）：客戶選顧問時看到的內容
  specialties: text("specialties"),          // JSON 陣列，最多 2 個
  style: text("style"),
  intro: text("intro"),                      // 一句自我介紹，40 字內
  meeting_link: text("meeting_link"),        // 固定的線上面談連結（Meet／Zoom／LINE）
  onsite_location: text("onsite_location"),  // 面對面地點
  license_no: text("license_no"),            // 登錄字號（N2／N20），由管理者設定
  created_at: createdAt(),
  // 回應速度（W2 w2-05、4-aq）：系統每天重算，顧問不能自己填。label＝2 小時內回覆／當天回覆／2 天內回覆／null（新加入或超過 2 天不顯示）
  response_label: text("response_label"),
  response_median_min: integer("response_median_min"),
  response_samples: integer("response_samples"),
  response_on: text("response_on"),          // 哪一天（台灣日期）算的
});

export const policyAssignments = pgTable("policy_assignments", {
  id: text("id").primaryKey(),
  policy_uuid: text("policy_uuid").notNull(),
  // 刻意不設外鍵：刪除顧問帳號時保留他的審核歷史（舊 SQLite 未強制外鍵，行為一致）
  advisor_id: text("advisor_id").notNull(),
  assigned_date: text("assigned_date").notNull(),
  status: text("status").notNull().default("pending"),
  completed_at: text("completed_at"),
  created_at: createdAt(),
}, t => [unique("policy_assignments_policy_date").on(t.policy_uuid, t.assigned_date)]);

// 客戶帳號（訂閱制使用者）。與內部顧問白名單 advisors 刻意分離：
// advisors 是員工，users 是付費客戶，兩者權限與生命週期完全不同。
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  plan_expires_at: text("plan_expires_at"),
  quota_used: integer("quota_used").notNull().default(0),
  quota_reset_at: text("quota_reset_at"),
  is_active: integer("is_active").notNull().default(1),
  created_at: createdAt(),
  last_login_at: text("last_login_at"),
});

// 每月用量計數。period 為 YYYY-MM，換月自然產生新列，「每月重置」不需要排程歸零。
export const usageCounters = pgTable("usage_counters", {
  user_id: text("user_id").notNull(),
  period: text("period").notNull(),
  action: text("action").notNull(),
  count: integer("count").notNull().default(0),
  updated_at: updatedAt(),
}, t => [primaryKey({ columns: [t.user_id, t.period, t.action] })]);

// 訂閱狀態（一位使用者同時只會有一筆 active）
export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  plan: text("plan").notNull(),
  status: text("status").notNull().default("pending"),
  merchant_trade_no: text("merchant_trade_no").notNull().unique(),
  gwsr: text("gwsr"),
  current_period_end: text("current_period_end"),
  fail_count: integer("fail_count").notNull().default(0),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

// 每次扣款的原始紀錄。(merchant_trade_no, trade_no) 唯一，綠界重送 webhook 時據此做冪等。
export const payments = pgTable("payments", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  merchant_trade_no: text("merchant_trade_no").notNull(),
  trade_no: text("trade_no").notNull(),
  user_id: text("user_id"),
  plan: text("plan"),
  amount: integer("amount"),
  rtn_code: integer("rtn_code"),
  rtn_msg: text("rtn_msg"),
  raw: text("raw"),
  created_at: createdAt(),
}, t => [unique("payments_trade").on(t.merchant_trade_no, t.trade_no)]);

// 審核流程的唯一真實來源（取代本機 uuid_registry.json + analyzed/*.json）
export const policies = pgTable("policies", {
  uuid: text("uuid").primaryKey(),
  plan_code: text("plan_code").notNull(),
  company: text("company"),
  product_name: text("product_name"),
  pdf_drive_id: text("pdf_drive_id"),
  rate_drive_id: text("rate_drive_id"),
  filename: text("filename"),
  category: text("category"),
  status: text("status").notNull().default("uploaded"),
  analysis_json: text("analysis_json"),
  uploaded_at: text("uploaded_at"),
  archived_at: text("archived_at"),
  // 客戶存摺出現、但還沒分析的商品：排進 skill 批次分析佇列（優先處理，2026-10-12 顧問決定不在現場花 API）
  requested_at: text("requested_at"),
  request_count: integer("request_count").notNull().default(0),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

/* ══════════════════════════════════════════════════════════════════
 * W1：AI 諮詢服務（實作設計 D1）
 *
 * 個資規則（設計準則 §1、N4–N6）：
 *   ・特種個資欄位一律應用層加密，欄位名 _enc（lib/fieldCrypto.ts）
 *   ・每筆個資必有 expires_at，寫入時就要填（未成交準客戶＝最後互動後 1 年，D3）
 *   ・刪除用硬刪除：刪 conversation 時訊息、需求點、攔截紀錄一併刪（ON DELETE CASCADE）
 *   ・查客戶資料的函式一律強制帶 advisorId（應用層隔離，不用 RLS）
 * ══════════════════════════════════════════════════════════════════ */

// 同意紀錄（N4、4-z）：必要與行銷分開記，撤回填 withdrawn_at
export const consents = pgTable("consents", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  doc_version: text("doc_version").notNull(),       // 同意書版本，例如 "2026-10-08"
  scope: text("scope").notNull(),                   // required | marketing
  granted_at: text("granted_at").notNull().default(nowText),
  withdrawn_at: text("withdrawn_at"),
  created_at: createdAt(),
}, t => [index("consents_user").on(t.user_id)]);

// 一段諮詢對話（4-x、4-y）。衛教模式（沒同意）一個字都不記，所以不會有列。
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  branch: text("branch"),                           // health | finance
  sub_route: text("sub_route"),                     // ret | tax | edu（財務子路線）
  status: text("status").notNull().default("active"),  // active | paused | done
  flow_cursor: text("flow_cursor"),                 // 目前停在哪個欄位，接續時從這裡往下
  title: text("title"),                             // 對話紀錄清單顯示用（不含個資的摘要）
  last_active_at: text("last_active_at").notNull().default(nowText),
  expires_at: text("expires_at").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("conversations_user").on(t.user_id)]);

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  // 寫入順序。created_at 只到秒，同一秒內好幾則（AI 回一句＋腳本接著問）會排錯，要靠這個
  seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  conversation_id: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),                     // user | assistant | system
  content_enc: text("content_enc").notNull(),
  quick_replies: text("quick_replies"),             // JSON 陣列；系統產的選項，不含使用者輸入
  // 這則訊息用到的內容版本（問法／趨勢卡／案例）。舊對話不會因內容改版而變了意思（I3）
  content_version_id: text("content_version_id"),
  model: text("model"),
  tokens_in: integer("tokens_in"),
  tokens_out: integer("tokens_out"),
  cost_micro_usd: integer("cost_micro_usd"),        // 觀察期用量紀錄（I6）
  compliance_rewritten: integer("compliance_rewritten").notNull().default(0),
  created_at: createdAt(),
}, t => [index("messages_conversation").on(t.conversation_id, t.seq)]);

// 需求點（I1、I5）：同一段對話同一個欄位只有一筆，修改就覆寫
export const facts = pgTable("facts", {
  id: text("id").primaryKey(),
  conversation_id: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  key: text("key").notNull(),                       // 例：age、risk、food、loan
  value_enc: text("value_enc").notNull(),
  // 不含個資的粗略級距，給統計用（D2）。健康類一律不存（is_health=1 時必為 NULL）
  bucket: text("bucket"),
  is_health: integer("is_health").notNull().default(0),
  confidence: text("confidence").notNull(),         // clear | estimated | confirmed
  source_message_id: text("source_message_id").references(() => messages.id, { onDelete: "set null" }),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [
  unique("facts_conversation_key").on(t.conversation_id, t.key),
  index("facts_user").on(t.user_id),
]);

// 被合規檢查攔下的 AI 回覆（I4）：調規則用，也是稽核證據
export const complianceBlocks = pgTable("compliance_blocks", {
  id: text("id").primaryKey(),
  conversation_id: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  layer: text("layer").notNull(),                   // rule | ai
  reason: text("reason").notNull(),
  original_enc: text("original_enc").notNull(),     // AI 原句可能帶到使用者講過的事，所以加密
  replacement_enc: text("replacement_enc"),
  attempt: integer("attempt").notNull().default(1),
  created_at: createdAt(),
});

// 計算結果快照（4-ag、E1、E5）：AI 版與顧問版並存，差異說明由兩份快照的輸入自動比出
export const analysisSnapshots = pgTable("analysis_snapshots", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversation_id: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  source: text("source").notNull(),                 // ai | advisor
  advisor_id: text("advisor_id"),
  inputs_enc: text("inputs_enc").notNull(),         // 算這份時用的需求點
  results_enc: text("results_enc").notNull(),
  assumptions_version: text("assumptions_version").notNull(),  // 用哪一版假設參數（E4）
  expires_at: text("expires_at").notNull(),
  // created_at 只到秒，同一秒內的多份分不出先後；跟 messages 一樣用自增序號排
  seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  created_at: createdAt(),
}, t => [index("analysis_snapshots_user").on(t.user_id, t.created_at), index("analysis_snapshots_conv").on(t.conversation_id, t.seq)]);

// 對話內容（問法、醫療趨勢卡、案例）：由管理後台維護（I3、I7），W1a 先用種子
export const contentItems = pgTable("content_items", {
  id: text("id").primaryKey(),                      // 例：q.age、trend.t1、case.cancer
  kind: text("kind").notNull(),                     // question | trend | case
  branch: text("branch"),
  live_version_id: text("live_version_id"),
  created_at: createdAt(),
  updated_at: updatedAt(),
});

export const contentVersions = pgTable("content_versions", {
  id: text("id").primaryKey(),
  item_id: text("item_id").notNull().references(() => contentItems.id),
  body: text("body").notNull(),                     // JSON
  source: text("source"),                           // 出處（N17：統計要標出處與年份）
  source_year: text("source_year"),
  status: text("status").notNull().default("draft"),  // draft | pending | live | retired
  author_id: text("author_id"),
  reviewer_id: text("reviewer_id"),
  reviewed_at: text("reviewed_at"),
  created_at: createdAt(),
  // w1b-06：試算參數可預設生效日（E4，台灣日期 YYYY-MM-DD）；其他內容發布即生效
  effective_from: text("effective_from"),
  note: text("note"),                               // 這次改了什麼（給之後查版本的人看）
}, t => [index("content_versions_item").on(t.item_id)]);

// 上傳的保險存摺（4-w、P1、N19）。檔案本身放私有儲存，這裡只記位置與解析狀態
export const passbookUploads = pgTable("passbook_uploads", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  conversation_id: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  file_ref_enc: text("file_ref_enc").notNull(),
  mime: text("mime").notNull(),
  // queued → reading → confirming（等客戶確認清單）→ matching → done | failed
  status: text("status").notNull().default("queued"),
  error: text("error"),
  expires_at: text("expires_at").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("passbook_uploads_status").on(t.status)]);

// 從存摺讀出的每一張保單（P1–P4）
export const clientPolicies = pgTable("client_policies", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  upload_id: text("upload_id").references(() => passbookUploads.id, { onDelete: "set null" }),
  raw_enc: text("raw_enc").notNull(),               // 讀出的原始欄位（公司、商品名、保額、生效日…）
  product_id: integer("product_id").references(() => products.id),
  // matched（公式已審）| ai_read（AI 初步讀取、未審）| pending（待補）| removed（客戶說已解約）
  match_status: text("match_status").notNull(),
  confirmed_by_user: integer("confirmed_by_user").notNull().default(0),
  expires_at: text("expires_at").notNull(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("client_policies_user").on(t.user_id)]);

// 顧問可約時段（B2）：kind=weekly 每週固定時段；kind=block 封鎖某一天
export const advisorSlots = pgTable("advisor_slots", {
  id: text("id").primaryKey(),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                     // weekly | block
  weekday: integer("weekday"),                      // 0（日）～6（六），weekly 用
  start_time: text("start_time"),                   // HH:MM（台灣時間）
  end_time: text("end_time"),
  block_date: text("block_date"),                   // YYYY-MM-DD，block 用
  created_at: createdAt(),
}, t => [index("advisor_slots_advisor").on(t.advisor_id)]);

// 預約與面談結果（4-ah、B1）。「已解鎖」不另存：存在一筆 status=met 的預約即解鎖（D1）
export const bookings = pgTable("bookings", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  conversation_id: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
  starts_at: text("starts_at").notNull(),           // ISO 8601（UTC）
  ends_at: text("ends_at").notNull(),
  mode: text("mode").notNull(),                     // online | onsite
  // booked → met | no_show | rescheduled | cancelled_by_client | cancelled_by_advisor
  status: text("status").notNull().default("booked"),
  status_by: text("status_by"),
  status_at: text("status_at"),
  cancel_reason: text("cancel_reason"),
  rescheduled_to: text("rescheduled_to"),           // 改期後的新預約 id
  rescheduled_from: text("rescheduled_from"),       // 這筆是從哪一筆改期來的（W1b）
  reschedule_count: integer("reschedule_count").notNull().default(0),   // 累計第幾次改期；第 3 次起通知顧問（B5）
  reminded_24h_at: text("reminded_24h_at"),         // 面談前一天提醒寄出時間（B3；有值就不再寄）
  reminded_1h_at: text("reminded_1h_at"),           // 面談前 1 小時提醒
  passbook_reminded_at: text("passbook_reminded_at"),   // W2 w2-06：預約後 24 小時還沒傳存摺的提醒，寄過就記時間（防重複寄）
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [
  // 同一顧問同一時段只能有一筆有效預約，兩人同時搶同一格時由資料庫擋（B2）
  uniqueIndex("bookings_slot_active").on(t.advisor_id, t.starts_at).where(sql`${t.status} = 'booked'`),
  index("bookings_user").on(t.user_id),
]);

// 顧問改缺口分級（實作設計 G1）：只新增不覆蓋，每一筆都是一次改動；每格以最新一筆為準。
// 留著系統原判與理由，之後看得出哪條規則常被推翻，回頭修規則。
export const gapOverrides = pgTable("gap_overrides", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  gap_key: text("gap_key").notNull(),               // life | disability | card …（lib/calc/gaps.ts GapKey）
  level: text("level").notNull(),                   // must | boost | ok | later
  system_level: text("system_level").notNull(),     // 改的當下系統判的是什麼
  reason_enc: text("reason_enc").notNull(),         // 顧問寫的理由（可能含病史等個資，加密）
  expires_at: text("expires_at").notNull(),
  seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  created_at: createdAt(),
}, t => [index("gap_overrides_user").on(t.user_id, t.seq)]);

// 誰在何時讀了誰的個案資料（N12）。只記存取事實，不存個資內容
export const auditLogs = pgTable("audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  actor_id: text("actor_id").notNull(),
  actor_role: text("actor_role").notNull(),         // advisor | admin | system
  action: text("action").notNull(),                 // 例：view_conversation、view_analysis
  target_user_id: text("target_user_id"),
  target_type: text("target_type"),
  target_id: text("target_id"),
  created_at: createdAt(),
}, t => [index("audit_logs_target").on(t.target_user_id, t.created_at)]);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

// 顧問「保單分析 → 資料庫沒有這張」上傳的條款：不現場花 API，排進 skill 批次分析（2026-10-12 顧問決定）。
// 條款是公開文件、不是個資；分析完 pdf 清掉只留結果。同一份 PDF（sha256）分析過就直接沿用。
export const analysisRequests = pgTable("analysis_requests", {
  id: text("id").primaryKey(),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  filename: text("filename").notNull(),
  pdf: bytea("pdf"),                                // 分析完設成 null
  pdf_sha256: text("pdf_sha256").notNull(),
  held: text("held"),                               // 顧問填的保額／單位／計劃（JSON）
  status: text("status").notNull().default("queued"),   // queued | done | failed
  company: text("company"),
  product_name: text("product_name"),
  category: text("category"),
  result_json: text("result_json"),                 // 跟 policies.analysis_json 同格式
  note: text("note"),                               // 失敗原因等
  created_at: createdAt(),
  done_at: text("done_at"),
}, t => [index("analysis_requests_status").on(t.status, t.created_at), index("analysis_requests_sha").on(t.pdf_sha256)]);

// 站內通知（W1b）：顧問右上角的鈴鐺、客戶「我的頁面」。只放短標題與連結，不放需求點或保單內容（N8）
export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  recipient_type: text("recipient_type").notNull(),   // advisor | user
  recipient_id: text("recipient_id").notNull(),
  kind: text("kind").notNull(),                       // new_booking | rescheduled | reschedule_often | cancelled_by_client | cancelled_by_advisor | reminder | passbook_ready
  title: text("title").notNull(),
  body: text("body"),
  link: text("link"),
  booking_id: text("booking_id"),
  read_at: text("read_at"),
  seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),   // 同一秒內多則通知也排得出先後
  created_at: createdAt(),
}, t => [index("notifications_recipient").on(t.recipient_id, t.created_at)]);

// 寄信佇列（B3／T7）：先寫進來再寄，寄失敗由排程重試（最多 5 次，間隔拉長），寄不出去的看得到
export const emailOutbox = pgTable("email_outbox", {
  id: text("id").primaryKey(),
  to_addr: text("to_addr").notNull(),
  reply_to: text("reply_to"),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  ics: text("ics"),                                   // 日曆附件內容（有就附）
  ics_method: text("ics_method"),                     // PUBLISH | CANCEL
  kind: text("kind").notNull(),                       // 跟通知同一組 kind
  booking_id: text("booking_id"),
  status: text("status").notNull().default("queued"), // queued | sent | failed（重試用完）| skipped（測試網域 .invalid 不寄）
  attempts: integer("attempts").notNull().default(0),
  last_error: text("last_error"),
  next_try_at: text("next_try_at"),
  sent_at: text("sent_at"),
  created_at: createdAt(),
}, t => [index("email_outbox_status").on(t.status, t.next_try_at)]);

// 開發版回饋（卡 A 第 4 步）：只在開發版（RADIA_ENV=dev）收；上線版 API 一律 404、按鈕不出現
export const devFeedback = pgTable("dev_feedback", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),                     // broken 壞掉了｜not_wanted 不是我要的｜wording 文字要改｜idea 想法
  body: text("body").notNull(),
  page_url: text("page_url").notNull(),             // 送出時的網址（自動帶）
  role: text("role").notNull(),                     // customer｜advisor｜admin｜guest（自動帶）
  user_id: text("user_id"),
  user_name: text("user_name"),
  status: text("status").notNull().default("new"),  // new 新｜in_progress 處理中｜fixed 已修待複測｜closed 結案
  handler_note: text("handler_note"),               // 處理說明（修了什麼、在哪個版本）
  seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("dev_feedback_status").on(t.status, t.seq)]);

// 顧問申請（w1b-03、C4）：用 Google 申請 → 管理者核准才寫進 advisors。
// 待審／退件的人不在 advisors 表裡，所以不可能出現在客戶看得到的顧問名單。
// company 只給管理者看（4-aj：客戶端不顯示顧問所屬公司），核准時不帶進 advisors。
export const advisorApplications = pgTable("advisor_applications", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),                   // 來自 Google 登入，申請人不能自己改
  google_name: text("google_name"),
  name: text("name").notNull(),
  license_no: text("license_no").notNull(),         // 登錄字號（N2／N20），管理者核准前核對
  company: text("company").notNull(),               // 所屬公司／通路，只給管理者判斷（傳燈學院招募邊界）
  phone: text("phone").notNull(),
  intro: text("intro").notNull(),                   // 一句自我介紹，只給管理者看；客戶看到的自介由顧問核准後在「我的顧問頁」自己寫
  status: text("status").notNull().default("pending"),   // pending | approved | rejected
  reviewed_by: text("reviewed_by"),                 // 管理者的 advisors.id
  reviewed_at: text("reviewed_at"),
  review_note: text("review_note"),
  advisor_id: text("advisor_id"),                   // 核准後建立的 advisors.id
  created_at: createdAt(),
}, t => [
  index("advisor_applications_status").on(t.status, t.created_at),
  // 同一個 email 同時只能有一筆待審
  uniqueIndex("advisor_applications_one_pending").on(t.email).where(sql`status = 'pending'`),
]);

// 後台可改的設定值（w1b-05 起）：key → JSON。改動寫 audit_logs（action: update_setting）
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),                   // JSON
  updated_by: text("updated_by"),
  updated_at: updatedAt(),
});

// AI 用量警報（I6 觀察期兩道防線、w1b-05）：同一個期間同一個人只通知一次
export const usageAlerts = pgTable("usage_alerts", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),                     // monthly_budget | user_daily
  period: text("period").notNull(),                 // 台灣時間：月 YYYY-MM／日 YYYY-MM-DD
  user_id: text("user_id").notNull().default(""),   // 月預算是全站的，留空字串（讓唯一索引擋得住重複）
  amount_micro_usd: bigint("amount_micro_usd", { mode: "number" }).notNull(),
  threshold_micro_usd: bigint("threshold_micro_usd", { mode: "number" }).notNull(),
  created_at: createdAt(),
}, t => [uniqueIndex("usage_alerts_once").on(t.kind, t.period, t.user_id)]);

// 誰在線（w1b-04）：登入後的頁面每 60 秒送一次心跳；5 分鐘內有心跳＝在線。一人一列，覆寫
export const presence = pgTable("presence", {
  actor_id: text("actor_id").primaryKey(),          // advisors.id 或 users.id（兩邊都是 UUID／前綴，不會撞）
  role: text("role").notNull(),                     // advisor | customer
  is_admin: integer("is_admin").notNull().default(0),
  name: text("name"),
  path: text("path"),                               // 最後在哪一頁（只記路徑，不記查詢參數）
  last_seen: text("last_seen").notNull(),           // ISO 8601（UTC）
  first_seen: text("first_seen").notNull(),         // 這一段連續在線從何時開始（中斷超過 5 分鐘重算）
}, t => [index("presence_last_seen").on(t.last_seen)]);

// 登入紀錄（w1b-04）：每次登入成功寫一筆（Google 回呼、測試登入由卡 A 呼叫 recordLogin）
export const loginEvents = pgTable("login_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedByDefaultAsIdentity(),
  actor_id: text("actor_id").notNull(),
  role: text("role").notNull(),                     // advisor | customer
  email: text("email"),
  method: text("method").notNull(),                 // google | dev
  ip: text("ip"),
  user_agent: text("user_agent"),
  created_at: createdAt(),
}, t => [index("login_events_actor").on(t.actor_id, t.created_at), index("login_events_created").on(t.created_at)]);

// ── W3 保險快訊（卡 E）。跟 w1b-06 的 content_items／content_versions（AI 內容）是兩回事，不混用 ──
// 一篇文章一列：上面是「編輯中的稿」，pub_* 是「審核通過、公開的那一版」。
// 已發布的文章再修改，公開頁照樣顯示舊的 pub_*，直到新稿審核通過才換（N3：公開的內容一定審過）。
export const newsArticles = pgTable("news_articles", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull().unique(),            // 網址 /news/<slug>；發布過就不能改（Google 已經收錄）
  title: text("title").notNull(),
  summary: text("summary").notNull(),               // 列表、搜尋結果、分享預覽用
  body: text("body").notNull(),                     // Markdown（只支援小標、粗體、清單、表格、提示框、連結）
  category: text("category").notNull(),
  cover: text("cover").notNull().default("i-doc"),  // 封面圖示（RadiaIcons 的 id）
  sources: text("sources"),                         // 資料來源（N17：出處＋年份）
  status: text("status").notNull().default("draft"),  // 編輯稿的狀態：draft | pending | approved
  author_id: text("author_id"),
  visible: integer("visible").notNull().default(0),   // 1＝公開頁看得到（顯示 pub_*）；下架＝0
  pub_title: text("pub_title"),
  pub_summary: text("pub_summary"),
  pub_body: text("pub_body"),
  pub_category: text("pub_category"),
  pub_cover: text("pub_cover"),
  pub_sources: text("pub_sources"),
  published_at: text("published_at"),               // 第一次公開的時間（文章日期）
  pub_updated_at: text("pub_updated_at"),           // 最近一次審核通過換上新版的時間
  reviewed_by: text("reviewed_by"),                 // 最近一次審核通過的人（advisors.id）
  reviewed_at: text("reviewed_at"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("news_articles_public").on(t.visible, t.published_at)]);

// 審核紀錄（N3：誰送審、誰審、結果、意見、時間）。只加不改
export const newsReviews = pgTable("news_reviews", {
  id: text("id").primaryKey(),
  article_id: text("article_id").notNull().references(() => newsArticles.id, { onDelete: "cascade" }),
  actor_id: text("actor_id").notNull(),             // advisors.id
  action: text("action").notNull(),                 // create | edit | submit | withdraw | approve | reject | unpublish
  note: text("note"),                               // 退回意見、下架原因
  snapshot: text("snapshot"),                       // 送審／通過時的內容（JSON），之後查得到當時審的是哪一版
  created_at: createdAt(),
}, t => [index("news_reviews_article").on(t.article_id, t.created_at)]);

// ── 我的資料：當事人權利申請（4-ap、N5、N21，卡 E）。簡單版：客戶送出 → 管理者人工處理、留紀錄；自動刪除留到 W7 ──
// user_id 不設外鍵：之後真的刪除帳號，這筆申請紀錄要留著（證明有依請求處理）
export const dataRequests = pgTable("data_requests", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  email: text("email").notNull(),                   // 送出當下的信箱（回覆用；帳號刪除後還找得到人）
  kind: text("kind").notNull(),                     // access 查詢／閱覽／複製本 | correct 補充／更正 | delete 刪除／停止利用／撤回同意
  message: text("message").notNull(),               // 客戶的一句說明
  status: text("status").notNull().default("received"),  // received | processing | done
  due_date: text("due_date").notNull(),             // 回覆期限（台灣日期 YYYY-MM-DD）：同意書承諾 15 日內（個資法第 13 條：查詢 15 日、更正刪除 30 日）
  handled_by: text("handled_by"),                   // advisors.id
  handled_note: text("handled_note"),               // 處理說明（客戶看得到）
  handled_at: text("handled_at"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("data_requests_user").on(t.user_id, t.created_at), index("data_requests_status").on(t.status, t.created_at)]);

// ── W2 顧問的客戶管理（卡 D；4-e B 級：進線追蹤＋面談與提案紀錄，不做保全／續期／理賠／轉介紹／業績報表）──
// 顧問跟客戶的關係，一位顧問對一位客戶一列。平台預約時自動建立（w2-01）；手動建的客戶 source=manual
export const advisorClients = pgTable("advisor_clients", {
  id: text("id").primaryKey(),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  source: text("source").notNull().default("platform"),   // platform 平台進線 | manual 自己開發
  outcome: text("outcome").notNull().default("open"),      // open 進行中 | won 成交 | lost 沒成
  outcome_note: text("outcome_note"),                      // 成交了什麼／沒成的原因
  follow_up_on: text("follow_up_on"),                      // 下次追蹤日（台灣日期 YYYY-MM-DD）
  follow_up_note: text("follow_up_note"),                  // 追蹤要做什麼
  phone: text("phone"),                                    // 手動客戶的聯絡方式（平台客戶用帳號信箱）
  note: text("note"),
  consent_by: text("consent_by"),                          // 手動客戶：顧問勾「已取得客戶同意」的人與時間（N4、N21）
  consent_at: text("consent_at"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [uniqueIndex("advisor_clients_pair").on(t.advisor_id, t.user_id), index("advisor_clients_follow").on(t.advisor_id, t.follow_up_on)]);

// 互動紀錄（w2-02）：面談、提案、電話、備註。只加；刪除是軟刪除，留稽核
export const clientInteractions = pgTable("client_interactions", {
  id: text("id").primaryKey(),
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                     // meeting | proposal | call | note
  happened_on: text("happened_on").notNull(),       // 台灣日期
  summary: text("summary").notNull(),
  deleted_at: text("deleted_at"),
  created_at: createdAt(),
}, t => [index("client_interactions_pair").on(t.advisor_id, t.user_id, t.happened_on)]);

// 首頁待辦的延後與關掉（w2-03）。key 是待辦的身分（例：followup:<userId>:<日期>），同一件事換日期就是新的待辦
export const todoStates = pgTable("todo_states", {
  advisor_id: text("advisor_id").notNull().references(() => advisors.id),
  key: text("key").notNull(),
  snoozed_until: text("snoozed_until"),             // UTC 文字；到了就重新出現
  dismissed_at: text("dismissed_at"),
  dismiss_reason: text("dismiss_reason"),           // 關掉的原因（之後給產能儀表板）
  updated_at: updatedAt(),
}, t => [primaryKey({ columns: [t.advisor_id, t.key] })]);

// 客戶端頁面的開啟追蹤（w2-04，通用：我的分析現在用，W4 規劃書接上）。一次打開一列，離開時補上停留時間與看到的段落
export const viewEvents = pgTable("view_events", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  page: text("page").notNull(),                     // analysis | plan（W4）…
  ref_id: text("ref_id"),                           // 哪一份（對話 id、規劃書 id）
  sections: text("sections"),                       // JSON：看到的段落 [{ key, ms }]
  duration_ms: integer("duration_ms"),
  created_at: createdAt(),
  updated_at: updatedAt(),
}, t => [index("view_events_user").on(t.user_id, t.page, t.created_at)]);
