import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface PolicyData {
  company?: string;
  policyName?: string;
  planCode?: string;
  policyType?: string;
  status?: string;
  category?: string;
  hospitalization?: { diseaseDaily?: string; accidentDaily?: string; cancerDaily?: string; deductible?: string };
  death?: { general?: string; accident?: string; cancer?: string };
  life?: { type?: string; amount?: string; survival?: string };
  medicalReimbursement?: {
    type?: string; receiptType?: string; hospitalRoom?: string; icu?: string; burn?: string;
    miscMedical?: string; surgery?: string; outpatientSurgery?: string; specialTreatment?: string;
    dischargeCare?: string; transferRoom?: string; annualLimit?: string;
  };
  fixedMedical?: {
    type?: string; unreducedBenefit?: string; deathBenefit?: string; hospitalDaily?: string;
    dischargeCare?: string; icu?: string; burn?: string; emergency?: string; ambulance?: string;
    outpatientAroundHospital?: string; surgery?: string; outpatientSurgery?: string;
    specialSurgery?: string; specificTreatment?: string; woundClosure?: string;
    specialMedicalDevice?: string; nursing?: string; annualLimit?: string; waitDays?: string;
  };
  accident?: {
    type?: string; grade?: string; publicAccident?: string; deathDisability?: string;
    disabilityAssist?: string; burnAmount?: string; outpatientReimbursement?: string;
    hospitalDaily?: string; icu?: string; burn?: string; outpatientSurgery?: string;
    fracture?: string; dislocation?: string; annualLimit?: string;
  };
  cancer?: {
    type?: string; initialCancer?: string; deathBenefit?: string; primaryCancer?: string;
    invasiveCancer?: string; earlyCancer?: string; mildCancer?: string; severeCancer?: string;
    annualCancerBenefit?: string; hospitalDaily?: string; dischargeCare?: string; radiation?: string;
    surgery?: string; chemotherapy?: string; boneMarrow?: string; prosthetics?: string;
    dentures?: string; annualLimit?: string; waitDays?: string;
  };
  criticalIllnessCard?: { type?: string; amount?: string; waitDays?: string };
  majorDisease?: { type?: string; deathBenefit?: string; sevenItems?: string; twentyTwoItems?: string; waitDays?: string };
  longTermCare?: { type?: string; annualBenefit?: string; lumpSum?: string; waitDays?: string };
  disability?: { type?: string; grade1to6?: string; grade2to6LumpSum?: string; accidentDouble?: string };
  gaps?: string[];
  exclusions?: string[];
  waitingPeriods?: Record<string, string>;
}

interface Props {
  data: Record<string, unknown>;
}

function hasData(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  return Object.values(obj).some((v) => v !== "" && v !== null && v !== undefined);
}

function Row({ label, value, highlight }: { label: string; value?: string; highlight?: boolean }) {
  if (!value) return null;
  const pipeIdx = value.indexOf("｜");
  const mainVal = pipeIdx >= 0 ? value.slice(0, pipeIdx).trim() : value;
  const limit = pipeIdx >= 0 ? value.slice(pipeIdx + 1).trim() : "";
  return (
    <div className="flex items-baseline py-2 border-b border-stone-100 last:border-0 gap-2">
      <span className="text-sm text-stone-500 shrink-0">{label}</span>
      <span className={`text-sm font-semibold flex-1 text-right ${highlight ? "text-amber-700" : "text-stone-800"}`}>
        {mainVal}
      </span>
      <span className="text-xs text-stone-400 w-28 shrink-0 text-right leading-snug">
        {limit}
      </span>
    </div>
  );
}

