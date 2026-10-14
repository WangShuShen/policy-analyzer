"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATEGORIES, COVERS, LIMITS } from "@/lib/news/constants";
import { renderMarkdown } from "@/lib/news/markdown";

/*
 * 快訊管理（W3、N3；設計稿 tmp/w3-mock/admin.html 顧問 10/14 核可）。
 * 左：文章清單＋狀態；右：編輯稿、送審前檢查、Google 預覽；送審後下方出現審核區（通過／退回＋意見）與審核紀錄。
 * 顧問 10/14：只有一位管理者，自己寫的自己審可以，紀錄照留。
 */
type Stage = "draft" | "pending" | "live" | "live_editing" | "live_pending" | "off";
interface Row { id: string; slug: string; title: string; category: string; stage: Stage; updatedAt: string; publishedAt: string | null }
interface Art { slug: string; title: string; summary: string; body: string; category: string; cover: string; sources: string }
interface Review { id: string; action: string; note: string | null; at: string; actor: string }
interface Check { errors: string[]; warnings: string[] }

const STAGE: Record<Stage, [string, string]> = {
  draft: ["草稿", "draft"], pending: ["待審", "pending"], live: ["已發布", "live"],
  live_editing: ["已發布·修改中", "draft"], live_pending: ["已發布·新版待審", "pending"], off: ["已下架", "off"],
};
const ACTION: Record<string, string> = { create: "建立草稿", edit: "修改", submit: "送審", withdraw: "撤回送審", approve: "審核通過", reject: "退回修改", unpublish: "下架" };
const TABS: [string, (s: Stage) => boolean][] = [
  ["全部", () => true], ["待審", s => s === "pending" || s === "live_pending"], ["草稿", s => s === "draft" || s === "live_editing"],
  ["已發布", s => s.startsWith("live")], ["下架", s => s === "off"],
];
const EMPTY: Art = { slug: "", title: "", summary: "", body: "", category: CATEGORIES[0], cover: "i-doc", sources: "" };
const tw = (utc: string) => new Date(utc.replace(" ", "T") + "Z").toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });

async function call(body: object) {
  const r = await fetch("/api/admin/news", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: r.ok, j: await r.json().catch(() => ({})) };
}

export default function NewsAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState(0);
  const [sel, setSel] = useState<string | "new" | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/news"); if (r.ok) setRows((await r.json()).articles); }, []);
  useEffect(() => { load(); }, [load]);
  const list = (rows ?? []).filter(r => TABS[tab][1](r.stage));
  const pending = (rows ?? []).filter(r => TABS[1][1](r.stage)).length;
  return (
    <div className="nw-adm">
      <div className="nw-al">
        <div className="nw-alh"><b>文章（{rows?.length ?? "…"}）</b><button className="nw-new" onClick={() => setSel("new")}>＋ 新文章</button></div>
        <div className="nw-tabs">{TABS.map(([t], i) => <button key={t} className={`nw-tab ${tab === i ? "on" : ""}`} onClick={() => setTab(i)}>{t}{i === 1 && pending ? ` ${pending}` : ""}</button>)}</div>
        {rows && !list.length && <div className="nw-ar" style={{ cursor: "default", color: "var(--muted)", fontSize: 12.5 }}>沒有文章</div>}
        {list.map(r => (
          <button key={r.id} className={`nw-ar ${sel === r.id ? "on" : ""}`} onClick={() => setSel(r.id)}>
            <span className="t">{r.title}</span>
            <span className="m"><span className={`pill ${STAGE[r.stage][1]}`}>{STAGE[r.stage][0]}</span><span>{tw(r.updatedAt)} 更新</span></span>
          </button>
        ))}
      </div>
      <div>
        {sel ? <Editor key={sel} id={sel === "new" ? null : sel} onChange={async id => { await load(); if (id) setSel(id); }} />
          : <div className="nw-ed" style={{ color: "var(--muted)" }}>選左邊一篇文章，或按「＋ 新文章」開始寫。寫好送審，審核通過才會出現在 /news。</div>}
      </div>
    </div>
  );
}

