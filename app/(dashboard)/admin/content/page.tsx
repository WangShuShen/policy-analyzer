"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

/*
 * 內容管理（w1b-06、I3、I7、E4）：AI 問法、固定台詞與選項、醫療趨勢卡、試算參數。
 * 改完先存草稿 → 預覽跟上線版差在哪 → 自己確認後發布（顧問 10/14）。每一版留誰改、誰發布、何時。
 * 樣式沿用其他管理頁（Tailwind 後台樣式）。
 */
interface Summary { id: string; kind: string; group: string; title: string; state: "seed" | "live"; hasDraft: boolean; updatedAt: string | null }
interface Version { id: string; status: string; body: unknown; source: string | null; sourceYear: string | null; effectiveFrom: string | null; note: string | null; author: string | null; publisher: string | null; createdAt: string; publishedAt: string | null }
interface Detail { def: { id: string; kind: string; group: string; title: string; hint?: string; needsSource: boolean; hasEffectiveDate: boolean }; seed: unknown; live: Version | null; draft: Version | null; scheduled: Version[]; history: Version[] }
interface Form { body: unknown; source: string; sourceYear: string; effectiveFrom: string; note: string }

const BRAND = "#2F7A6B";
const card = "bg-white border border-[#DFE4E1] rounded-2xl shadow-sm";
const input = "w-full bg-[#F6F8F6] border border-[#CDD6D2] rounded-xl px-3 py-2 text-sm text-stone-800 focus:outline-none focus:border-[#2F7A6B]";
const label = "text-xs text-stone-500";
const taipei = (utc: string | null) => !utc ? "" : new Date(`${utc.replace(" ", "T")}Z`).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

// 試算參數的中文名稱（沒列到的顯示原欄位名）
const PARAM_LABEL: Record<string, string> = {
  inflation: "年通膨", returnRateMax: "工具試算報酬率上限",
  retirement: "退休", "retirement.medicalMonthly": "退休後醫療保健（月）", "retirement.mortgageThreshold": "住的開銷≥此數視為含房貸", "retirement.homeAfterPayoff": "房貸繳清後住的開銷", "retirement.transportRatio": "退休後交通比例",
  labor: "勞保勞退", "labor.startAge": "假設開始工作年齡", "labor.insuredMin": "投保薪資下限", "labor.insuredMax": "投保薪資上限", "labor.insuredDefault": "沒問到收入時的投保薪資",
  "labor.fullAge": "老年年金請領年齡", "labor.earliestAge": "最早提前請領年齡", "labor.adjustPerYear": "提前減給／延後增給每年", "labor.adjustMaxYears": "增減給最多年數",
  "labor.rateA": "第一式給付率", "labor.flatA": "第一式加給", "labor.rateB": "第二式給付率", "labor.minYearsForAnnuity": "年金最低年資", "labor.pensionRate": "勞退雇主提繳率", "labor.pensionWageMax": "勞退月提繳工資上限",
  estate: "遺產稅", "estate.exemption": "免稅額", "estate.spouse": "配偶扣除額", "estate.perChild": "子女每人扣除額", "estate.funeral": "喪葬扣除額", "estate.assumedChildren": "假設子女人數", "estate.giftExemptionPerYear": "贈與稅每年免稅額",
  "estate.brackets.0.upTo": "第一級距上限", "estate.brackets.0.rate": "第一級距稅率", "estate.brackets.1.upTo": "第二級距上限", "estate.brackets.1.rate": "第二級距稅率", "estate.brackets.2.rate": "最高級距稅率",
  taxSource: "稅源", "taxSource.funeralCash": "喪葬實際支出", "taxSource.procedureCost": "代書鑑價規費", "taxSource.freezeMonths": "流程月數",
  education: "教育金", "education.total": "教育金總額", "education.finishAge": "完成教育年齡",
  gapStandards: "缺口標準值", "gapStandards.disability": "失能（每月）", "gapStandards.card": "重大傷病卡", "gapStandards.reimb": "實支（每次）", "gapStandards.daily": "日額（每日）", "gapStandards.cancer": "防癌", "gapStandards.accident": "意外",
  "gapStandards.lifeDependentsBase": "壽險扶養基數", "gapStandards.lifeMinimum": "單身壽險最低", "gapStandards.maxMust": "一定要補最多幾項", "gapStandards.pairCoverMin.ltc": "長照至少多少才算涵蓋",
};

