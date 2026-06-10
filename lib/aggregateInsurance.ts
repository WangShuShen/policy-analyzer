type Rec = Record<string, unknown>;

function extractNum(val?: string): { n: number; sfx: string } | null {
  if (!val) return null;
  const s = val.split("｜")[0].trim().replace(/[,，]/g, "");
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^([\d.]+)萬\/(月|年|次)$/))) return { n: +m[1], sfx: `萬/${m[2]}` };
  if ((m = s.match(/^([\d.]+)萬$/)))              return { n: +m[1], sfx: "萬" };
  if ((m = s.match(/^(\d+)元\/日/)))              return { n: +m[1], sfx: "元/日" };
  if ((m = s.match(/^(\d+)元\/次/)))              return { n: +m[1], sfx: "元/次" };
  if ((m = s.match(/^(\d+)元\/月/)))              return { n: +m[1], sfx: "元/月" };
  if ((m = s.match(/^(\d+)元\/年/)))              return { n: +m[1], sfx: "元/年" };
  if ((m = s.match(/^最高([\d.]+)萬/)))           return { n: +m[1], sfx: "萬" };
  if ((m = s.match(/^([\d.]+)萬元/)))             return { n: +m[1], sfx: "萬" };
  return null;
}

function sumField(vals: (string | undefined)[]): string | undefined {
  const nonEmpty = vals.filter(Boolean) as string[];
  if (nonEmpty.length === 0) return undefined;
  if (nonEmpty.length === 1) return nonEmpty[0];

  let total = 0;
  let sfx = "";
  const notes: string[] = [];

  for (const val of nonEmpty) {
    const noteParts = val.split("｜").slice(1).map(s => s.trim()).filter(Boolean);
    noteParts.forEach(n => { if (!notes.includes(n)) notes.push(n); });

    const parsed = extractNum(val);
    if (!parsed) return `${nonEmpty[0]}（共${nonEmpty.length}張）`;
    total += parsed.n;
    if (!sfx) sfx = parsed.sfx;
  }

  if (total === 0) return nonEmpty[0];

  const fmt =
    sfx === "萬" || sfx.startsWith("萬/")
      ? `${total}${sfx}`
      : `${Math.round(total).toLocaleString()}${sfx}`;

  const noteStr = [...new Set(notes)].slice(0, 2).join("、");
  return noteStr
    ? `${fmt}｜${noteStr}（${nonEmpty.length}張合計）`
    : `${fmt}（${nonEmpty.length}張合計）`;
}

function mergeSection(sections: (Rec | undefined)[], sumKeys: string[]): Rec | undefined {
  const valid = sections.filter(Boolean) as Rec[];
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];

  const result: Rec = {};
  const allKeys = [...new Set(valid.flatMap(s => Object.keys(s)))];

  for (const key of allKeys) {
    if (key === "extras") {
      const allExtras = valid.flatMap(s => (s.extras as { label: string; value: string }[] | undefined) ?? []);
      if (allExtras.length) result.extras = allExtras;
      continue;
    }
    if (sumKeys.includes(key)) {
      result[key] = sumField(valid.map(s => s[key] as string | undefined));
    } else {
      result[key] = valid.find(s => s[key] != null)?.[key];
    }
  }

  return result;
}

export function aggregatePolicies(policies: Rec[]): Rec {
  const ps = policies.filter(Boolean);
  if (ps.length === 0) return {};
  if (ps.length === 1) return ps[0];

  const get = (k: string) => ps.map(p => p[k] as Rec | undefined);

  return {
    company: ps.map(p => (p.company as string) || "").filter(Boolean).slice(0, 3).join(" + ") || undefined,
    policyName: `${ps.length} 張保單 · 合計`,

    life: mergeSection(get("life"), ["amount"]),

    medicalReimbursement: mergeSection(get("medicalReimbursement"), [
      "hospitalRoom","icu","burn","miscMedical","surgery","outpatientSurgery",
      "specialTreatment","dischargeCare","transferRoom","annualLimit",
    ]),

    fixedMedical: mergeSection(get("fixedMedical"), [
      "hospitalDaily","dischargeCare","icu","burn","emergency","ambulance",
      "outpatientAroundHospital","surgery","outpatientSurgery","specialSurgery",
      "specificTreatment","woundClosure","specialMedicalDevice","nursing",
      "consolationMoney","annualLimit",
    ]),

    accident: mergeSection(get("accident"), [
      "deathDisability","disabilityAssist","burnAmount","outpatientReimbursement",
      "hospitalDaily","icu","burn","outpatientSurgery","fracture","dislocation","annualLimit",
    ]),

    cancer: mergeSection(get("cancer"), [
      "initialCancer","deathBenefit","primaryCancer","invasiveCancer","earlyCancer",
      "mildCancer","severeCancer","annualCancerBenefit","hospitalDaily","dischargeCare",
      "outpatientMedical","radiation","surgery","chemotherapy","boneMarrow",
      "prosthetics","dentures","annualLimit",
    ]),

    criticalIllnessCard: mergeSection(get("criticalIllnessCard"), ["amount"]),

    majorDisease: mergeSection(get("majorDisease"), ["sevenItems","twentyTwoItems"]),

    longTermCare: mergeSection(get("longTermCare"), ["annualBenefit","lumpSum"]),

    disability: mergeSection(get("disability"), ["grade1to6","grade2to6LumpSum","accidentDouble"]),
  };
}
