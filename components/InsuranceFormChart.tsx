"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PolicyData {
  company?: string;
  policyName?: string;
  life?: { type?: string; amount?: string; survival?: string };
  medicalReimbursement?: {
    type?: string; receiptType?: string; hospitalRoom?: string; icu?: string; burn?: string;
    miscMedical?: string; surgery?: string; outpatientSurgery?: string;
    specialTreatment?: string; dischargeCare?: string; annualLimit?: string;
  };
  fixedMedical?: {
    type?: string; hospitalDaily?: string; dischargeCare?: string; icu?: string; burn?: string;
    emergency?: string; surgery?: string; outpatientSurgery?: string; specialSurgery?: string;
    specialMedicalDevice?: string; nursing?: string; annualLimit?: string;
  };
  accident?: {
    type?: string; grade?: string; deathDisability?: string; disabilityAssist?: string;
    burnAmount?: string; outpatientReimbursement?: string; hospitalDaily?: string;
    icu?: string; fracture?: string; annualLimit?: string;
  };
  cancer?: {
    type?: string; initialCancer?: string; invasiveCancer?: string; severeCancer?: string;
    hospitalDaily?: string; chemotherapy?: string; annualLimit?: string; waitDays?: string;
  };
  criticalIllnessCard?: { type?: string; amount?: string; waitDays?: string };
  majorDisease?: { type?: string; sevenItems?: string; twentyTwoItems?: string; waitDays?: string };
  longTermCare?: { type?: string; annualBenefit?: string; lumpSum?: string; waitDays?: string };
  disability?: { type?: string; grade1to6?: string; grade2to6LumpSum?: string };
}

function hasData(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return false;
  return Object.entries(obj).some(([k, v]) => !["type", "waitDays"].includes(k) && v != null && v !== "");
}

function mv(v?: string) {
  return v ? v.split("｜")[0].trim() : "";
}

function Row({ label, value, accent }: { label: string; value?: string; accent?: boolean }) {
  const main = mv(value);
  const note = value?.split("｜")[1]?.trim();
  if (!main) return null;
  return (
    <div className="flex items-baseline py-2 border-b border-stone-100 last:border-0 gap-2">
      <span className="text-sm text-stone-500 shrink-0 w-28 leading-snug">{label}</span>
      <span className={`text-sm font-semibold flex-1 leading-snug ${accent ? "text-amber-700" : "text-stone-800"}`}>
        {main}
      </span>
      {note && <span className="text-xs text-stone-400 shrink-0 text-right max-w-[120px] leading-snug">{note}</span>}
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
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className={`text-base font-semibold flex items-center gap-2 ${color}`}>
          {emoji} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">{children}</CardContent>
    </Card>
  );
}

function PairGrid({ left, right }: { left: React.ReactNode | null; right: React.ReactNode | null }) {
  if (!left && !right) return null;
  if (!left) return <>{right}</>;
  if (!right) return <>{left}</>;
  return (
    <div className="grid grid-cols-2 gap-3">
      {left}
      {right}
    </div>
  );
}

function QuadGrid({ items }: { items: (React.ReactNode | null)[] }) {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  const cols = visible.length === 1 ? "grid-cols-1" : visible.length === 2 ? "grid-cols-2" : visible.length === 3 ? "grid-cols-3" : "grid-cols-4";
  return <div className={`grid ${cols} gap-3`}>{visible}</div>;
}

