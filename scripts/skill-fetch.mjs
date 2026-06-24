// node scripts/skill-fetch.mjs [N]
// Agent Skill 批次分析步驟 1：取 N 筆 pending 保單，用服務帳號下載條款 PDF 到 tmp/skill-pdfs/，
// 並印出 manifest（uuid / planCode / 商品名 / 本機 PDF 路徑）供 Claude Code 逐筆讀取分析。
import { createClient } from "@libsql/client";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const line of readFileSync(join(ROOT, ".env"), "utf8").split("\n")) {
  const m = line.match(/^(\w+)="?([^"]*?)"?$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
// Turso 憑證（/tmp 或 env）
const url = process.env.TURSO_DATABASE_URL || readFileSync("/tmp/turso_url.txt", "utf8").trim();
const token = process.env.TURSO_AUTH_TOKEN || readFileSync("/tmp/turso_token.txt", "utf8").trim();
const db = createClient({ url, authToken: token });

// 服務帳號（下載私有 Drive PDF）
const sa = JSON.parse(readFileSync(join(ROOT, "..", "000_Agent/service_account.json"), "utf8"));
function b64url(b) { return Buffer.from(b).toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function token2() {
  const now = Math.floor(Date.now()/1000);
  const jwt = `${b64url(JSON.stringify({alg:"RS256",typ:"JWT"}))}.${b64url(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/drive.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}))}`;
  const sig = b64url(crypto.createSign("RSA-SHA256").update(jwt).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:`${jwt}.${sig}`})});
  return (await r.json()).access_token;
}
async function download(fileId, at) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers:{ Authorization:`Bearer ${at}` } });
  if (!r.ok) return null;
  return Buffer.from(await r.arrayBuffer());
}

const N = Number(process.argv[2]) || 5;
const outDir = join(ROOT, "tmp", "skill-pdfs");
mkdirSync(outDir, { recursive: true });

// 條款 Drive ID 以 drive_index.clauseId 為準（policies.pdf_drive_id 有舊失效值），找不到才退回 pdf_drive_id
let driveIndex = {};
try { driveIndex = JSON.parse(readFileSync(join(ROOT, "data", "drive_index.json"), "utf8")); } catch {}

const rows = await db.execute({
  sql: `SELECT uuid, plan_code, company, product_name, pdf_drive_id FROM policies
        WHERE status='pending_analysis' AND pdf_drive_id IS NOT NULL AND pdf_drive_id!=''
        ORDER BY created_at ASC LIMIT ?`,
  args: [N],
});
const at = await token2();
const manifest = [];
for (const r of rows.rows) {
  const driveId = driveIndex[r.plan_code]?.clauseId || r.pdf_drive_id;
  const pdf = await download(driveId, at);
  if (!pdf || pdf.subarray(0,4).toString("latin1") !== "%PDF") { console.log("✗ 下載失敗", r.plan_code); continue; }
  const path = join(outDir, `${r.plan_code}.pdf`);
  writeFileSync(path, pdf);
  manifest.push({ uuid: r.uuid, planCode: r.plan_code, company: r.company, productName: r.product_name, pdfPath: path });
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`已下載 ${manifest.length} 筆條款 PDF → ${outDir}`);
console.log("manifest:", join(outDir, "manifest.json"));
manifest.forEach(m => console.log(`  ${m.planCode} | ${m.productName} | ${m.pdfPath}`));
process.exit(0);
