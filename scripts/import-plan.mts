/*
 * 把 advisor-plan skill 產的 plan.json 匯進平台（W4 地基 B3a：顧問從本機 skill 過渡到平台用）。
 *
 *   npx tsx scripts/import-plan.mts --file <plan.json> --advisor <顧問信箱> --client <客戶信箱> [--status draft|ready] [--plan <規劃書 id>] [--yes]
 *
 * - 沒有 --plan：替這位客戶建一份新的規劃書（第 1 版）
 * - 有 --plan：存成那份規劃書的新一版（只能是這位顧問自己的）
 * - 客戶要是這位顧問的客戶（預約過、或手動建的），否則擋下
 * - plan.json 先跑跟平台一樣的檢查，不通過就列出哪一欄錯、不寫入
 * - 不加 --yes 只檢查、印出會寫進哪個資料庫，不寫入
 * 連線字串、加密金鑰取環境變數 → .env.local → .env（同 scripts/lib/pg.mjs）。
 * ⚠️ 開發版只匯 examples/sample-plan.json 這類範例資料，不放真實客戶的 plan.json
 */
import { readFileSync } from "fs";
import "./lib/pg.mjs";   // 讀 .env.local（只設環境變數，不連線）

const args = process.argv.slice(2);
const opt = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = opt("file"), advisorEmail = opt("advisor")?.toLowerCase().trim(), clientEmail = opt("client")?.toLowerCase().trim();
const status = (opt("status") ?? "draft") as "draft" | "ready", planId = opt("plan"), write = args.includes("--yes");
if (!file || !advisorEmail || !clientEmail || !["draft", "ready"].includes(status)) {
  console.error("用法: npx tsx scripts/import-plan.mts --file <plan.json> --advisor <顧問信箱> --client <客戶信箱> [--status draft|ready] [--plan <id>] [--yes]");
  process.exit(1);
}

const { validatePlan } = await import("../lib/advisorPlan/validate");
let plan: unknown;
try { plan = JSON.parse(readFileSync(file, "utf8")); } catch (e) { console.error(`❌ 讀不到或不是合法 JSON：${(e as Error).message}`); process.exit(1); }
const check = validatePlan(plan);
for (const w of check.warnings) console.log(`⚠️  ${w}`);
if (!check.ok) { for (const e of check.errors) console.error(`❌ ${e}`); console.error(`共 ${check.errors.length} 個錯誤，沒有寫入`); process.exit(1); }

const host = (() => { try { return new URL(process.env.DATABASE_URL ?? "").hostname; } catch { return "（沒有 DATABASE_URL）"; } })();
const { default: db } = await import("../lib/db");
const { advisors, users } = await import("../lib/schema");
const { eq } = await import("drizzle-orm");
const [adv] = await db.select({ id: advisors.id, name: advisors.name }).from(advisors).where(eq(advisors.email, advisorEmail));
const [cli] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.email, clientEmail));
if (!adv) { console.error(`❌ 找不到顧問 ${advisorEmail}`); process.exit(1); }
if (!cli) { console.error(`❌ 找不到客戶 ${clientEmail}`); process.exit(1); }

console.log(`資料庫：${host}\n顧問：${adv.name}（${adv.id}）\n客戶：${cli.name}（${cli.id}）\n${planId ? `更新規劃書 ${planId}` : `新建規劃書，狀態 ${status}`}`);
if (!write) { console.log("\n檢查通過。確認無誤後加 --yes 才會寫入。"); process.exit(0); }

const { createPlan, updatePlan, PlanError } = await import("../lib/advisorPlan/store");
try {
  if (planId) {
    const { advisorPlans } = await import("../lib/schema");
    const [p] = await db.select({ u: advisorPlans.user_id }).from(advisorPlans).where(eq(advisorPlans.id, planId));
    if (p && p.u !== cli.id) { console.error("❌ 這份規劃書不是這位客戶的"); process.exit(1); }
    const r = await updatePlan(adv.id, planId, plan, { savedBy: `import:${adv.id}` });
    console.log(`✅ 已存成第 ${r.version} 版：${r.id}`);
  } else {
    const r = await createPlan(adv.id, cli.id, plan, { status, savedBy: `import:${adv.id}` });
    console.log(`✅ 已建立：${r.id}（第 1 版）`);
  }
} catch (e) {
  if (e instanceof PlanError) { console.error(`❌ ${e.message}`); for (const d of e.details) console.error(`   ${d}`); process.exit(1); }
  throw e;
}
process.exit(0);
