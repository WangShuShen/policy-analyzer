#!/usr/bin/env node
/*
 * 一次性清除（4-ay，顧問 2026-10-16）：刪掉 4-ay 之前存下的「被保險人是別人（子女、配偶）」的保單。
 * 那是第三人的個資，客戶沒有替他同意；新上傳的存摺讀完就丟掉，這支只清舊資料。
 *
 *   node --env-file=.env.local --import tsx scripts/purge-other-insured.mjs           # 只列筆數（預設，不改任何東西）
 *   node --env-file=.env.local --import tsx scripts/purge-other-insured.mjs --apply   # 真的刪（主管同意後才跑）
 *
 * 只能在開發環境跑（RADIA_ENV=dev，上線版永遠不設）；上線版要清，另外由主管決定怎麼做。
 * 判斷：解密 raw_enc，read.insured_is_owner === false 而且顧問沒有確認過是本人。
 */
import * as dbm from "../lib/db.ts";
import * as schema from "../lib/schema.ts";
import * as crypto from "../lib/fieldCrypto.ts";
import { eq } from "drizzle-orm";

if (process.env.RADIA_ENV !== "dev") { console.error("只能在開發環境跑（RADIA_ENV=dev）"); process.exit(2); }
const db = dbm.default?.default ?? dbm.default;
const { clientPolicies } = schema.default ?? schema;
const { decryptJson } = crypto.default ?? crypto;
const APPLY = process.argv.includes("--apply");

const rows = await db.select({ id: clientPolicies.id, user_id: clientPolicies.user_id, raw_enc: clientPolicies.raw_enc }).from(clientPolicies);
const hit = [];
for (const r of rows) {
  try {
    const sp = decryptJson(r.raw_enc);
    if (sp?.read?.insured_is_owner === false && !sp.insured) hit.push(r);
  } catch { /* 解不開的不動 */ }
}
const users = new Set(hit.map(r => r.user_id));
console.log(`client_policies 共 ${rows.length} 筆；被保險人是別人的 ${hit.length} 筆（${users.size} 位客戶）`);
if (!APPLY) { console.log("（只列筆數，沒有刪。主管同意後加 --apply 再跑）"); process.exit(0); }
for (const r of hit) await db.delete(clientPolicies).where(eq(clientPolicies.id, r.id));
console.log(`已刪除 ${hit.length} 筆`);
process.exit(0);
