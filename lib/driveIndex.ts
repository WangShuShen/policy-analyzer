import fs from "fs";
import path from "path";

interface DriveIndexEntry {
  clauseId?: string;   // 條款 PDF
  rateId?: string;     // 費率 PDF
  specId?: string;     // 說明 PDF（商品說明書）
  productFolder?: string;
}

export interface DocIds {
  clauseId: string | null;   // 條款
  rateId: string | null;     // 費率
  specId: string | null;     // 說明
}

let _cache: Record<string, DriveIndexEntry> | null = null;

function load(): Record<string, DriveIndexEntry> {
  if (_cache) return _cache;
  try {
    const filePath = path.join(process.cwd(), "data", "drive_index.json");
    _cache = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, DriveIndexEntry>;
  } catch {
    _cache = {};
  }
  return _cache;
}

// 依 planCode 取三種文件的 Drive file ID（無則 null）
export function getDocIds(planCode: string): DocIds {
  const e = load()[planCode];
  return {
    clauseId: e?.clauseId ?? null,
    rateId: e?.rateId ?? null,
    specId: e?.specId ?? null,
  };
}
