import type { Assumptions } from "./assumptions";

/*
 * 唯一的計算引擎（實作設計 E1）。客戶端對話、我的分析、顧問端財務規劃、規劃書、advisor-plan skill 全部呼叫這裡。
 * 純函式：不碰資料庫、不碰 AI——同樣的輸入＋同一版參數，永遠算出同樣的數字。
 *
 * 三條不能破的規則：
 *   ・缺口一律 0% 報酬（N23）——「還差多少」是需求問題，不因假設報酬變小
 *   ・報酬率只套在工具試算（每月要多存多少），只有顧問端能選，上限 6%（E2）
 *   ・沒問到的值不能憑空捏造：用了預設就列在 assumed 裡，畫面上要標出來
 */

/** 計算需要的客戶資料（全部是對話裡的需求點，key 與 facts.key 相同） */
export interface CalcInputs {
  age?: number; risk?: number;
  food?: number; home?: number; trans?: number; fun?: number;
  ret?: number; die?: number; save?: number; saved?: number;
  re?: number; est?: number; surv?: number; loan?: number; dep?: number; inc?: number; xfer?: number;
  kid?: number;
  // 顧問面談時才補的實際值（E3、E5）；客戶端不會有
  laborMonthlyActual?: number; laborYearsActual?: number; lifeCoverExisting?: number; heirCash?: number;
}

export const INPUT_KEYS = ["age", "risk", "food", "home", "trans", "fun", "ret", "die", "save", "saved",
  "re", "est", "surv", "loan", "dep", "inc", "xfer", "kid"] as const;

// 沒問到時的預設值＝原型 v37 每題的第一個選項（顧問確認過的中間值）
const DEFAULTS: Required<Pick<CalcInputs, (typeof INPUT_KEYS)[number]>> = {
  age: 35, risk: 0, food: 16000, home: 15000, trans: 4000, fun: 13000, ret: 65, die: 85, save: 8000, saved: 2_000_000,
  re: 0.8, est: 25_000_000, surv: 60000, loan: 5_000_000, dep: 10, inc: 1_200_000, xfer: 0, kid: 3,
};

/** 標記為「沒問到、用了預設」的欄位 */
export type Assumed = string[];

