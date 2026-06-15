import fs from "fs";
import path from "path";

interface DriveEntry {
  company: string;
  productName: string;
  planCode: string;
  contractType?: string;
  productType?: string;
  status?: string;
  saleDate?: string;
  stopDate?: string;
  docTypes?: string[];
}

export interface DriveProduct {
  id: string;
  company: string;
  product_name: string;
  plan_code: string;
  plan_type: string | null;
  year: string | null;
  category: string | null;
  verified: number;
  coverage_template: string;
  latest_analysis: null;
}

let _cache: DriveProduct[] | null = null;

function load(): DriveProduct[] {
  if (_cache) return _cache;
  const filePath = path.join(process.cwd(), "data", "drive_registry.json");
  const registry = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, DriveEntry>;
  _cache = Object.values(registry).map(e => ({
    id: e.planCode,
    company: e.company,
    product_name: e.productName,
    plan_code: e.planCode,
    plan_type: e.contractType ?? null,
    year: e.saleDate ? e.saleDate.slice(0, 4) : null,
    category: e.productType ?? null,
    verified: 0,
    coverage_template: JSON.stringify({
      _source: "drive_registry",
      _active: e.status !== "停售",
      _status: e.status ?? "",
      _saleDate: e.saleDate ?? "",
      _stopDate: e.stopDate ?? "",
    }),
    latest_analysis: null,
  }));
  return _cache;
}

export function searchDriveProducts(params: {
  company?: string;
  keyword?: string;
  category?: string;
  activeOnly?: boolean;
  limit?: number;
}): DriveProduct[] {
  const { company, keyword, category, activeOnly, limit = 500 } = params;
  let results = load();
  if (company) results = results.filter(p => p.company === company);
  if (keyword) {
    const kw = keyword.toLowerCase();
    results = results.filter(p =>
      p.product_name.toLowerCase().includes(kw) ||
      p.plan_code.toLowerCase().includes(kw)
    );
  }
  if (category) results = results.filter(p => p.category === category);
  if (activeOnly) results = results.filter(p => {
    try { return (JSON.parse(p.coverage_template) as { _active: boolean })._active === true; } catch { return false; }
  });
  return results.slice(0, limit);
}

export function getDriveCompanies(): string[] {
  return [...new Set(load().map(p => p.company))].sort();
}

export function getDriveCategories(): string[] {
  return [...new Set(load().map(p => p.category).filter((c): c is string => !!c))].sort();
}
