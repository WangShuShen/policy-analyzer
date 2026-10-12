// node scripts/skill-fetch.mjs [N]
// Agent Skill 批次分析步驟 1：取 N 筆待分析條款，下載到 tmp/skill-pdfs/，
// 並印出 manifest（uuid / planCode / 商品名 / 本機 PDF 路徑）供 Claude Code 逐筆讀取分析。
// 取件順序（2026-10-12）：①顧問「資料庫沒有這張」送來的（analysis_requests，uuid 寫成 req:<id>）
//   ②客戶存摺要用的 ③現售 ④其餘
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import crypto from "crypto";
import { connect, ROOT } from "./lib/pg.mjs";

const db = await connect();

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

// ① 顧問送來的：PDF 直接存在資料庫
const reqs = await db.query(
  `SELECT id, filename, pdf FROM analysis_requests WHERE status='queued' AND pdf IS NOT NULL ORDER BY created_at ASC LIMIT $1`, [N]);
const manifest = [];
for (const r of reqs.rows) {
  const path = join(outDir, `req-${r.id}.pdf`);
  writeFileSync(path, r.pdf);
  manifest.push({ uuid: `req:${r.id}`, kind: "request", planCode: null, company: null, productName: r.filename.replace(/\.pdf$/i, ""), pdfPath: path });
}

const rows = await db.query(
  `SELECT uuid, plan_code, company, product_name, pdf_drive_id FROM policies
   WHERE status='pending_analysis' AND pdf_drive_id IS NOT NULL AND pdf_drive_id!=''
   -- 順序：①客戶存摺要用的（被要越多次越前面）②現售商品 ③其餘照建立順序（2026-10-12）
   ORDER BY (requested_at IS NULL), request_count DESC, requested_at ASC,
            NOT EXISTS (SELECT 1 FROM products pr WHERE pr.plan_code = policies.plan_code AND pr.sale_end_date IS NULL),
            created_at ASC
   LIMIT $1`,
  [Math.max(0, N - manifest.length)],
);
const at = rows.rows.length ? await token2() : null;
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
await db.end();