export default function InsuranceFormChart({ data }: { data: Record<string, unknown> }) {
  const d = data as PolicyData;

  const hasLife  = hasData(d.life as Record<string, unknown>);
  const hasMed   = hasData(d.medicalReimbursement as Record<string, unknown>);
  const hasFixed = hasData(d.fixedMedical as Record<string, unknown>);
  const hasAcc   = hasData(d.accident as Record<string, unknown>);
  const hasCan   = hasData(d.cancer as Record<string, unknown>);
  const hasCrit  = hasData(d.criticalIllnessCard as Record<string, unknown>);
  const hasMajor = hasData(d.majorDisease as Record<string, unknown>);
  const hasLtc   = hasData(d.longTermCare as Record<string, unknown>);
  const hasDis   = hasData(d.disability as Record<string, unknown>);

  if (!hasLife && !hasMed && !hasFixed && !hasAcc && !hasCan && !hasCrit && !hasMajor && !hasLtc && !hasDis) {
    return <div className="text-center py-16 text-stone-300 text-sm">尚無保障資料</div>;
  }

  return (
    <div className="space-y-3">
      {/* 保單基本資料 */}
      {(d.company || d.policyName) && (
        <Card className="bg-white border-amber-100 shadow-sm">
          <CardContent className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-700">{d.company || ""}</span>
              <span className="text-sm text-stone-400">{d.policyName || ""}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 壽險 */}
      {hasLife && (
        <Section emoji="❤️" title="壽險" color="text-rose-700">
          <Row label="型態" value={d.life?.type} />
          <Row label="保障額度" value={d.life?.amount} accent />
          <Row label="生存金" value={d.life?.survival} />
        </Section>
      )}

      {/* 醫療實支 + 定額醫療 */}
      <PairGrid
        left={hasMed ? (
          <Section emoji="🧾" title="醫療費實支實付" color="text-teal-700">
            <Row label="收據類型" value={d.medicalReimbursement?.receiptType} />
            <Row label="住院病房" value={d.medicalReimbursement?.hospitalRoom} />
            <Row label="加護病房" value={d.medicalReimbursement?.icu} />
            <Row label="燒燙傷病房" value={d.medicalReimbursement?.burn} />
            <Row label="醫療雜費" value={d.medicalReimbursement?.miscMedical} />
            <Row label="住院手術" value={d.medicalReimbursement?.surgery} />
            <Row label="門診手術" value={d.medicalReimbursement?.outpatientSurgery} />
            <Row label="出院療養" value={d.medicalReimbursement?.dischargeCare} />
            <Row label="累積給付上限" value={d.medicalReimbursement?.annualLimit} accent />
          </Section>
        ) : null}
        right={hasFixed ? (
          <Section emoji="📋" title="定額醫療保險" color="text-blue-700">
            <Row label="住院日額" value={d.fixedMedical?.hospitalDaily} accent />
            <Row label="出院療養" value={d.fixedMedical?.dischargeCare} />
            <Row label="加護病房" value={d.fixedMedical?.icu} />
            <Row label="燒燙傷病房" value={d.fixedMedical?.burn} />
            <Row label="住院前急診" value={d.fixedMedical?.emergency} />
            <Row label="住院手術" value={d.fixedMedical?.surgery} />
            <Row label="門診手術" value={d.fixedMedical?.outpatientSurgery} />
            <Row label="特定/重大手術" value={d.fixedMedical?.specialSurgery} />
            <Row label="特殊醫材補助" value={d.fixedMedical?.specialMedicalDevice} />
            <Row label="住院看護" value={d.fixedMedical?.nursing} />
            <Row label="累積給付上限" value={d.fixedMedical?.annualLimit} accent />
          </Section>
        ) : null}
      />

      {/* 意外 + 防癌 */}
      <PairGrid
        left={hasAcc ? (
          <Section emoji="⚡" title="意外傷害險" color="text-orange-700">
            <Row label="職等" value={d.accident?.grade} />
            <Row label="意外身故/失能" value={d.accident?.deathDisability} accent />
            <Row label="失能扶助" value={d.accident?.disabilityAssist} />
            <Row label="重大燒燙傷" value={d.accident?.burnAmount} />
            <Row label="意外門診實支" value={d.accident?.outpatientReimbursement} />
            <Row label="住院日額" value={d.accident?.hospitalDaily} />
            <Row label="加護/燒燙傷" value={d.accident?.icu} />
            <Row label="骨折未住院" value={d.accident?.fracture} />
            <Row label="累積給付上限" value={d.accident?.annualLimit} accent />
          </Section>
        ) : null}
        right={hasCan ? (
          <Section emoji="🎗️" title="防癌險" color="text-pink-700">
            <Row label="初次罹癌" value={d.cancer?.initialCancer} accent />
            <Row label="侵襲癌" value={d.cancer?.invasiveCancer} />
            <Row label="重度癌" value={d.cancer?.severeCancer} />
            <Row label="癌症住院日額" value={d.cancer?.hospitalDaily} />
            <Row label="化療與醫材" value={d.cancer?.chemotherapy} />
            <Row label="累積給付上限" value={d.cancer?.annualLimit} accent />
            {d.cancer?.waitDays && <Row label="等待期" value={d.cancer.waitDays} />}
          </Section>
        ) : null}
      />

      {/* 重大傷病卡 / 重特大 / 長照 / 失能 */}
      <QuadGrid items={[
        hasCrit ? (
          <Section key="crit" emoji="💳" title="重大傷病卡" color="text-violet-700">
            <Row label="型態" value={d.criticalIllnessCard?.type} />
            <Row label="給付金額" value={d.criticalIllnessCard?.amount} accent />
            {d.criticalIllnessCard?.waitDays && <Row label="等待期" value={d.criticalIllnessCard.waitDays} />}
          </Section>
        ) : null,
        hasMajor ? (
          <Section key="major" emoji="🏥" title="重特大疾病" color="text-purple-700">
            <Row label="重大疾病（7項）" value={d.majorDisease?.sevenItems} accent />
            <Row label="特定傷病（22項）" value={d.majorDisease?.twentyTwoItems} accent />
            {d.majorDisease?.waitDays && <Row label="等待期" value={d.majorDisease.waitDays} />}
          </Section>
        ) : null,
        hasLtc ? (
          <Section key="ltc" emoji="🧓" title="長照險" color="text-amber-700">
            <Row label="型態" value={d.longTermCare?.type} />
            <Row label="年給付" value={d.longTermCare?.annualBenefit} accent />
            <Row label="一次金" value={d.longTermCare?.lumpSum} accent />
            {d.longTermCare?.waitDays && <Row label="等待期" value={d.longTermCare.waitDays} />}
          </Section>
        ) : null,
        hasDis ? (
          <Section key="dis" emoji="♿" title="失能險" color="text-stone-600">
            <Row label="型態" value={d.disability?.type} />
            <Row label="1~6 級月給" value={d.disability?.grade1to6} accent />
            <Row label="2~6 級一次金" value={d.disability?.grade2to6LumpSum} />
          </Section>
        ) : null,
      ]} />
    </div>
  );
}
