import type { GapKey } from "@/lib/calc/gaps";

/*
 * 真實案例素材庫（A3b，顧問 10/14 定案：先查官方出處，查不到不放）。
 * 客戶端「該補什麼」每一格底下「為什麼要補？看數據」用。
 *
 * N17 三條：每個數字都要有出處＋資料年份；個案不代表機率；不誇大、不恐嚇。
 *   ・stats：官方統計（official）、醫院公開收費／官員受訪（price，畫面標「費用行情」）、官方平台原始資料由我們整理（derived）
 *   ・scenario：情境試算，畫面一律標「情境試算，非統計」，每一項都附出處
 * 查證清單（給顧問核對，含暫不放與查不到的）：100_Todo/drafts/research/2026-10-14-A3b案例出處.md
 * ⚠️ 藥費、病房差額、特材價格、重大傷病卡數有時效性，每年底要重查一次（VERIFIED_AT）。
 * 10/14 顧問核對：免疫治療藥費（原第 3 筆）找不到健保署每人藥費的原始資料（官方只公布總額）→ 拿掉
 * W1b 管理後台（I3／I7、content_items）上線後，這份改成種子資料。
 */
export const VERIFIED_AT = "2026-10-14";

export interface Stat {
  n: string;                 // 大字
  label: string;             // 一句白話
  kind: "official" | "price" | "derived";
  source: string;            // 機關＋文件名
  year: string;              // 資料年份（不是網頁發布日）
  url: string;
}
export interface ScenarioItem { label: string; amount: string; ref: string }
export interface Scenario { title: string; total: string; items: ScenarioItem[]; excluded: string }
export interface CaseSet { stats: Stat[]; scenario?: Scenario }

const MOHW_DEATH_2025 = "https://www.mohw.gov.tw/dl-100915-0a572340-fabe-4a89-a8a0-199640a9053d.html";

