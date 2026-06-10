"use client";

interface PolicyData {
  company?: string;
  policyName?: string;
  life?: { type?: string; amount?: string; survival?: string };
  medicalReimbursement?: {
    type?: string; receiptType?: string; hospitalRoom?: string; icu?: string; burn?: string;
    miscMedical?: string; surgery?: string; outpatientSurgery?: string;
    specialTreatment?: string; dischargeCare?: string; transferRoom?: string; annualLimit?: string;
  };
  fixedMedical?: {
    type?: string; unreducedBenefit?: string; deathBenefit?: string; hospitalDaily?: string;
    dischargeCare?: string; icu?: string; burn?: string; emergency?: string; ambulance?: string;
    outpatientAroundHospital?: string; surgery?: string; outpatientSurgery?: string;
    specialSurgery?: string; specificTreatment?: string; woundClosure?: string;
    specialMedicalDevice?: string; nursing?: string; consolationMoney?: string; annualLimit?: string;
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
    annualCancerBenefit?: string; hospitalDaily?: string; dischargeCare?: string;
    outpatientMedical?: string; radiation?: string; surgery?: string; chemotherapy?: string;
    boneMarrow?: string; annualLimit?: string; waitDays?: string;
  };
  criticalIllnessCard?: { type?: string; amount?: string; waitDays?: string };
  majorDisease?: { type?: string; deathBenefit?: string; sevenItems?: string; twentyTwoItems?: string; waitDays?: string };
  longTermCare?: { type?: string; annualBenefit?: string; lumpSum?: string; waitDays?: string };
  disability?: { type?: string; grade1to6?: string; grade2to6LumpSum?: string; accidentDouble?: string };
}

function mainVal(v?: string) {
  if (!v) return "";
  return v.split("｜")[0].trim();
}

function noteVal(v?: string) {
  if (!v) return "";
  const parts = v.split("｜");
  return parts.slice(1).map(s => s.trim()).filter(Boolean).join("　");
}

// Single field row: label | underline | value  [note]
function F({ label, value, dim }: { label: string; value?: string; dim?: boolean }) {
  const mv = mainVal(value);
  const nv = noteVal(value);
  return (
    <div className="flex items-center gap-1 min-h-[17px]">
      <span className={`text-[10px] whitespace-nowrap shrink-0 ${dim ? "text-stone-300" : "text-stone-500"}`}>
        {label}
      </span>
      <div className="flex-1 border-b border-stone-300 min-w-0 text-right leading-none">
        <span className={`text-[11px] font-bold px-0.5 ${mv ? "text-stone-800" : "text-stone-200"}`}>
          {mv || "—"}
        </span>
      </div>
      {nv && (
        <span className="text-[9px] text-stone-400 whitespace-nowrap shrink-0 max-w-[80px] truncate ml-0.5">
          {nv}
        </span>
      )}
    </div>
  );
}

// Highlight row (for totals / key values)
function FH({ label, value }: { label: string; value?: string }) {
  const mv = mainVal(value);
  const nv = noteVal(value);
  return (
    <div className="flex items-center gap-1 min-h-[18px] bg-amber-50 -mx-2 px-2 rounded">
      <span className="text-[10px] whitespace-nowrap shrink-0 text-amber-700 font-semibold">{label}</span>
      <div className="flex-1 border-b border-amber-300 min-w-0 text-right leading-none">
        <span className={`text-[11px] font-bold px-0.5 ${mv ? "text-amber-700" : "text-stone-200"}`}>
          {mv || "—"}
        </span>
      </div>
      {nv && (
        <span className="text-[9px] text-amber-400 whitespace-nowrap shrink-0 ml-0.5">{nv}</span>
      )}
    </div>
  );
}

// Divider line with label
function Sub({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-[9px] text-stone-400 font-semibold whitespace-nowrap">{label}</span>
      <div className="flex-1 border-t border-stone-100" />
    </div>
  );
}