function Editor({ id, onChange }: { id: string | null; onChange: (id?: string) => Promise<void> }) {
  const [a, setA] = useState<Art>(EMPTY);
  const [stage, setStage] = useState<Stage>("draft");
  const [published, setPublished] = useState(false);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [check, setCheck] = useState<Check>({ errors: [], warnings: [] });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!id) return;
    const r = await fetch(`/api/admin/news?id=${id}`);
    if (!r.ok) { setErr("讀不到這篇文章"); return; }
    const d = await r.json();
    const x = d.article;
    setA({ slug: x.slug, title: x.title, summary: x.summary, body: x.body, category: x.category, cover: x.cover, sources: x.sources ?? "" });
    setStage(x.stage); setPublished(!!x.published_at); setReviews(d.reviews); setCheck(d.check); setDirty(false);
  }, [id]);
  useEffect(() => { reload(); }, [reload]);

  const set = (k: keyof Art, v: string) => {
    const next = { ...a, [k]: v };
    setA(next); setDirty(true); setMsg(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => { const r = await call({ action: "check", article: next }); if (r.ok) setCheck(r.j); }, 600);
  };
  const run = async (body: object, done: string) => {
    setBusy(true); setErr(null); setMsg(null);
    const r = await call(body);
    setBusy(false);
    if (!r.ok) { setErr(r.j.error ?? r.j.errors?.join("；") ?? "沒有成功"); return false; }
    setMsg(done); setNote("");
    if (r.j.id) { await onChange(r.j.id); return true; }
    await reload(); await onChange();
    return true;
  };
  const save = () => id ? run({ action: "update", id, article: a }, "已存草稿") : run({ action: "create", article: a }, "已建立草稿");
  const locked = stage === "pending" || stage === "live_pending";
  const canSubmit = !!id && !dirty && (stage === "draft" || stage === "live_editing" || stage === "off");

  return (
    <>
      <div className="nw-ed">
        <div className="nw-edh">
          <div>
            <span className={`pill ${STAGE[stage][1]}`}>{id ? STAGE[stage][0] : "新文章"}</span>{" "}
            <span className="s">{locked ? "送審中內容鎖住；要改請先「撤回送審」" : stage.startsWith("live") ? "公開頁顯示的是審核通過的版本；這裡改完要再送審才會換上" : "存草稿後可以送審"}</span>
          </div>
          {a.slug && <div className="s">網址：/news/{a.slug}</div>}
        </div>
        {err && <div className="nw-err">{err}</div>}
        {msg && <div className="nw-chk" style={{ marginBottom: 12 }}><span className="ok">✓</span> {msg}</div>}
        <div className="nw-f"><label>標題 <span>{a.title.length} / {LIMITS.title} 字</span></label>
          <input className="nw-in" value={a.title} disabled={locked} onChange={e => set("title", e.target.value)} /></div>
        <div className="nw-f"><label>摘要（列表、Google 搜尋結果、分享到 LINE／FB 會用這段）<span>{a.summary.length} / {LIMITS.summary} 字</span></label>
          <textarea className="nw-in" rows={2} value={a.summary} disabled={locked} onChange={e => set("summary", e.target.value)} /></div>
        <div className="nw-2">
          <div className="nw-f"><label>分類</label>
            <select className="nw-in" value={a.category} disabled={locked} onChange={e => set("category", e.target.value)}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
          <div className="nw-f"><label>網址代稱 <span>{published ? "發布過不能改" : "小寫英文、數字、-"}</span></label>
            <input className="nw-in" value={a.slug} disabled={locked || published} placeholder="insurance-passbook-how-to" onChange={e => set("slug", e.target.value.toLowerCase())} /></div>
          <div className="nw-f"><label>封面圖示（分享圖會自動用標題＋這個圖示）</label>
            <div className="nw-covers">{COVERS.map(c => (
              <button key={c} type="button" className={`nw-cv ${a.cover === c ? "on" : ""}`} disabled={locked} onClick={() => set("cover", c)} aria-label={c}>
                <svg viewBox="0 0 48 48" width="28" height="28" aria-hidden="true"><use href={`#${c}`} /></svg>
              </button>))}</div></div>
        </div>
        <div className="nw-f">
          <label>內文（Markdown：## 小標、**粗體**、- 清單、1. 編號、| 表格 |、&gt; 提示框）
            <button type="button" className="nw-tab" onClick={() => setPreview(!preview)}>{preview ? "◂ 回到編輯" : "預覽 ▸"}</button></label>
          {preview
            ? <div className="nw-in nw-body" style={{ maxHeight: 520, overflow: "auto", fontSize: 15 }} dangerouslySetInnerHTML={{ __html: renderMarkdown(a.body) }} />
            : <textarea className="nw-in" rows={16} value={a.body} disabled={locked} onChange={e => set("body", e.target.value)} />}
        </div>
        <div className="nw-f"><label>資料來源（N17：有統計數字就一定要寫出處＋年份）<span>{a.sources.length} / {LIMITS.sources} 字</span></label>
          <input className="nw-in" value={a.sources} disabled={locked} placeholder="例：壽險公會「保險存摺問答集」（2026 年 10 月查閱）" onChange={e => set("sources", e.target.value)} /></div>
        <div className="nw-chk">
          <b>送審前自動檢查</b><br />
          {!check.errors.length && !check.warnings.length && <><span className="ok">✓</span> 沒有發現問題（公司名稱 4-aj／N13、出處 N17、長度都過）</>}
          {check.errors.map(e => <div key={e}><span style={{ color: "var(--must)", fontWeight: 700 }}>✗</span> {e}</div>)}
          {check.warnings.map(w => <div key={w}><span className="warn">！</span> {w}</div>)}
        </div>
        <div className="nw-f"><label>Google 搜尋結果預覽</label>
          <div className="nw-gp"><div className="u">RADIA › news › {a.slug || "…"}</div><div className="t">{a.title || "標題"} | RADIA</div><div className="d">{a.summary || "摘要"}</div></div></div>
        <div className="nw-acts">
          {id && <a className="nw-b" href={`/news/preview/${id}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>先看公開版長怎樣</a>}
          {!locked && <button className="nw-b" disabled={busy || (!dirty && !!id)} onClick={save}>{id ? "存草稿" : "建立草稿"}</button>}
          {locked && <button className="nw-b" disabled={busy} onClick={() => run({ action: "withdraw", id }, "已撤回，可以繼續改")}>撤回送審</button>}
          {!locked && id && <button className="nw-b pri" disabled={busy || !canSubmit || check.errors.length > 0} title={dirty ? "先存草稿" : check.errors.length ? "先把 ✗ 的問題改掉" : ""}
            onClick={() => run({ action: "submit", id }, "已送審")}>送審</button>}
        </div>
      </div>

      {id && (locked || stage.startsWith("live")) && (
        <div className="nw-rv">
          {locked ? (
            <>
              <h4>審核這篇</h4>
              <div className="nw-f"><label>審核意見（退回時必填，會給寫的人看）</label>
                <textarea className="nw-in" rows={2} value={note} placeholder="例：第二段的費用請再查一次官網" onChange={e => setNote(e.target.value)} /></div>
              <div className="nw-acts" style={{ borderTop: 0, paddingTop: 0 }}>
                <button className="nw-b bad" disabled={busy || !note.trim()} onClick={() => run({ action: "reject", id, note }, "已退回")}>退回修改</button>
                <button className="nw-b pri" disabled={busy} onClick={() => run({ action: "approve", id, note }, stage === "live_pending" ? "已通過，公開頁換成新版" : "已通過並發布")}>
                  {stage === "live_pending" ? "審核通過，換上新版" : "審核通過，立刻發布"}</button>
              </div>
            </>
          ) : (
            <>
              <h4>這篇目前公開中</h4>
              <div className="nw-f"><label>下架原因（必填，會記在審核紀錄）</label>
                <input className="nw-in" value={note} placeholder="例：法規已修改，內容過時" onChange={e => setNote(e.target.value)} /></div>
              <div className="nw-acts" style={{ borderTop: 0, paddingTop: 0 }}>
                <a className="nw-b" href={`/news/${a.slug}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>看公開頁</a>
                <button className="nw-b bad" disabled={busy || !note.trim()} onClick={() => confirm("確定下架？公開頁會立刻看不到。") && run({ action: "unpublish", id, note }, "已下架")}>下架</button>
              </div>
            </>
          )}
          <Log reviews={reviews} />
        </div>
      )}
      {id && !locked && !stage.startsWith("live") && reviews.length > 0 && <div className="nw-rv" style={{ background: "var(--surface)", borderColor: "var(--hair)" }}><h4>審核紀錄</h4><Log reviews={reviews} /></div>}
    </>
  );
}

function Log({ reviews }: { reviews: Review[] }) {
  return (
    <>
      <ul className="nw-log">{reviews.map(r => (
        <li key={r.id}><time>{tw(r.at)}</time><span><b>{r.actor}</b> {ACTION[r.action] ?? r.action}{r.note ? `：「${r.note}」` : ""}</span></li>
      ))}</ul>
      <div className="nw-note">每一步同時寫進查閱紀錄（稽核）。下架後可以修改再送審，審核通過就重新上架。</div>
    </>
  );
}
