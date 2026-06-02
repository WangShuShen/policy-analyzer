import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ExtraItem = { label: string; value: string };

interface PolicyData {
  company?: string;
  policyName?: string;
  planCode?: string;
  policyType?: string;
  status?: string;
  category?: string;
  hospitalization?: { diseaseDaily?: string; accidentDaily?: string; cancerDaily?: string; deductible?: string; extras?: ExtraItem[] };
  death?: { general?: string; accident?: string; cancer?: string; extras?: ExtraItem[] };
  life?: { type?: string; amount?: string; survival?: string; extras?: ExtraItem[] };
  medicalReimbursement?: {
    type?: string; receiptType?: string; hospitalRoom?: string; icu?: string; burn?: string;
    miscMedical?: string; surgery?: string; outpatientSurgery?: string; specialTreatment?: string;
    dischargeCare?: string; transferRoom?: string; annualLimit?: string; extras?: ExtraItem[];
  };
  fixedMedical?: {
    type?: string; unreducedBenefit?: string; deathBenefit?: string; hospitalDaily?: string;
    dischargeCare?: string; icu?: string; burn?: string; emergency?: string; ambulance?: string;
    outpatientAroundHospital?: string; surgery?: string; outpatientSurgery?: string;
    specialSurgery?: string; specificTreatment?: string; woundClosure?: string;
    specialMedicalDevice?: string; nursing?: string; consolationMoney?: string; annualLimit?: string; waitDays?: string; extras?: ExtraItem[];
  };
  accident?: {
    type?: string; grade?: string; publicAccident?: string; deathDisability?: string;
    disabilityAssist?: string; burnAmount?: string; outpatientReimbursement?: string;
    hospitalDaily?: string; icu?: string; burn?: string; outpatientSurgery?: string;
    fracture?: string; dislocation?: string; annualLimit?: string; extras?: ExtraItem[];
  };
  cancer?: {
    type?: string; initialCancer?: string; deathBenefit?: string; primaryCancer?: string;
    invasiveCancer?: string; earlyCancer?: string; mildCancer?: string; severeCancer?: string;
    annualCancerBenefit?: string; hospitalDaily?: string; dischargeCare?: string; outpatientMedical?: string; radiation?: string;
    surgery?: string; chemotherapy?: string; boneMarrow?: string; prosthetics?: string;
    dentures?: string; annualLimit?: string; waitDays?: string; extras?: ExtraItem[];
  };
  criticalIllnessCard?: { type?: string; amount?: string; waitDays?: string; extras?: ExtraItem[] };
  majorDisease?: { type?: string; deathBenefit?: string; sevenItems?: string; twentyTwoItems?: string; waitDays?: string; extras?: ExtraItem[] };
  longTermCare?: { type?: string; annualBenefit?: string; lumpSum?: string; waitDays?: string; extras?: ExtraItem[] };
  disability?: { type?: string; grade1to6?: string; grade2to6LumpSum?: string; accidentDouble?: string; extras?: ExtraItem[] };
  gaps?: string[];
  exclusions?: string[];
  waitingPeriods?: Record<string, string>;
  claimDocuments?: Record<string, string[]>;
}

interface Props {
  data: Record<string, unknown>;
}

const META_KEYS = new Set(["type", "waitDays"]);

function hasBenefitData(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  return Object.entries(obj)
    .filter(([k]) => !META_KEYS.has(k))
    .some(([, v]) => {
      if (v === "" || v === null || v === undefined) return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    });
}

function convertWan(text: string): string {
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
  let s = text.replace(/(\d+(?:\.\d+)?)~(\d+(?:\.\d+)?)萬/g, (_, a, b) =>
    `${fmt(parseFloat(a) * 10000)}~${fmt(parseFloat(b) * 10000)}`
  );
  s = s.replace(/(\d+(?:\.\d+)?)萬/g, (_, n) => fmt(parseFloat(n) * 10000));
  return s;
}


