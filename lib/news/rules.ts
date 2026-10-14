import { checkCompliance } from "@/lib/consult/compliance";
import { plainText } from "./markdown";

// 快訊的欄位規則與送審檢查（W3）。不碰資料庫，後台畫面也用同一份即時檢查
export { CATEGORIES, COVERS, LIMITS } from "./constants";
import { CATEGORIES, COVERS, LIMITS } from "./constants";

export interface ArticleInput { slug: string; title: string; summary: string; body: string; category: string; cover?: string; sources?: string | null }
export interface Check { errors: string[]; warnings: string[] }

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED = new Set(["preview"]);   // /news/preview/<id> 是後台預覽
// 4-aj：客戶端一律不能出現公司名；N13：不提同業
const BANNED = /三商美邦|三商人壽|三商/;
// N17：內文出現統計數字（百分比、幾萬人、幾成）就一定要有資料來源
const HAS_STAT = /\d[\d,，.]*\s*(%|％|萬人|人次|成的|倍)|每\s*\d+\s*(人|個)/;

export function validate(a: ArticleInput): Check {
  const errors: string[] = [], warnings: string[] = [];
  if (!SLUG.test(a.slug) || a.slug.length < 3 || a.slug.length > 80) errors.push("網址代稱只能用小寫英文、數字和 -，3～80 字（例：insurance-passbook-how-to）");
  else if (RESERVED.has(a.slug)) errors.push("網址代稱不能用 preview");
  if (!a.title?.trim() || a.title.length > LIMITS.title) errors.push(`標題不能空白，${LIMITS.title} 字以內`);
  if (!a.summary?.trim() || a.summary.length > LIMITS.summary) errors.push(`摘要不能空白，${LIMITS.summary} 字以內`);
  else if (a.summary.length < 30) warnings.push("摘要少於 30 字，Google 搜尋結果可能會自己抓內文");
  if (!a.body?.trim() || a.body.length > LIMITS.body) errors.push(`內文不能空白，${LIMITS.body} 字以內`);
  if (!CATEGORIES.includes(a.category as never)) errors.push("分類不在清單裡");
  if (a.cover && !COVERS.includes(a.cover as never)) errors.push("封面圖示不在清單裡");
  if ((a.sources ?? "").length > LIMITS.sources) errors.push(`資料來源 ${LIMITS.sources} 字以內`);
  const all = `${a.title}\n${a.summary}\n${plainText(a.body ?? "")}`;
  if (BANNED.test(all)) errors.push("不能出現「三商美邦人壽」或顧問所屬公司（4-aj）");
  if (HAS_STAT.test(all) && !/\d{3,4}/.test(a.sources ?? "")) errors.push("內文有統計數字，資料來源要寫出處和年份（N17）");
  for (const s of all.split(/[。！？\n]/)) {
    const r = checkCompliance(s);
    if (!r.ok && r.reason === "提到公司名") { errors.push(`提到保險公司名稱：「${s.trim().slice(0, 30)}」（N13）`); continue; }
    if (!r.ok && r.reason !== "思考外洩") warnings.push(`合規規則會判「${r.reason}」：「${s.trim().slice(0, 30)}」——請確認`);
  }
  return { errors, warnings: [...new Set(warnings)] };
}