export const CASES: Partial<Record<GapKey, CaseSet>> = {
  cancer: { stats: [
    { n: "13 萬 8,051 人", label: "一年新確診癌症的人數", kind: "official",
      source: "衛福部國健署 112 年癌症登記報告", year: "2023", url: "https://mohw.gov.tw/cp-16-84987-1.html" },
    { n: "連續 44 年", label: "癌症是國人死因第 1 名；2025 年癌症死亡 5 萬 4,838 人", kind: "official",
      source: "衛福部統計處 114 年死因統計", year: "2025", url: MOHW_DEATH_2025 },
  ] },
  card: { stats: [
    { n: "52 萬 4,274 張", label: "還在有效期內的癌症重大傷病證明（這是卡數，不是人數）", kind: "official",
      source: "健保署 重大傷病證明有效領證統計表", year: "2026 年 9 月", url: "https://www.nhi.gov.tw/ch/dl-17699-0ebb682e2f254125b5fef253973a5ca9-1.pdf" },
  ] },
  critical: { stats: [
    { n: "第 4 名", label: "腦血管疾病（中風等）在國人十大死因的排名；2025 年死亡 1 萬 2,425 人", kind: "official",
      source: "衛福部統計處 114 年死因統計", year: "2025", url: "https://mohw.gov.tw/cp-16-86970-1.html" },
  ] },
  disability: { stats: [
    { n: "125 萬 5,789 人", label: "領有身心障礙證明的人數，其中約 63% 是後天疾病造成", kind: "official",
      source: "衛福部統計處 身心障礙統計（表 1.1.7）", year: "2025 年底", url: "https://www.mohw.gov.tw/dl-69422-eed90854-f90f-4cf9-8b9c-dd90f6b2163b.html" },
    { n: "約 62.5 萬人", label: "領身障證明、還不到 65 歲的人，大約占一半", kind: "official",
      source: "衛福部統計處 身心障礙統計（表 1.1.2）", year: "2025 年底", url: "https://www.mohw.gov.tw/dl-69412-2753747a-3580-4678-8eca-be1dd40b1599.html" },
    { n: "2 萬 2,962 件", label: "一年勞保普通事故失能一次給付件數", kind: "official",
      source: "勞動部統計月報（表 6-5）", year: "2025", url: "https://statdb.mol.gov.tw/html/mon/26050.pdf" },
  ] },
  ltc: {
    stats: [
      { n: "92 萬 3,270 人", label: "推估需要長照服務的人數", kind: "official",
        source: "衛福部 長照 2.0 服務涵蓋率", year: "2025", url: "https://www.mohw.gov.tw/dl-88608-9d7a650b-ac63-43cb-a469-7d1cb37a2d77.html" },
      { n: "約 7.9 年", label: "平均壽命 80.77 歲減健康平均餘命 72.86 歲：一生中有住院、重大傷病或慢性病失能的年數（不等於需要長照的年數）", kind: "derived",
        source: "內政部 113 年簡易生命表、衛福部 健康平均餘命指標", year: "2024", url: "https://dep.mohw.gov.tw/DOS/cp-5082-55400-113.html" },
      { n: "每月 1 萬～3.6 萬元", label: "長照 2.0 照顧及專業服務的補助額度，依失能等級（有請外籍看護的家庭只給 30%）", kind: "official",
        source: "衛福部 長期照顧服務申請及給付辦法 附表二", year: "2025-09 施行", url: "https://www.mohw.gov.tw/dl-95450-0fdec091-da73-42eb-9828-b897fac2a165.html" },
    ],
    scenario: {
      title: "請外籍看護照顧一年",
      total: "約 28.8 萬元",
      items: [
        { label: "薪資＋加班費 約 2.4 萬元 × 12 個月", amount: "約 28.8 萬元", ref: "勞動部 114 年移工管理及運用調查（2025 年 6 月）" },
        { label: "長照 2.0 補助", amount: "只給額度的 30%", ref: "衛福部 長期照顧服務申請及給付辦法 第 10 條" },
      ],
      excluded: "沒算食宿、健保、就業安定費、仲介費",
    },
  },
  reimb: {
    stats: [
      { n: "約 5.9 萬元", label: "一支塗藥心臟支架，民眾要自付的差額（各院所標價的中位數）", kind: "derived",
        source: "健保署 醫材比價網（院所登錄資料，2026-10 查詢整理）", year: "2026", url: "https://info.nhi.gov.tw/INAE2000/INAE2011S01" },
      { n: "每天 4,000～1.6 萬元", label: "醫學中心單人病房要自付的差額", kind: "price",
        source: "臺北榮總 病房收費標準", year: "2022 生效", url: "https://wd.vghtpe.gov.tw/manage/upload/cabfile/f_20221026115919974.pdf" },
    ],
    scenario: {
      title: "心臟放 2 支塗藥支架、住醫學中心單人房 5 天",
      total: "約 13.8 萬元",
      items: [
        { label: "塗藥支架自付差額 約 5.9 萬 × 2 支", amount: "約 11.8 萬元", ref: "健保署 醫材比價網（2026-10 查詢整理）" },
        { label: "單人房差額 4,000 元 × 5 天（取下限）", amount: "2 萬元", ref: "臺北榮總 病房收費標準（2022 生效）" },
      ],
      excluded: "沒算手術費、檢查、健保部分負擔",
    },
  },
  daily: { stats: [
    { n: "7.22 天", label: "急性病床平均每次住院天數，近 3 年緩步縮短（7.44 → 7.25 → 7.22）", kind: "official",
      source: "衛福部健保會 113 年健保監理指標監測報告", year: "2024", url: "https://www.mohw.gov.tw/dl-98589-4782a345-f250-4d14-8b78-c550439eb29e.html" },
  ] },
};

export const KIND_LABEL: Record<Stat["kind"], string> = { official: "官方統計", price: "費用行情", derived: "官方資料整理" };