function ColumnHeaders() {
  return (
    <div className="flex items-center pb-2 mb-2 border-b-2 border-stone-200 gap-3">
      <span className="text-sm font-semibold text-stone-400 uppercase tracking-wide w-36 shrink-0">理賠項目</span>
      <span className="text-sm font-semibold text-stone-400 uppercase tracking-wide flex-1 text-right">金額</span>
      <span className="text-sm font-semibold text-stone-400 uppercase tracking-wide w-36 shrink-0 text-right">限制條件</span>
      <span className="text-sm font-semibold text-indigo-300 uppercase tracking-wide w-36 shrink-0 text-right">特別規定</span>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  const parts = value.split("｜");
  const mainVal = convertWan(parts[0].trim());
  const limit = convertWan(parts[1]?.trim() ?? "");
  const special = convertWan(parts[2]?.trim() ?? "");
  return (
    <div className="flex items-start py-3 border-b border-stone-100 last:border-0 gap-3">
      <span className="text-base text-stone-500 shrink-0 w-36 leading-snug">{label}</span>
      <span className={`text-lg font-semibold flex-1 text-right leading-snug ${highlight ? "text-amber-700" : "text-stone-800"}`}>
        {mainVal}
      </span>
      <span className="text-base text-stone-400 w-36 shrink-0 text-right leading-snug">
        {limit}
      </span>
      <span className="text-base text-indigo-400 w-36 shrink-0 text-right leading-snug">
        {special}
      </span>
    </div>
  );
}

function Section({
  emoji, title, color, children, showHeaders = false,
}: {
  emoji: string; title: string; color: string; children: React.ReactNode; showHeaders?: boolean;
}) {
  return (
    <Card className="bg-white border-stone-200 shadow-sm">
      <CardHeader className="pb-2 pt-5 px-5">
        <CardTitle className={`text-xl font-semibold flex items-center gap-2 ${color}`}>
          {emoji} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {showHeaders && <ColumnHeaders />}
        {children}
      </CardContent>
    </Card>
  );
}

function Extras({ items }: { items?: ExtraItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <Row key={`extra-${i}`} label={item.label} value={item.value} />
      ))}
    </>
  );
}