function Section({
  emoji, title, color, children,
}: {
  emoji: string; title: string; color: string; children: React.ReactNode;
}) {
  return (
    <Card className="bg-white border-stone-200 shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className={`text-base font-semibold flex items-center gap-2 ${color}`}>
          {emoji} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

export default function InsuranceChart({ data }: Props) {
  const d = data as PolicyData;

  return (
    <div className="space-y-4">
      {/* 保單基本資料 */}
      <Card className="bg-white border-amber-100 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold text-stone-700 flex items-center gap-2">
            🗂️ 保單基本資料
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            {([
              ["保險公司", d.company],
              ["保單名稱", d.policyName],
              ["計畫代號", d.planCode],
              ["型態", d.policyType],
              ["繳費狀態", d.status],
              ["險種分類", d.category],
            ] as [string, string | undefined][]).filter(([, v]) => v).map(([label, value]) => (
              <div key={label} className="flex justify-between py-1 col-span-1">
                <span className="text-sm text-stone-500">{label}</span>
                <span className="text-sm text-stone-800 ml-2 font-semibold">{value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 住院日額 & 身故給付 */}
      <div className="grid grid-cols-2 gap-4">
        <Section emoji="🏥" title="住院日額" color="text-sky-700">
          <Row label="疾病住院" value={d.hospitalization?.diseaseDaily} />
          <Row label="意外住院" value={d.hospitalization?.accidentDaily} />
          <Row label="癌症住院" value={d.hospitalization?.cancerDaily} />
          <Row label="自負額" value={d.hospitalization?.deductible} />
        </Section>
        <Section emoji="💀" title="身故給付" color="text-stone-600">
          <Row label="一般身故" value={d.death?.general} />
          <Row label="意外身故" value={d.death?.accident} />
          <Row label="癌症身故" value={d.death?.cancer} />
        </Section>
      </div>

      {/* 壽險 */}
      {hasData(d.life as Record<string, unknown>) && (
        <Section emoji="❤️" title="壽險" color="text-rose-700">
          <Row label="型態" value={d.life?.type} />
          <Row label="保障額度" value={d.life?.amount} />
          <Row label="生存金" value={d.life?.survival} />
        </Section>
      )}

      {/* 醫療實支 & 定額醫療 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasData(d.medicalReimbursement as Record<string, unknown>) && (
          <Section emoji="🧾" title="醫療費實支實付" color="text-teal-700">
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
          </Section>
        )}

        {hasData(d.fixedMedical as Record<string, unknown>) && (
          <Section emoji="📋" title="定額醫療保險" color="text-blue-700">
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
            <Row label="累積給付上限" value={d.fixedMedical?.annualLimit} highlight />
            <Row label="等待期" value={d.fixedMedical?.waitDays} />
          </Section>
        )}
      </div>

      {/* 意外險 & 防癌險 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasData(d.accident as Record<string, unknown>) && (
          <Section emoji="⚡" title="意外傷害保險" color="text-orange-700">
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
          </Section>
        )}

        {hasData(d.cancer as Record<string, unknown>) && (
          <Section emoji="🎗️" title="防癌險" color="text-pink-700">
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
            <Row label="放射/化療" value={d.cancer?.radiation} />
            <Row label="手術" value={d.cancer?.surgery} />
            <Row label="化療與醫材" value={d.cancer?.chemotherapy} />
            <Row label="骨髓移植" value={d.cancer?.boneMarrow} />
            <Row label="義肢" value={d.cancer?.prosthetics} />
            <Row label="義齒" value={d.cancer?.dentures} />
            <Row label="累積給付上限" value={d.cancer?.annualLimit} highlight />
            <Row label="等待期" value={d.cancer?.waitDays} />
          </Section>
        )}
      </div>

      {/* 重大傷病卡 & 重特大疾病 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasData(d.criticalIllnessCard as Record<string, unknown>) && (
          <Section emoji="💳" title="重大傷病卡" color="text-violet-700">
            <Row label="型態" value={d.criticalIllnessCard?.type} />
            <Row label="給付" value={d.criticalIllnessCard?.amount} />
            <Row label="等待期" value={d.criticalIllnessCard?.waitDays} />
          </Section>
        )}
        {hasData(d.majorDisease as Record<string, unknown>) && (
          <Section emoji="🏥" title="重特大疾病" color="text-purple-700">
            <Row label="型態" value={d.majorDisease?.type} />
            <Row label="重大疾病（7項）" value={d.majorDisease?.sevenItems} />
            <Row label="特定傷病（22項）" value={d.majorDisease?.twentyTwoItems} />
            <Row label="等待期" value={d.majorDisease?.waitDays} />
          </Section>
        )}
      </div>

      {/* 長照 & 失能 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {hasData(d.longTermCare as Record<string, unknown>) && (
          <Section emoji="🧓" title="長照險" color="text-amber-700">
            <Row label="型態" value={d.longTermCare?.type} />
            <Row label="年給付" value={d.longTermCare?.annualBenefit} />
            <Row label="一次金" value={d.longTermCare?.lumpSum} />
            <Row label="等待期" value={d.longTermCare?.waitDays} />
          </Section>
        )}
        {hasData(d.disability as Record<string, unknown>) && (
          <Section emoji="♿" title="失能險" color="text-stone-600">
            <Row label="型態" value={d.disability?.type} />
            <Row label="1~6級給付" value={d.disability?.grade1to6} />
            <Row label="2~6級一次金" value={d.disability?.grade2to6LumpSum} />
            <Row label="意外加倍" value={d.disability?.accidentDouble} />
          </Section>
        )}
      </div>

      {/* 等待期 & 除外責任 */}
      {((d.waitingPeriods && Object.keys(d.waitingPeriods).length > 0) || (d.exclusions && d.exclusions.length > 0)) && (
        <Section emoji="⚠️" title="理賠條件與除外責任" color="text-yellow-700">
          {d.waitingPeriods && Object.entries(d.waitingPeriods).map(([k, v]) => (
            <Row key={k} label={`等待期 - ${k}`} value={v} />
          ))}
          {d.exclusions?.map((e, i) => (
            <div key={i} className="text-xs text-red-600 py-0.5">❌ {e}</div>
          ))}
        </Section>
      )}

      {/* 保障缺口 */}
      {d.gaps && d.gaps.length > 0 && (
        <Card className="bg-white border-red-100 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-red-600 flex items-center gap-2">
              🔍 保障缺口
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 flex flex-wrap gap-2">
            {d.gaps.map((g, i) => (
              <Badge key={i} variant="outline" className="text-red-600 border-red-200 bg-red-50 text-xs">
                {g}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
