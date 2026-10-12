import fs from "fs";
import path from "path";
import { catalog as registry, normName } from "@/lib/passbook/catalog";

/*
 * 商品查詢（原型 SCREENS.advcatalog）：
 *   我們家＝三商美邦（data/tii_sanshang_products.json，保發中心清單；條款還在爬，W1b）
 *   別家＝資料庫其他公司（data/drive_registry.json）——別家商品只能查，不能提案（用途是看懂客戶手上那張）
 */
export interface CatalogRow { planCode: string; company: string; name: string; category: string | null; period: string; onSale: boolean; mine: boolean }

const roc = (s?: string | null) => {
  if (!s) return null;
  const m = s.match(/^(\d{2,3})\/(\d{2})\/(\d{2})$/);
  return m ? `${Number(m[1]) + 1911}-${m[2]}-${m[3]}` : s;
};
const ym = (d: string) => d.slice(0, 7).replace("-", "/");
const period = (a: string | null, b: string | null) => a ? `${ym(a)} ～ ${b ? ym(b) : "現售"}` : b ? `～ ${ym(b)} 停售` : "現售中";
const shortCo = (c: string) => c.replace(/保險股份有限公司|保險事業股份有限公司|股份有限公司/, "");

let _mine: CatalogRow[] | null = null;
function mine(): CatalogRow[] {
  if (_mine) return _mine;
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "tii_sanshang_products.json"), "utf8")) as
    { company: string; productName: string; planCode: string; category?: string; saleDate?: string; stopDate?: string; active?: boolean }[];
  _mine = raw.map(p => ({ planCode: p.planCode, company: shortCo(p.company), name: p.productName, category: p.category ?? null,
    period: period(roc(p.saleDate), roc(p.stopDate)), onSale: p.active ?? !p.stopDate, mine: true }));
  return _mine;
}
let _other: CatalogRow[] | null = null;
function other(): CatalogRow[] {
  if (_other) return _other;
  _other = registry().map(p => ({ planCode: p.planCode, company: shortCo(p.company), name: p.productName, category: p.productType ?? p.category,
    period: period(p.saleDate, p.stopDate), onSale: !p.stopDate, mine: false }));
  return _other;
}

export const catalogCounts = () => ({ mine: mine().length, other: other().length });

export function searchCatalog(q: string, tab: "mine" | "other", limit = 60): { rows: CatalogRow[]; total: number } {
  const list = tab === "mine" ? mine() : other();
  const terms = q.normalize("NFKC").trim().split(/\s+/).filter(Boolean).map(t => normName(t));
  const hit = terms.length === 0 ? list : list.filter(r => {
    const hay = normName(`${r.company}${r.name}`) + r.planCode;
    return terms.every(t => hay.includes(t) || r.planCode.toUpperCase().includes(t.toUpperCase()));
  });
  const sorted = [...hit].sort((a, b) => Number(b.onSale) - Number(a.onSale) || a.name.length - b.name.length);
  return { rows: sorted.slice(0, limit), total: hit.length };
}