function PairGrid({ children }: { children: React.ReactNode[] }) {
  const visible = children.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <div className={`grid gap-4 ${visible.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {visible}
    </div>
  );
}

export default function InsuranceChart({ data }: Props) {
  const d = data as PolicyData;

  const hasLife  = hasBenefitData(d.life as Record<string, unknown>);
  const hasMed   = hasBenefitData(d.medicalReimbursement as Record<string, unknown>);
  const hasFixed = hasBenefitData(d.fixedMedical as Record<string, unknown>) ||
                   hasBenefitData(d.hospitalization as Record<string, unknown>);
  const hasAcc   = hasBenefitData(d.accident as Record<string, unknown>);
  const hasCan   = hasBenefitData(d.cancer as Record<string, unknown>);
  const hasCrit  = hasBenefitData(d.criticalIllnessCard as Record<string, unknown>);
  const hasMajor = hasBenefitData(d.majorDisease as Record<string, unknown>);
  const hasLtc   = hasBenefitData(d.longTermCare as Record<string, unknown>);
  const hasDis   = hasBenefitData(d.disability as Record<string, unknown>);

  return (
    <div className="space-y-4">
      {/* 保單基本資料 */}
      <Card className="bg-white border-amber-100 shadow-sm">
        <CardHeader className="pb-2 pt-5 px-5">
          <CardTitle className="text-xl font-semibold text-stone-700 flex items-center gap-2">
            🗂️ 保單基本資料
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <div className="grid grid-cols-2 gap-x-12 gap-y-2">
            {([
              ["保險公司", d.company],
              ["保單名稱", d.policyName],
              ["計畫代號", d.planCode],
              ["型態", d.policyType],
              ["繳費狀態", d.status],
              ["險種分類", d.category],
            ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between py-1.5">
                <span className="text-base text-stone-500">{label}</span>
                <span className="text-base text-stone-800 ml-2 font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 壽險 */}
      {hasLife && (
        <Section emoji="❤️" title="壽險" color="text-rose-700" showHeaders>
          <Row label="型態" value={d.life?.type} />
          <Row label="保障額度" value={d.life?.amount} />
          <Row label="生存金" value={d.life?.survival} />
          <Extras items={d.life?.extras} />
        </Section>
      )}

      {/* 醫療實支 & 定額醫療 */}
      <PairGrid>
        {hasMed ? (
          <Section key="med" emoji="🧾" title="醫療費實支實付" color="text-teal-700" showHeaders>
            <Row label="收據類型" value={d.medicalReimbursement?.receiptType} />
            <Row label="住院病房" value={d.medicalReimbursement?.hospitalRoom} />
            <Row label="加護病房" value={d.medicalReimbursement?.icu} />
            <Row label="燒燙傷病房" value={d.medicalReimbursement?.burn} />
            <Row label="醫療雜費" value={d.medicalReimbursement?.miscMedical} />
            <Row label="住院手術" value={d.medicalReimbursement?.surgery} />
            <Row label="門診手術" value={d.medicalReimbursement?.outpatientSurgery} />
            <Row label="特定處置" value={d.medicalReimbursement?.specialTreatment} />
            <Row label="出院療養" value={d.medicalReimbursement?.dischargeCare} />
            <Row label="轉換病房" value={d.medicalReimbursement?.transferRoom} />
            <Row label="累積給付上限" value={d.medicalReimbursement?.annualLimit} highlight />
            <Extras items={d.medicalReimbursement?.extras} />
          </Section>
        ) : null}
        {hasFixed ? (
          <Section key="fixed" emoji="📋" title="定額醫療保險" color="text-blue-700" showHeaders>
            {/* 向下相容：舊快取資料的住院日額存在 hospitalization 物件 */}
            {hasBenefitData(d.hospitalization as Record<string, unknown>) && !d.fixedMedical?.hospitalDaily && (
              <>
                <Row label="疾病住院日額" value={d.hospitalization?.diseaseDaily} />
                <Row label="意外住院日額" value={d.hospitalization?.accidentDaily} />
                <Row label="癌症住院日額" value={d.hospitalization?.cancerDaily} />
                <Row label="自負額" value={d.hospitalization?.deductible} />
                <Extras items={d.hospitalization?.extras} />
              </>
            )}
            <Row label="型態" value={d.fixedMedical?.type} />
            <Row label="無理賠增值" value={d.fixedMedical?.unreducedBenefit} />
            <Row label="身故給付" value={d.fixedMedical?.deathBenefit} />
            <Row label="住院日額" value={d.fixedMedical?.hospitalDaily} />
            <Row label="出院療養" value={d.fixedMedical?.dischargeCare} />
            <Row label="加護病房" value={d.fixedMedical?.icu} />
            <Row label="燒燙傷病房" value={d.fixedMedical?.burn} />
            <Row label="住院前急診" value={d.fixedMedical?.emergency} />
            <Row label="救護車轉送" value={d.fixedMedical?.ambulance} />
            <Row label="住院前後門診" value={d.fixedMedical?.outpatientAroundHospital} />
            <Row label="手術給付" value={d.fixedMedical?.surgery} />
            <Row label="門診手術" value={d.fixedMedical?.outpatientSurgery} />
            <Row label="特定/重大手術" value={d.fixedMedical?.specialSurgery} />
            <Row label="特定處置給付" value={d.fixedMedical?.specificTreatment} />
            <Row label="創傷縫合處置" value={d.fixedMedical?.woundClosure} />
            <Row label="特殊醫材補助" value={d.fixedMedical?.specialMedicalDevice} highlight />
            <Row label="住院看護" value={d.fixedMedical?.nursing} />
            <Row label="住院慰問金" value={d.fixedMedical?.consolationMoney} />
            <Row label="累積給付上限" value={d.fixedMedical?.annualLimit} highlight />
            <Row label="等待期" value={d.fixedMedical?.waitDays} />
            <Extras items={d.fixedMedical?.extras} />
          </Section>
        ) : null}
      </PairGrid>

      {/* 意外險 & 防癌險 */}
      <PairGrid>
        {hasAcc ? (
          <Section key="acc" emoji="⚡" title="意外傷害保險" color="text-orange-700" showHeaders>
            <Row label="型態" value={d.accident?.type} />
            <Row label="職等" value={d.accident?.grade} />
            <Row label="大眾交通加倍" value={d.accident?.publicAccident} />
            <Row label="意外身故/失能" value={d.accident?.deathDisability} />
            <Row label="失能扶助" value={d.accident?.disabilityAssist} />
            <Row label="重大燒燙傷" value={d.accident?.burnAmount} />
            <Row label="意外門診實支" value={d.accident?.outpatientReimbursement} />
            <Row label="傷害住院日額" value={d.accident?.hospitalDaily} />
            <Row label="加護/燒燙傷病房" value={d.accident?.icu} />
            <Row label="燒燙傷病房" value={d.accident?.burn} />
            <Row label="門診手術" value={d.accident?.outpatientSurgery} />
            <Row label="骨折未住院（最高）" value={d.accident?.fracture} highlight />
            <Row label="脫臼未住院" value={d.accident?.dislocation} />
            <Row label="累積給付上限" value={d.accident?.annualLimit} highlight />
            <Extras items={d.accident?.extras} />
          </Section>
        ) : null}
        {hasCan ? (
          <Section key="can" emoji="🎗️" title="防癌險" color="text-pink-700" showHeaders>
            <Row label="型態" value={d.cancer?.type} />
            <Row label="初次罹癌" value={d.cancer?.initialCancer} />
            <Row label="癌症身故" value={d.cancer?.deathBenefit} />
            <Row label="原位癌" value={d.cancer?.primaryCancer} />
            <Row label="侵襲癌" value={d.cancer?.invasiveCancer} />
            <Row label="初期癌" value={d.cancer?.earlyCancer} />
            <Row label="輕度癌" value={d.cancer?.mildCancer} />
            <Row label="重度癌" value={d.cancer?.severeCancer} />
            <Row label="重度癌年給付" value={d.cancer?.annualCancerBenefit} />
            <Row label="癌症住院" value={d.cancer?.hospitalDaily} />
            <Row label="出院療養" value={d.cancer?.dischargeCare} />
            <Row label="門診醫療" value={d.cancer?.outpatientMedical} />
            <Row label="放射/化療" value={d.cancer?.radiation} />
            <Row label="手術" value={d.cancer?.surgery} />
            <Row label="化療與醫材" value={d.cancer?.chemotherapy} />
            <Row label="骨髓移植" value={d.cancer?.boneMarrow} />
            <Row label="義肢" value={d.cancer?.prosthetics} />
            <Row label="義齒" value={d.cancer?.dentures} />
            <Row label="累積給付上限" value={d.cancer?.annualLimit} highlight />
            <Row label="等待期" value={d.cancer?.waitDays} />
            <Extras items={d.cancer?.extras} />
          </Section>
        ) : null}
      </PairGrid>

      {/* 重大傷病卡 & 重特大疾病 */}
      <PairGrid>
        {hasCrit ? (
          <Section key="crit" emoji="💳" title="重大傷病卡" color="text-violet-700" showHeaders>
            <Row label="型態" value={d.criticalIllnessCard?.type} />
            <Row label="給付" value={d.criticalIllnessCard?.amount} />
            <Row label="等待期" value={d.criticalIllnessCard?.waitDays} />
            <Extras items={d.criticalIllnessCard?.extras} />
          </Section>
        ) : null}
        {hasMajor ? (
          <Section key="major" emoji="🏥" title="重特大疾病" color="text-purple-700" showHeaders>
            <Row label="型態" value={d.majorDisease?.type} />
            <Row label="重大疾病（7項）" value={d.majorDisease?.sevenItems} />
            <Row label="特定傷病（22項）" value={d.majorDisease?.twentyTwoItems} />
            <Row label="等待期" value={d.majorDisease?.waitDays} />
            <Extras items={d.majorDisease?.extras} />
          </Section>
        ) : null}
      </PairGrid>

      {/* 長照 & 失能 */}
      <PairGrid>
        {hasLtc ? (
          <Section key="ltc" emoji="🧓" title="長照險" color="text-amber-700" showHeaders>
            <Row label="型態" value={d.longTermCare?.type} />
            <Row label="年給付" value={d.longTermCare?.annualBenefit} />
            <Row label="一次金" value={d.longTermCare?.lumpSum} />
            <Row label="等待期" value={d.longTermCare?.waitDays} />
            <Extras items={d.longTermCare?.extras} />
          </Section>
        ) : null}
        {hasDis ? (
          <Section key="dis" emoji="♿" title="失能險" color="text-stone-600" showHeaders>
            <Row label="型態" value={d.disability?.type} />
            <Row label="1~6級給付" value={d.disability?.grade1to6} />
            <Row label="2~6級一次金" value={d.disability?.grade2to6LumpSum} />
            <Row label="意外加倍" value={d.disability?.accidentDouble} />
            <Extras items={d.disability?.extras} />
          </Section>
        ) : null}
      </PairGrid>

      {/* 等待期 & 除外責任 */}
      {((d.waitingPeriods && Object.keys(d.waitingPeriods).length > 0) || (d.exclusions && d.exclusions.length > 0)) && (
        <Section emoji="⚠️" title="理賠條件與除外責任" color="text-yellow-700">
          {d.waitingPeriods && Object.entries(d.waitingPeriods).map(([k, v]) => (
            <Row key={k} label={`等待期 - ${k}`} value={v} />
          ))}
          {d.exclusions?.map((e, i) => (
            <div key={i} className="text-base text-red-600 py-1">❌ {e}</div>
          ))}
        </Section>
      )}

      {/* 理賠必要文件 */}
      {d.claimDocuments && Object.keys(d.claimDocuments).length > 0 && (
        <Section emoji="📄" title="理賠必要文件" color="text-stone-700">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-5">
            {Object.entries(d.claimDocuments).map(([category, docs]) => (
              <div key={category}>
                <div className="text-base font-semibold text-stone-700 mb-2">{category}</div>
                <ul className="space-y-1">
                  {(docs as string[]).map((doc, i) => (
                    <li key={i} className="text-base text-stone-600 flex items-start gap-1.5">
                      <span className="text-stone-400 shrink-0 mt-0.5">・</span>
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