function flatten(obj: unknown, prefix = ""): [string, number][] {
  if (typeof obj === "number") return Number.isFinite(obj) ? [[prefix, obj]] : [];
  if (Array.isArray(obj)) return obj.flatMap((v, i) => flatten(v, `${prefix}.${i}`));
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  return [];
}
function setPath(obj: unknown, path: string, v: number): unknown {
  const clone = JSON.parse(JSON.stringify(obj));
  const keys = path.split(".");
  let o = clone;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)!] = v;
  return clone;
}
const show = (v: unknown) => typeof v === "string" ? v.replace(/<[^>]+>/g, "") : Array.isArray(v) ? v.join("／") : JSON.stringify(v);

function BodyEditor({ id, kind, body, onChange }: { id: string; kind: string; body: unknown; onChange: (b: unknown) => void }) {
  const b = body as Record<string, unknown>;
  if (id.startsWith("q.slot.")) {
    const backup = (b.backup as string[]) ?? [];
    return (
      <div className="space-y-3">
        <div className="space-y-1"><div className={label}>要問到什麼（給 AI 看，AI 會用自己的話問）</div>
          <textarea className={input} rows={3} value={b.ask as string} onChange={e => onChange({ ...b, ask: e.target.value })} /></div>
        <div className="space-y-1"><div className={label}>備用選項（2～4 個，每個 20 字內，不能有金額）</div>
          {backup.map((c, i) => (
            <div key={i} className="flex gap-2">
              <input className={input} value={c} maxLength={20} onChange={e => onChange({ ...b, backup: backup.map((x, j) => j === i ? e.target.value : x) })} />
              {backup.length > 2 && <button onClick={() => onChange({ ...b, backup: backup.filter((_, j) => j !== i) })} className="text-stone-400 hover:text-stone-600" aria-label="刪掉這個選項"><X className="h-4 w-4" /></button>}
            </div>
          ))}
          {backup.length < 4 && <button onClick={() => onChange({ ...b, backup: [...backup, ""] })} className="flex items-center gap-1 text-xs text-[#2F7A6B]"><Plus className="h-3.5 w-3.5" />加一個</button>}
        </div>
      </div>
    );
  }
  if (id.startsWith("q.line.")) return (
    <div className="space-y-1"><div className={label}>台詞（可用 &lt;b&gt;粗體&lt;/b&gt; 和 &lt;br&gt; 換行）</div>
      <textarea className={input} rows={4} value={b.text as string} onChange={e => onChange({ ...b, text: e.target.value })} /></div>
  );
  if (id.startsWith("q.opts.")) {
    const o = (b.options as string[]) ?? [];
    return (
      <div className="space-y-1"><div className={label}>選項文字（數量、順序不變）</div>
        {o.map((x, i) => <input key={i} className={input} value={x} maxLength={30} onChange={e => onChange({ ...b, options: o.map((y, j) => j === i ? e.target.value : y) })} />)}
      </div>
    );
  }
  if (kind === "trend") return (
    <div className="space-y-3">
      {([["title", "標題", 1], ["body", "內文", 4], ["note", "對你的意思", 4]] as const).map(([k, l, rows]) => (
        <div key={k} className="space-y-1"><div className={label}>{l}</div>
          {rows === 1 ? <input className={input} value={b[k] as string} onChange={e => onChange({ ...b, [k]: e.target.value })} />
            : <textarea className={input} rows={rows} value={b[k] as string} onChange={e => onChange({ ...b, [k]: e.target.value })} />}
        </div>
      ))}
    </div>
  );
  // 試算參數：攤平成數字欄位，依大項分組
  const fields = flatten(body);
  const groups = new Map<string, [string, number][]>();
  for (const f of fields) { const g = f[0].split(".")[0]; groups.set(g, [...(groups.get(g) ?? []), f]); }
  return (
    <div className="space-y-4">
      {[...groups].map(([g, fs]) => (
        <div key={g}>
          <div className="text-xs font-semibold text-stone-600 mb-1.5">{PARAM_LABEL[g] ?? g}</div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
            {fs.map(([path, v]) => (
              <label key={path} className="flex items-center justify-between gap-2 text-xs text-stone-600">
                <span title={path}>{PARAM_LABEL[path] ?? path}</span>
                <input className={`${input} w-32 text-right`} inputMode="decimal" defaultValue={String(v)}
                  onBlur={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n !== v) onChange(setPath(body, path, n)); }} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-stone-400">比率填小數（2% 填 0.02）。遺產稅最高級距是「以上」，不用填上限。</p>
    </div>
  );
}

function Editor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [f, setF] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ errors?: string[]; warnings?: string[]; ok?: string } | null>(null);
  const [preview, setPreview] = useState<{ changes: { path: string; from: unknown; to: unknown }[]; check: { errors: string[]; warnings: string[] } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [rev, setRev] = useState(0);   // 換整份內容（載入、填回種子、從某版改）時才重掛編輯欄位，打字時不重掛

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/content?id=${encodeURIComponent(id)}`);
    const x: Detail = await r.json();
    setD(x); setPreview(null); setMsg(null);
    const base = x.draft ?? x.live;
    setF({ body: base?.body ?? x.seed, source: base?.source ?? "", sourceYear: base?.sourceYear ?? "", effectiveFrom: x.draft?.effectiveFrom ?? "", note: x.draft?.note ?? "" });
    setRev(r => r + 1);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function post(payload: object) {
    setBusy(true);
    const r = await fetch("/api/admin/content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const j = await r.json();
    setBusy(false);
    return { ok: r.ok, j };
  }
  const save = async () => {
    const { ok, j } = await post({ action: "save", id, ...f });
    if (!ok) { setMsg({ errors: j.errors ?? [j.error], warnings: j.warnings }); return false; }
    setMsg({ ok: "草稿已存", warnings: j.warnings }); onChanged();
    const x = await (await fetch(`/api/admin/content?id=${encodeURIComponent(id)}`)).json(); setD(x);
    return true;
  };
  const openPreview = async () => {
    if (!(await save())) return;
    setPreview(await (await fetch(`/api/admin/content?id=${encodeURIComponent(id)}&preview=1`)).json());
  };
  const doPublish = async () => {
    const { ok, j } = await post({ action: "publish", id });
    if (!ok) { setMsg({ errors: [j.error] }); return; }
    onChanged(); await load(); setMsg({ ok: "已發布" });
  };
  const discard = async () => {
    if (!confirm("捨棄這份草稿？")) return;
    await post({ action: "discard", id }); onChanged(); await load();
  };
  const cancel = async (versionId: string) => {
    if (!confirm("撤下這個還沒生效的參數版本？")) return;
    const { ok, j } = await post({ action: "cancel", versionId });
    if (!ok) setMsg({ errors: [j.error] }); else await load();
  };

  if (!d || !f) return <p className="p-6 text-sm text-stone-400"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />載入中…</p>;
  const def = d.def;
  return (
    <div className="space-y-4">
      <div className={`${card} p-5 space-y-4`}>
        <div>
          <div className="text-xs text-stone-400">{def.group}・<span className="font-mono">{def.id}</span></div>
          <div className="text-base font-semibold text-stone-800 mt-0.5">{def.title}</div>
          <div className="text-xs text-stone-500 mt-1">
            目前使用：{d.live ? <>版本 {d.live.id.slice(0, 8)}（{d.live.publisher} 於 {taipei(d.live.publishedAt)} 發布{d.live.effectiveFrom ? `，${d.live.effectiveFrom} 起生效` : ""}）</> : "程式內建的種子值"}
            {d.draft && <span className="ml-2 text-amber-600">有一份草稿（{d.draft.author}，{taipei(d.draft.createdAt)}）</span>}
          </div>
          {def.hint && <p className="text-xs text-stone-400 mt-1">{def.hint}</p>}
        </div>

        <BodyEditor key={rev} id={def.id} kind={def.kind} body={f.body} onChange={body => setF({ ...f, body })} />

        {def.needsSource && (
          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <div className="space-y-1"><div className={label}>出處（N17，必填）</div><input className={input} value={f.source} placeholder="例：衛福部 113 年全民健康保險統計" onChange={e => setF({ ...f, source: e.target.value })} /></div>
            <div className="space-y-1"><div className={label}>年份</div><input className={input} value={f.sourceYear} placeholder="115" onChange={e => setF({ ...f, sourceYear: e.target.value })} /></div>
          </div>
        )}
        {def.hasEffectiveDate && (
          <div className="space-y-1 max-w-xs"><div className={label}>生效日（台灣，留空＝發布當天）</div><input type="date" className={input} value={f.effectiveFrom} onChange={e => setF({ ...f, effectiveFrom: e.target.value })} /></div>
        )}
        <div className="space-y-1"><div className={label}>這次改了什麼（之後查版本用）</div><input className={input} value={f.note} maxLength={300} onChange={e => setF({ ...f, note: e.target.value })} /></div>

        {msg && (
          <div className="text-xs space-y-0.5">
            {msg.ok && <p className="text-[#2F7A6B]">{msg.ok}</p>}
            {msg.errors?.map((e, i) => <p key={i} className="text-red-500">✕ {e}</p>)}
            {msg.warnings?.map((w, i) => <p key={i} className="text-amber-600">⚠ {w}</p>)}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} onClick={save} className="px-4 py-2 text-sm rounded-xl border border-[#CDD6D2] text-stone-600 hover:bg-stone-50 disabled:opacity-50">存草稿</button>
          <button disabled={busy} onClick={openPreview} className="px-4 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50" style={{ background: BRAND }}>預覽並發布…</button>
          {d.draft && <button disabled={busy} onClick={discard} className="px-4 py-2 text-sm rounded-xl text-stone-500 hover:bg-stone-100">捨棄草稿</button>}
          <button disabled={busy} onClick={() => { setF({ ...f, body: d.seed }); setRev(r => r + 1); }} className="px-4 py-2 text-sm rounded-xl text-stone-400 hover:bg-stone-100">填回種子值</button>
        </div>

        {preview && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2 text-sm">
            <div className="font-semibold text-stone-700">發布前確認：跟{d.live ? "目前上線版" : "種子值"}比，改了 {preview.changes.length} 處</div>
            {preview.changes.length === 0 && <p className="text-xs text-stone-500">內容沒有變。</p>}
            {preview.changes.map((c, i) => (
              <div key={i} className="text-xs"><span className="font-mono text-stone-400">{PARAM_LABEL[c.path] ?? c.path}</span>
                <div className="text-red-600 line-through">{show(c.from)}</div><div className="text-[#2F7A6B]">{show(c.to)}</div></div>
            ))}
            {preview.check.warnings.map((w, i) => <p key={i} className="text-xs text-amber-700">⚠ {w}</p>)}
            {preview.check.errors.map((e, i) => <p key={i} className="text-xs text-red-600">✕ {e}</p>)}
            <div className="flex gap-2 pt-1">
              <button disabled={busy || preview.check.errors.length > 0 || preview.changes.length === 0} onClick={doPublish} className="px-4 py-2 text-sm font-medium text-white rounded-xl disabled:opacity-50" style={{ background: BRAND }}>確認發布</button>
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm rounded-xl text-stone-500 hover:bg-white">再改改</button>
            </div>
          </div>
        )}
      </div>

      {d.scheduled.length > 0 && (
        <div className={`${card} p-4 space-y-2`}>
          <div className="text-sm font-semibold text-stone-700">已排定、還沒生效的參數版本</div>
          {d.scheduled.map(v => (
            <div key={v.id} className="flex items-center justify-between text-xs text-stone-600">
              <span>{v.effectiveFrom} 起・{v.note ?? "（沒寫說明）"}・{v.publisher} 發布</span>
              <button onClick={() => cancel(v.id)} className="text-red-500 hover:underline">撤下</button>
            </div>
          ))}
        </div>
      )}

      <div className={`${card} overflow-hidden`}>
        <div className="px-4 py-3 border-b border-[#DFE4E1] text-sm font-semibold text-stone-700">版本紀錄</div>
        {d.history.length === 0 ? <p className="p-4 text-sm text-stone-400">還沒發布過，目前用的是程式內建的種子值。</p> : (
          <table className="w-full text-xs">
            <thead><tr className="bg-[#E2EFEB]/50">{["版本", "狀態", "說明", "誰改／誰發布", "發布時間", ""].map(h => <th key={h} className="text-left px-4 py-2 font-semibold text-stone-500">{h}</th>)}</tr></thead>
            <tbody>{d.history.map(v => (
              <tr key={v.id} className="border-t border-[#DFE4E1]/60">
                <td className="px-4 py-2 font-mono text-stone-500">{v.id.slice(0, 8)}</td>
                <td className="px-4 py-2">{v.id === d.live?.id ? <span className="text-[#2F7A6B] font-medium">使用中</span> : v.status === "live" ? (v.effectiveFrom ? `${v.effectiveFrom} 起` : "已發布") : "已被取代"}</td>
                <td className="px-4 py-2 text-stone-600">{v.note ?? "—"}{v.source && <div className="text-stone-400">出處：{v.source}（{v.sourceYear}）</div>}</td>
                <td className="px-4 py-2 text-stone-600">{v.author}／{v.publisher}</td>
                <td className="px-4 py-2 text-stone-500 whitespace-nowrap">{taipei(v.publishedAt)}</td>
                <td className="px-4 py-2"><button onClick={() => { setF({ body: v.body, source: v.source ?? "", sourceYear: v.sourceYear ?? "", effectiveFrom: "", note: `還原成 ${v.id.slice(0, 8)}` }); setRev(r => r + 1); setPreview(null); setMsg({ ok: "已帶入這一版，存草稿後再發布" }); }} className="text-[#2F7A6B] hover:underline whitespace-nowrap">從這版改</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function ContentPage() {
  const [items, setItems] = useState<Summary[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(async () => { const r = await fetch("/api/admin/content"); if (r.ok) setItems((await r.json()).items); }, []);
  useEffect(() => { load(); }, [load]);
  const groups = useMemo(() => {
    const m = new Map<string, Summary[]>();
    for (const i of items ?? []) if (!q || i.title.includes(q) || i.id.includes(q)) m.set(i.group, [...(m.get(i.group) ?? []), i]);
    return [...m];
  }, [items, q]);

  return (
    <div className="max-w-6xl space-y-4">
      <p className="text-sm text-stone-400">改 AI 問法、固定台詞與選項、醫療趨勢卡、試算參數。存草稿 → 預覽差異 → 發布才會生效；每一版都留紀錄。分支結構與順序不在這裡改（I7）。</p>
      <div className="grid md:grid-cols-[300px_1fr] gap-4 items-start">
        <div className={`${card} overflow-hidden`}>
          <div className="p-3 border-b border-[#DFE4E1]"><input className={input} placeholder="搜尋" value={q} onChange={e => setQ(e.target.value)} /></div>
          {!items ? <p className="p-4 text-sm text-stone-400"><Loader2 className="inline h-4 w-4 animate-spin mr-1" />載入中…</p> : (
            <div className="max-h-[70vh] overflow-y-auto">
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div className="px-3 py-2 text-xs font-semibold text-stone-500 bg-[#E2EFEB]/50 sticky top-0">{g}（{list.length}）</div>
                  {list.map(i => (
                    <button key={i.id} onClick={() => setSel(i.id)} className={`w-full text-left px-3 py-2 text-sm border-b border-[#DFE4E1]/60 hover:bg-stone-50 ${sel === i.id ? "bg-[#E2EFEB]" : ""}`}>
                      <div className="text-stone-700 truncate">{i.title}</div>
                      <div className="text-[11px] text-stone-400 flex gap-2">
                        {i.state === "live" ? <span className="text-[#2F7A6B]">已改過</span> : <span>種子</span>}
                        {i.hasDraft && <span className="text-amber-600">有草稿</span>}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {sel ? <Editor key={sel} id={sel} onChanged={load} /> : <div className={`${card} p-8 text-sm text-stone-400 text-center`}>從左邊選一個項目來改。</div>}
      </div>
    </div>
  );
}