function pick<K extends keyof typeof DEFAULTS>(i: CalcInputs, k: K, assumed: Assumed): number {
  const v = i[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  assumed.push(k);
  return DEFAULTS[k];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// ── 工具配置邏輯：年齡 × 資金態度（原型 ROUTE）────────────────────────
export interface RouteResult { age: number; risk: number; acc: boolean; stage: string; yrsLeft: number; main: string; why: string; tools: string[] }

/* 50 歲是分水嶺——不是因為規定，是因為「賠掉之後還有沒有時間賺回來」 */
export function route(i: CalcInputs, assumed: Assumed = []): RouteResult {
  const a = pick(i, "age", assumed), r = pick(i, "risk", assumed);
  const acc = a < 50, stage = acc ? "累積期" : "保全期", yrsLeft = Math.max(0, 65 - a);
  let main: string, why: string, tools: string[];
  if (acc && r === 2) {
    main = "成長型累積"; tools = ["投資型（變額年金／變額壽險）", "搭配部分儲蓄型打底"];
    why = `離退休還有 ${yrsLeft} 年，<b>中間跌了有時間漲回來</b>。而且你說願意承受波動，所以可以用成長型工具拉高效率。`;
  } else if (acc) {
    main = "穩健型累積"; tools = ["儲蓄型／利變型為主", "想試投資型可小部位"];
    why = `時間夠（還有 ${yrsLeft} 年），但你說<b>不想虧到本金</b>。那就不該硬塞投資型——<b>工具要配合人，不是人配合工具</b>。`;
  } else if (r === 2) {
    main = "保全為主、成長為輔"; tools = ["儲蓄型／利變年金為主", "投資型最多擺小部位"];
    why = `你 ${a} 歲，離退休剩 ${yrsLeft} 年。<b>就算你願意承受波動，時間也不夠了</b>——這個階段跌一次，沒有二十年可以等它回來。`;
  } else {
    main = "資產保全與傳承"; tools = ["儲蓄型／利變年金", "稅源準備（指定受益人壽險）", "生前贈與規劃"];
    why = `你 ${a} 歲，重點已經不是「怎麼讓錢變多」，是<b>怎麼讓它確定地留下來、並且在需要的時候拿得出現金</b>。`;
  }
  return { age: a, risk: r, acc, stage, yrsLeft, main, why, tools };
}

// ── 勞保＋勞退（E3：公式推估，顧問可改實際值）──────────────────────
export interface LaborResult {
  insuredSalary: number; insuredFromIncome: boolean; years: number;
  annuityStartAge: number; adjust: number;      // 提前減給（負）／延後增給（正）
  monthly: number;                              // 勞保老年年金月領（0＝年資不足只能一次請領）
  lumpSum: number;                              // 勞保一次請領
  laborTotal: number;                           // 勞保在退休期間總共領到的
  pensionLump: number;                          // 勞退新制個人帳戶累積（0% 報酬）
  total: number;
  actual: boolean;                              // 顧問已改成勞保局查到的實際值
}

export function labor(i: CalcInputs, A: Assumptions, ret: number, die: number): LaborResult {
  const L = A.labor;
  const hasInc = typeof i.inc === "number" && i.inc > 0;
  const monthlyWage = hasInc ? i.inc! / 12 : L.insuredDefault;
  const insuredSalary = Math.round(clamp(monthlyWage, L.insuredMin, L.insuredMax));
  const years = i.laborYearsActual ?? Math.max(0, ret - L.startAge);
  const annuityStartAge = Math.max(ret, L.earliestAge);
  const adjYears = clamp(annuityStartAge - L.fullAge, -L.adjustMaxYears, L.adjustMaxYears);
  const adjust = adjYears * L.adjustPerYear;
  const annuityYears = Math.max(0, die - annuityStartAge);

  let monthly = 0, lumpSum = 0;
  if (i.laborMonthlyActual !== undefined) monthly = i.laborMonthlyActual;
  else if (years >= L.minYearsForAnnuity) {
    const a = insuredSalary * years * L.rateA + L.flatA, b = insuredSalary * years * L.rateB;
    monthly = Math.round(Math.max(a, b) * (1 + adjust));
  } else {
    lumpSum = insuredSalary * years;     // 年資未滿 15 年：每滿一年給一個月
  }
  const laborTotal = monthly * 12 * annuityYears + lumpSum;
  const pensionWage = Math.min(hasInc ? i.inc! / 12 : L.insuredDefault, L.pensionWageMax);
  const pensionLump = Math.round(pensionWage * L.pensionRate * 12 * years);
  return {
    insuredSalary, insuredFromIncome: hasInc, years, annuityStartAge, adjust, monthly, lumpSum, laborTotal, pensionLump,
    total: laborTotal + pensionLump, actual: i.laborMonthlyActual !== undefined,
  };
}

// ── 退休缺口（分項開銷；E1）─────────────────────────────────────
export interface RetirementResult {
  food: number; home: number; homeRet: number; trans: number; transRet: number; fun: number; medical: number;
  ret: number; die: number; save: number; saved: number; yrs: number; span: number;
  baseNow: number; baseRet: number; inf: number; needM: number; total: number;
  labor: LaborResult; gov: number; gap: number;
  // 工具試算（每月要多存多少）——唯一會用到報酬率的地方
  returnRate: number; accNow: number; needSelf: number; add: number;
}

export function retirement(i: CalcInputs, A: Assumptions, opts: { returnRate?: number } = {}, assumed: Assumed = []): RetirementResult {
  const returnRate = opts.returnRate ?? 0;
  if (returnRate < 0 || returnRate > A.returnRateMax) throw new Error(`報酬率必須在 0%～${A.returnRateMax * 100}% 之間`);
  const R = A.retirement;
  const age = pick(i, "age", assumed);
  const food = pick(i, "food", assumed), home = pick(i, "home", assumed), trans = pick(i, "trans", assumed), fun = pick(i, "fun", assumed);
  const ret = pick(i, "ret", assumed), die = pick(i, "die", assumed), save = pick(i, "save", assumed), saved = pick(i, "saved", assumed);
  const yrs = Math.max(1, ret - age), span = Math.max(1, die - ret);
  const homeRet = home >= R.mortgageThreshold ? R.homeAfterPayoff : home;   // 房貸多半退休前繳清
  const transRet = Math.round(trans * R.transportRatio);                    // 不通勤
  const baseNow = food + home + trans;                                      // 今天的基礎（不含娛樂）
  const baseRet = food + homeRet + transRet + R.medicalMonthly;             // 退休後基礎（醫療是升的）
  const inf = Math.pow(1 + A.inflation, yrs);
  const needM = baseRet * inf;
  const total = needM * 12 * span;
  const lab = labor(i, A, ret, die);
  const gov = lab.total;
  const gap = Math.max(0, total - gov - saved);                             // 0% 報酬

  // 工具試算：現有準備與每月存款滾到退休時有多少；不足的部分每月要多存多少
  const n = yrs * 12, m = returnRate / 12;
  const fvSaved = saved * Math.pow(1 + returnRate, yrs);
  const annuity = m === 0 ? n : (Math.pow(1 + m, n) - 1) / m;
  const accNow = fvSaved + save * annuity;
  const needSelf = saved + gap;
  const add = Math.max(0, Math.round((needSelf - accNow) / annuity / 500) * 500);
  return { food, home, homeRet, trans, transRet, fun, medical: R.medicalMonthly, ret, die, save, saved, yrs, span,
    baseNow, baseRet, inf, needM, total, labor: lab, gov, gap, returnRate, accNow, needSelf, add };
}

// ── 遺產稅（累進）──────────────────────────────────────────────
export interface EstateResult {
  est: number; re: number; cash: number; inv: number;
  deductions: { label: string; amount: number }[]; deductTotal: number; net: number; tax: number; children: number;
}

export function estateTax(net: number, A: Assumptions): number {
  let tax = 0, lower = 0;
  for (const b of A.estate.brackets) {
    if (net <= lower) break;
    tax += (Math.min(net, b.upTo) - lower) * b.rate;
    lower = b.upTo;
  }
  return Math.round(tax);
}

export function estate(i: CalcInputs, A: Assumptions, assumed: Assumed = []): EstateResult {
  const E = A.estate;
  const est = pick(i, "est", assumed), reR = pick(i, "re", assumed);
  const re = Math.round(est * reR), cash = Math.round(est * (1 - reR) * 0.6), inv = est - re - cash;
  const children = E.assumedChildren;
  const deductions = [
    { label: "免稅額", amount: E.exemption },
    { label: "配偶扣除額", amount: E.spouse },
    { label: `子女扣除額（${children} 位）`, amount: E.perChild * children },
    { label: "喪葬費扣除額", amount: E.funeral },
  ];
  const deductTotal = deductions.reduce((a, d) => a + d.amount, 0);
  const net = Math.max(0, est - deductTotal);
  return { est, re, cash, inv, deductions, deductTotal, net, tax: estateTax(net, A), children };
}

// ── 稅源缺口（第一層：錢在但動不了）──────────────────────────────
export interface TaxSourceResult {
  tax: number; funeral: number; surv: number; months: number; survTotal: number; procedure: number; need: number;
  frozenCash: number; own: number; ownKnown: boolean; gap: number;
}

export function taxSource(i: CalcInputs, A: Assumptions, e: EstateResult, assumed: Assumed = []): TaxSourceResult {
  const T = A.taxSource;
  const surv = pick(i, "surv", assumed);
  const survTotal = surv * T.freezeMonths;
  const need = e.tax + T.funeralCash + survTotal + T.procedureCost;
  // 家人自有可動用資金：對話沒問，不能替客戶編一個數字 → 先以 0 計，面談時顧問補實際值
  const ownKnown = i.heirCash !== undefined;
  const own = i.heirCash ?? 0;
  return { tax: e.tax, funeral: T.funeralCash, surv, months: T.freezeMonths, survTotal, procedure: T.procedureCost, need,
    frozenCash: e.cash, own, ownKnown, gap: Math.max(0, need - own) };
}

// ── 遺族長期保障缺口（第二層：錢根本不夠）────────────────────────
export interface SurvivorResult {
  inc: number; mult: number; repl: number; loan: number; longNeed: number;
  haveLife: number; haveLifeKnown: boolean; longGap: number; minGap: number;
}

export function survivor(i: CalcInputs, assumed: Assumed = []): SurvivorResult {
  const inc = pick(i, "inc", assumed), mult = pick(i, "dep", assumed), loan = pick(i, "loan", assumed);
  const repl = inc * mult, longNeed = repl + loan;
  // 現有壽險要從保單來（存摺解析，第 5 步）；還沒有就以 0 計並標出來
  const haveLifeKnown = i.lifeCoverExisting !== undefined;
  const haveLife = i.lifeCoverExisting ?? 0;
  return { inc, mult, repl, loan, longNeed, haveLife, haveLifeKnown,
    longGap: Math.max(0, longNeed - haveLife),
    minGap: Math.max(0, loan + inc * 5 - haveLife) };   // 折衷版：貸款＋孩子成年前五年
}

// ── 生前贈與 vs 身故繼承（對照，不算誰比較省）────────────────────
export interface TransferResult { pick: number; giftExemption: number; estateExemption: number; months: number }

export function transfer(i: CalcInputs, A: Assumptions, assumed: Assumed = []): TransferResult {
  return { pick: pick(i, "xfer", assumed), giftExemption: A.estate.giftExemptionPerYear, estateExemption: A.estate.exemption, months: A.taxSource.freezeMonths };
}

// ── 教育金（時間成本對照）──────────────────────────────────────
export interface EducationResult { kid: number; total: number; years: number; monthly: number; years5: number; monthly5: number; delayCost: number }

export function education(i: CalcInputs, A: Assumptions, assumed: Assumed = []): EducationResult {
  const kid = pick(i, "kid", assumed), total = A.education.total;
  const years = Math.max(1, A.education.finishAge - kid), years5 = Math.max(1, years - 5);
  const per = (y: number) => Math.round(total / y / 12 / 100) * 100;
  const monthly = per(years), monthly5 = per(years5);
  return { kid, total, years, monthly, years5, monthly5, delayCost: monthly5 - monthly };
}

// ── 一次算完 ────────────────────────────────────────────────────
export interface CalcResults {
  route: RouteResult; retirement: RetirementResult; estate: EstateResult; taxSource: TaxSourceResult;
  survivor: SurvivorResult; transfer: TransferResult; education: EducationResult;
  assumed: Record<string, Assumed>;       // 每一塊各自用了哪些預設值
  assumptionsVersion: string;
}

export function computeAll(i: CalcInputs, A: Assumptions, opts: { returnRate?: number } = {}): CalcResults {
  const a = () => [] as Assumed;
  const as = { route: a(), retirement: a(), estate: a(), taxSource: a(), survivor: a(), transfer: a(), education: a() };
  const e = estate(i, A, as.estate);
  return {
    route: route(i, as.route),
    retirement: retirement(i, A, opts, as.retirement),
    estate: e,
    taxSource: taxSource(i, A, e, as.taxSource),
    survivor: survivor(i, as.survivor),
    transfer: transfer(i, A, as.transfer),
    education: education(i, A, as.education),
    assumed: as,
    assumptionsVersion: A.version,
  };
}

/** 需求點 → 計算輸入。只取有數值的；文字描述的需求點（照顧、家庭……）不進計算 */
export function inputsFromFacts(facts: { key: string; number: number | null }[]): CalcInputs {
  const out: CalcInputs = {};
  for (const f of facts) {
    if (f.number === null || !(INPUT_KEYS as readonly string[]).includes(f.key)) continue;
    (out as Record<string, number>)[f.key] = f.number;
  }
  return out;
}