function hasAny(obj: Record<string, unknown> | undefined, ignore = ["type","waitDays"]): boolean {
  if (!obj) return false;
  return Object.entries(obj).some(([k, v]) => !ignore.includes(k) && v != null && v !== "");
}

interface SectionBoxProps {
  title: string;
  tag?: string;
  hBg: string;    // header background tailwind class
  bBg: string;    // border tailwind class
  children: React.ReactNode;
  className?: string;
}

function SectionBox({ title, tag, hBg, bBg, children, className }: SectionBoxProps) {
  return (
    <div className={`border-2 rounded overflow-hidden flex flex-col ${bBg} ${className || ""}`}>
      <div className={`px-2 py-0.5 flex items-center justify-between shrink-0 ${hBg}`}>
        <span className="text-[11px] font-bold text-white tracking-wide">{title}</span>
        {tag && <span className="text-[9px] text-white/70">{tag}</span>}
      </div>
      <div className="px-2 py-1.5 space-y-0.5 bg-white flex-1">{children}</div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

export default function InsuranceFormChart({ data }: { data: Record<string, unknown> }) {
  const d = data as PolicyData;

  const hasMed   = hasAny(d.medicalReimbursement as Record<string, unknown>);
  const hasFixed = hasAny(d.fixedMedical as Record<string, unknown>);
  const hasAcc   = hasAny(d.accident as Record<string, unknown>);
  const hasCan   = hasAny(d.cancer as Record<string, unknown>);
  const hasCrit  = hasAny(d.criticalIllnessCard as Record<string, unknown>);
  const hasMajor = hasAny(d.majorDisease as Record<string, unknown>);
  const hasLtc   = hasAny(d.longTermCare as Record<string, unknown>);
  const hasDis   = hasAny(d.disability as Record<string, unknown>);
  const hasLife  = hasAny(d.life as Record<string, unknown>, ["type"]);

  return (
    <div className="space-y-2 text-stone-700 font-sans select-none">

      {/* ── Header ───────────────────────────────── */}
      {(d.company || d.policyName) && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl">
          <span className="text-xs font-semibold text-stone-700">{d.company || ""}</span>
          <span className="text-xs text-stone-400">{d.policyName || ""}</span>
        </div>
      )}

      {/* ── Row 1: 壽險 (full width) ─────────────── */}
      {hasLife && (
        <SectionBox title="壽險" tag={d.life?.type} hBg="bg-red-600" bBg="border-red-300">
          <div className="grid grid-cols-2 gap-x-4">
            <div className="space-y-0.5">
              <F label="型態" value={d.life?.type} />
              <FH label="保障額度" value={d.life?.amount} />
            </div>
            <div className="space-y-0.5">
              <F label="生存金" value={d.life?.survival} />
            </div>
          </div>
        </SectionBox>
      )}

      {/* ── Row 2: 醫療實支 + 定額醫療 ──────────── */}
      {(hasMed || hasFixed) && (
        <div className={`grid gap-2 ${hasMed && hasFixed ? "grid-cols-2" : "grid-cols-1"}`}>
          {hasMed && (
            <SectionBox title="醫療費實支實付" tag={d.medicalReimbursement?.type} hBg="bg-teal-600" bBg="border-teal-300">
              <F label="收據類型" value={d.medicalReimbursement?.receiptType} />
              <Sub label="住院" />
              <F label="病房費" value={d.medicalReimbursement?.hospitalRoom} />
              <F label="加護病房" value={d.medicalReimbursement?.icu} />
              <F label="燒燙傷病房" value={d.medicalReimbursement?.burn} />
              <F label="醫療雜費" value={d.medicalReimbursement?.miscMedical} />
              <Sub label="手術" />
              <F label="住院手術" value={d.medicalReimbursement?.surgery} />
              <F label="門診手術" value={d.medicalReimbursement?.outpatientSurgery} />
              <F label="特定處置" value={d.medicalReimbursement?.specialTreatment} />
              <Sub label="其他" />
              <F label="出院療養" value={d.medicalReimbursement?.dischargeCare} />
              <F label="轉換病房" value={d.medicalReimbursement?.transferRoom} />
              <FH label="累積給付上限" value={d.medicalReimbursement?.annualLimit} />
            </SectionBox>
          )}
          {hasFixed && (
            <SectionBox title="定額醫療保險" tag={d.fixedMedical?.type} hBg="bg-blue-600" bBg="border-blue-300">
              <F label="無理賠增值" value={d.fixedMedical?.unreducedBenefit} />
              <F label="身故給付" value={d.fixedMedical?.deathBenefit} />
              <Sub label="住院" />
              <FH label="住院日額" value={d.fixedMedical?.hospitalDaily} />
              <F label="出院療養" value={d.fixedMedical?.dischargeCare} />
              <F label="加護病房" value={d.fixedMedical?.icu} />
              <F label="燒燙傷病房" value={d.fixedMedical?.burn} />
              <Sub label="門診 / 急診" />
              <F label="住院前急診" value={d.fixedMedical?.emergency} />
              <F label="救護車轉送" value={d.fixedMedical?.ambulance} />
              <F label="住院前後門診" value={d.fixedMedical?.outpatientAroundHospital} />
              <Sub label="手術" />
              <F label="住院手術" value={d.fixedMedical?.surgery} />
              <F label="門診手術" value={d.fixedMedical?.outpatientSurgery} />
              <F label="特定/重大手術" value={d.fixedMedical?.specialSurgery} />
              <F label="特定處置" value={d.fixedMedical?.specificTreatment} />
              <F label="創傷縫合" value={d.fixedMedical?.woundClosure} />
              <Sub label="其他" />
              <F label="特殊醫材補助" value={d.fixedMedical?.specialMedicalDevice} />
              <F label="住院看護" value={d.fixedMedical?.nursing} />
              <F label="住院慰問金" value={d.fixedMedical?.consolationMoney} />
              <FH label="累積給付上限" value={d.fixedMedical?.annualLimit} />
            </SectionBox>
          )}
        </div>
      )}

      {/* ── Row 3: 意外傷害 + 防癌 ──────────────── */}
      {(hasAcc || hasCan) && (
        <div className={`grid gap-2 ${hasAcc && hasCan ? "grid-cols-2" : "grid-cols-1"}`}>
          {hasAcc && (
            <SectionBox title="意外傷害險" tag={d.accident?.grade} hBg="bg-orange-500" bBg="border-orange-300">
              <F label="型態" value={d.accident?.type} />
              <F label="職等" value={d.accident?.grade} />
              <F label="大眾運輸加倍" value={d.accident?.publicAccident} />
              <Sub label="給付" />
              <FH label="意外身故/失能" value={d.accident?.deathDisability} />
              <F label="1~3 失能扶助" value={d.accident?.disabilityAssist} />
              <F label="重大燒燙傷" value={d.accident?.burnAmount} />
              <F label="意外門診實支" value={d.accident?.outpatientReimbursement} />
              <Sub label="住院" />
              <F label="住院日額" value={d.accident?.hospitalDaily} />
              <F label="加護/燒燙傷" value={d.accident?.icu} />
              <Sub label="骨折脫臼" />
              <F label="骨折未住院" value={d.accident?.fracture} />
              <F label="脫臼未住院" value={d.accident?.dislocation} />
              <FH label="累積給付上限" value={d.accident?.annualLimit} />
            </SectionBox>
          )}
          {hasCan && (
            <SectionBox title="防癌險" tag={d.cancer?.type} hBg="bg-pink-600" bBg="border-pink-300">
              <FH label="初次罹癌" value={d.cancer?.initialCancer} />
              <F label="癌症身故" value={d.cancer?.deathBenefit} />
              <Sub label="給付" />
              <F label="原位癌" value={d.cancer?.primaryCancer} />
              <F label="侵襲癌" value={d.cancer?.invasiveCancer} />
              <F label="初期癌" value={d.cancer?.earlyCancer} />
              <F label="輕度癌" value={d.cancer?.mildCancer} />
              <F label="重度癌" value={d.cancer?.severeCancer} />
              <F label="重度癌年給" value={d.cancer?.annualCancerBenefit} />
              <Sub label="住院 / 門診" />
              <F label="癌症住院日額" value={d.cancer?.hospitalDaily} />
              <F label="出院療養" value={d.cancer?.dischargeCare} />
              <F label="門診醫療" value={d.cancer?.outpatientMedical} />
              <F label="放射/化療" value={d.cancer?.radiation} />
              <F label="手術" value={d.cancer?.surgery} />
              <F label="化療與醫材" value={d.cancer?.chemotherapy} />
              <F label="骨髓移植" value={d.cancer?.boneMarrow} />
              <FH label="累積給付上限" value={d.cancer?.annualLimit} />
              {d.cancer?.waitDays && (
                <div className="text-[9px] text-stone-400 mt-0.5">※ 等待期 {d.cancer.waitDays}</div>
              )}
            </SectionBox>
          )}
        </div>
      )}

      {/* ── Row 4: 重大傷病卡 / 重特大疾病 / 長照 / 失能 ── */}
      {(hasCrit || hasMajor || hasLtc || hasDis) && (
        <div className="grid gap-2"
          style={{ gridTemplateColumns: [hasCrit, hasMajor, hasLtc, hasDis].filter(Boolean).length === 4 ? "1fr 1fr 1fr 1fr" : `repeat(${[hasCrit, hasMajor, hasLtc, hasDis].filter(Boolean).length},1fr)` }}
        >
          {hasCrit && (
            <SectionBox title="重大傷病卡" hBg="bg-violet-600" bBg="border-violet-300">
              <F label="型態" value={d.criticalIllnessCard?.type} />
              <FH label="給付金額" value={d.criticalIllnessCard?.amount} />
              {d.criticalIllnessCard?.waitDays && (
                <div className="text-[9px] text-stone-400">※ 等待期 {d.criticalIllnessCard.waitDays}</div>
              )}
            </SectionBox>
          )}
          {hasMajor && (
            <SectionBox title="重特定疾病" hBg="bg-purple-600" bBg="border-purple-300">
              <F label="型態" value={d.majorDisease?.type} />
              <F label="身故給付" value={d.majorDisease?.deathBenefit} />
              <FH label="重大疾病（7項）" value={d.majorDisease?.sevenItems} />
              <FH label="特定傷病（22項）" value={d.majorDisease?.twentyTwoItems} />
              {d.majorDisease?.waitDays && (
                <div className="text-[9px] text-stone-400">※ 等待期 {d.majorDisease.waitDays}</div>
              )}
            </SectionBox>
          )}
          {hasLtc && (
            <SectionBox title="長照險" hBg="bg-amber-500" bBg="border-amber-300">
              <F label="型態" value={d.longTermCare?.type} />
              <FH label="年給付" value={d.longTermCare?.annualBenefit} />
              <FH label="一次金" value={d.longTermCare?.lumpSum} />
              {d.longTermCare?.waitDays && (
                <div className="text-[9px] text-stone-400">※ 等待期 {d.longTermCare.waitDays}</div>
              )}
            </SectionBox>
          )}
          {hasDis && (
            <SectionBox title="失能險" hBg="bg-stone-600" bBg="border-stone-300">
              <F label="型態" value={d.disability?.type} />
              <FH label="1~6 級月給" value={d.disability?.grade1to6} />
              <F label="2~6 級一次金" value={d.disability?.grade2to6LumpSum} />
              <F label="意外加倍" value={d.disability?.accidentDouble} />
            </SectionBox>
          )}
        </div>
      )}

      {/* Empty state */}
      {!hasLife && !hasMed && !hasFixed && !hasAcc && !hasCan && !hasCrit && !hasMajor && !hasLtc && !hasDis && (
        <div className="text-center py-12 text-stone-300 text-sm">尚無保障資料</div>
      )}
    </div>
  );
}
