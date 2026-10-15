"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { safeHtml } from "@/lib/consult/safeHtml";
import type { Snapshot } from "@/lib/consult/service";
import { AnalysisPanels } from "./AnalysisPanels";
import { PassbookUpload } from "./PassbookUpload";
import { PAUSED_TEXT } from "@/lib/consult/paused";

/*
 * AI 諮詢畫面（原型 v37 的 chat：左對話／右「我的保障」、4-t／4-v）。
 * 新訊息一則一則出來、AI 說話前有輸入中的點點——動畫是用來控制節奏，不是裝飾（4-s）。
 */

type Msg = Snapshot["messages"][number];
type Fact = Snapshot["facts"][number];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function ConsultChat({ name }: { name: string }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [shown, setShown] = useState(0);              // 已經顯示到第幾則（動畫用）
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"chat" | "panel">("chat");
  const [list, setList] = useState<{ id: string; title: string; status: string; lastActiveAt: string }[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const streamRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);                      // 使用者沒往上翻 → 版面變動時保持在最下面

  // 新訊息一則一則出來；使用者自己的訊息立刻出現
  const reveal = useCallback(async (next: Snapshot, from: number) => {
    setSnap(next);
    for (let i = from; i < next.messages.length; i++) {
      const m = next.messages[i];
      if (m.role === "assistant" && m.content.kind !== "panel") {
        setTyping(true); await sleep(m.content.kind === "trend" ? 700 : 450); setTyping(false);
      }
      setShown(i + 1);
      await sleep(m.content.kind === "trend" ? 500 : 120);
    }
  }, []);

  useEffect(() => {
    // 從「我的分析」點「回到對話」會帶 ?id=，打開那一段；否則接最近沒聊完的
    const id = new URLSearchParams(window.location.search).get("id");
    fetch(id ? `/api/consult?id=${encodeURIComponent(id)}` : "/api/consult").then(async r => {
      const j = await r.json();
      if (!r.ok) { setError(j.error ?? "載入失敗"); return; }
      setSnap(j); setShown(j.messages.length);      // 舊訊息直接顯示，不重播動畫
    }).catch(() => setError("連線失敗，請重新整理"));
  }, []);

  // 存摺狀態變了（讀好、確認完、對完版本）→ 只更新右欄，不重播對話
  const convId = snap?.conversation.id;
  useEffect(() => {
    if (!convId) return;
    const onChange = async () => {
      const r = await fetch(`/api/consult?id=${encodeURIComponent(convId)}`).catch(() => null);
      if (!r?.ok) return;
      const j = await r.json();
      setSnap(prev => prev && prev.conversation.id === j.conversation.id ? { ...prev, analysis: j.analysis, facts: j.facts } : prev);
    };
    window.addEventListener("passbook:changed", onChange);
    return () => window.removeEventListener("passbook:changed", onChange);
  }, [convId]);

  // 新訊息、選項出現、從紀錄切回來 → 捲到最下面
  const pendingKey = snap ? `${snap.pending.kind}:${snap.pending.ask?.stepId ?? ""}` : "";
  useEffect(() => {
    stickRef.current = true;
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing, pendingKey, list]);

  // 一屏版面（10/15 顧問實測：電腦要捲整頁才找得到輸入框）：
  // 對話區高度會跟著底部輸入列、手機鍵盤變；原本在最下面就維持在最下面
  useEffect(() => {
    const el = streamRef.current; if (!el) return;
    const onScroll = () => { stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; };
    const ro = new ResizeObserver(() => { if (stickRef.current) el.scrollTop = el.scrollHeight; });
    el.addEventListener("scroll", onScroll, { passive: true }); ro.observe(el);
    return () => { el.removeEventListener("scroll", onScroll); ro.disconnect(); };
  }, [snap === null, list]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 底部輸入列的高度給開發版回饋鈕用（放在輸入列上面，不擋「送出」）
  useEffect(() => {
    const el = dockRef.current, root = document.documentElement; if (!el) return;
    const ro = new ResizeObserver(() => root.style.setProperty("--ddock-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--ddock-h"); };
  }, [snap === null, list]);   // eslint-disable-line react-hooks/exhaustive-deps

  // 手機鍵盤彈出：iOS 的 100dvh 不會扣掉鍵盤 → 用 visualViewport 的高度，輸入框才會貼在鍵盤上面
  useEffect(() => {
    const vv = window.visualViewport, root = document.documentElement; if (!vv) return;
    const fit = () => { root.style.setProperty("--vvh", `${Math.round(vv.height)}px`); if (vv.offsetTop > 0) window.scrollTo(0, 0); };
    fit();
    vv.addEventListener("resize", fit); vv.addEventListener("scroll", fit);
    return () => { vv.removeEventListener("resize", fit); vv.removeEventListener("scroll", fit); root.style.removeProperty("--vvh"); };
  }, []);

  const send = async (body: Record<string, unknown>, optimistic?: string) => {
    if (!snap || busy) return;
    setBusy(true); setError("");
    const before = snap.messages.length;
    if (optimistic) {   // 使用者的話先顯示，不等伺服器
      const temp: Msg = { id: "temp", role: "user", content: { kind: "user", text: optimistic }, createdAt: "" };
      setSnap({ ...snap, messages: [...snap.messages, temp], pending: { kind: "done" } }); setShown(before + 1);
      setTyping(true);
    }
    try {
      const r = await fetch("/api/consult/turn", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: snap.conversation.id, ...body }) });
      const j = await r.json();
      setTyping(false);
      if (r.status === 409 && j.snapshot) { setSnap(j.snapshot); setShown(j.snapshot.messages.length); return; }
      if (!r.ok) { setError(j.error ?? "沒送出去，請再試一次"); setSnap(snap); setShown(before); return; }
      // N7：今天先停——伺服器沒收這一句，直接換成目前的畫面（只剩約顧問）
      if (j.paused && j.messages.length <= before) { setSnap(j); setShown(j.messages.length); return; }
      await reveal(j, optimistic ? before + 1 : before);
    } catch {
      setTyping(false); setError("連線失敗，請再試一次"); setSnap(snap); setShown(before);
    } finally { setBusy(false); }
  };

  const pick = (i: number) => {
    const ask = snap?.pending.ask; if (!ask) return;
    // 4-ai：想約顧問的人不擋——AI 給的「先不說，直接約」「先去約顧問」直接帶去約（講過的都已經存好了）
    if (/直接約|去約顧問|現在去約/.test(ask.options[i])) { window.location.href = "/advisors"; return; }
    send({ stepId: ask.stepId, option: i }, ask.options[i]);
  };
  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim(); const ask = snap?.pending.ask;
    if (!t || !ask) return;
    setText(""); send({ stepId: ask.stepId, text: t }, t);
  };
  const skipUpload = () => {
    if (snap?.pending.uploadStepId) send({ stepId: snap.pending.uploadStepId, skipUpload: true });
  };

  const editFact = async (key: string, option: number) => {
    if (!snap) return;
    setEditing(null);
    const r = await fetch("/api/consult/fact", { method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: snap.conversation.id, key, option }) });
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    const before = snap.messages.length; await reveal(j, before);
  };

  const openList = async () => {
    if (list) { setList(null); return; }
    const r = await fetch("/api/consult?list=1"); const j = await r.json();
    setList(j.conversations ?? []);
  };
  const openConv = async (id: string | null) => {
    setList(null);
    const r = id ? await fetch(`/api/consult?id=${id}`) : await fetch("/api/consult", { method: "POST", body: "{}" });
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    if (id) { setSnap(j); setShown(j.messages.length); } else { setSnap({ ...j, messages: [] }); setShown(0); await reveal(j, 0); }
  };

  if (error && !snap) return <div className="rd-err">{error}</div>;
  if (!snap) return <div className="rd-loading">載入中…</div>;

  const visible = snap.messages.slice(0, shown);
  // 右欄只畫已經「出場」的區塊——動畫還沒播到的先不出現
  const shownPanels = new Set(visible.flatMap(m => m.content.kind === "panel" ? [m.content.key] : []));
  const analysis = {
    ...snap.analysis,
    open: snap.analysis.open.filter(p => shownPanels.has(p.key)),
    locked: snap.analysis.locked.filter(l => shownPanels.has(l.key)),
    headlines: snap.analysis.headlines.filter(h => shownPanels.has(h.key)),
  };
  const animating = shown < snap.messages.length || typing;
  const paused = !animating && snap.paused && snap.pending.kind === "ask";
  const ask = !animating && !snap.paused && snap.pending.kind === "ask" ? snap.pending.ask : null;
  const hasPanel = snap.facts.length > 0 || analysis.open.length > 0 || analysis.locked.length > 0;
  const done = snap.pending.kind === "done";
  const lastActive = snap.conversation.status === "done" ? "聊完了" : "進行中";

  return (
    <div className="dmo">
      {/* 一屏：標題縮成一行、步驟條放旁邊，把高度留給對話 */}
      <div className="dhead">
        <div className="dhead-t">
          <h2 className="t">我們先聊聊</h2>
          <p className="sub">我不賣東西，只幫你把狀況弄清楚。想到哪講到哪，<b>不用先準備什麼</b>。</p>
        </div>
        <div className="dsteps">{DPH.map((t, i) => (
          <span key={t} className={`dst ${i < snap.phase || (done && i === snap.phase) ? "ok" : i === snap.phase ? "on" : ""}`}><i />{["①", "②", "③"][i]} {t}</span>
        ))}</div>
      </div>
      <div className="dtabs">
        <button className="dtb" aria-pressed={tab === "chat"} onClick={() => setTab("chat")}>對話</button>
        <button className="dtb" aria-pressed={tab === "panel"} onClick={() => setTab("panel")}>我的保障{snap.facts.length ? <span className="dbadge">{snap.facts.length}</span> : null}</button>
      </div>

      <div className={`dsplit ${hasPanel ? "has" : ""} ${panelOpen ? "open" : ""}`}>
        <div className={`dleft ${tab === "chat" ? "" : "dhide"}`}>
          <div className="cvbar">
            <div style={{ minWidth: 0 }}>
              <div className="cvt">{snap.conversation.title}</div>
              <div className="cvd">{lastActive}</div>
            </div>
            {/* 右欄收起來時，打開的按鈕跟「過去的對話」放同一列（原型的 dpill 是浮在對話右上角） */}
            {hasPanel && !panelOpen && <button className="dpillb" onClick={() => setPanelOpen(true)}>⟨ 我的保障{snap.facts.length ? `（${snap.facts.length}）` : ""}</button>}
            <button className="cvb" onClick={openList}>{list ? "收起紀錄" : "過去的對話"}</button>
          </div>
          {list ? (
            <div className="cvlist">
              {list.map(c => (
                <button key={c.id} className={`cvi ${c.id === snap.conversation.id ? "on" : ""}`} onClick={() => openConv(c.id)}>
                  <div className="cvih"><span className="cvin">{c.title}</span><span className={`cvis ${c.status === "active" ? "live" : ""}`}>{c.status === "done" ? "聊完了" : "聊到一半"}</span></div>
                  <div className="cvim">{c.lastActiveAt.slice(0, 10)}</div>
                </button>
              ))}
              <button className="cvnew" onClick={() => openConv(null)}>＋ 開一個新的對話</button>
            </div>
          ) : (
            <>
              <div className="dchat" ref={streamRef} aria-live="polite">
                {visible.map(m => <Bubble key={m.id} m={m} />)}
                {typing && <div className="acm ai tp"><span className="aitype"><i /><i /><i /></span></div>}
                {/* 上傳框是對話的一部分，放在對話區裡跟著捲，不佔底部輸入列 */}
                {snap.pending.kind === "upload" && !animating && (
                  <PassbookUpload conversationId={snap.conversation.id} busy={busy} onSkip={skipUpload}
                    onUploaded={() => { if (snap.pending.uploadStepId) void send({ stepId: snap.pending.uploadStepId, uploaded: true }); }} />
                )}
              </div>
              {/* 底部輸入列：選項＋輸入框＋送出永遠在畫面底部 */}
              <div className="ddock" ref={dockRef}>
                {ask && <div className="dopts">{ask.options.map((o, i) => <button key={i} className="dopt" onClick={() => pick(i)} disabled={busy}>{o}</button>)}</div>}
                {error && <div className="rd-err">{error}</div>}
                {/* N7：今天 AI 用量到上限——選項和輸入先收起來，只留約顧問；講過的都在，台灣時間 0 點自動恢復 */}
                {paused && <div className="askadv"><span>{PAUSED_TEXT}</span><a className="askadvb" href="/advisors">預約顧問</a></div>}
                <form className="dinp" onSubmit={submitText} autoComplete="off">
                  <input className="dinf" value={text} onChange={e => setText(e.target.value)} maxLength={1000} enterKeyHint="send"
                    placeholder={ask ? "上面挑一個，或自己打" : paused ? "明天再來接著聊" : done ? "這段聊完了" : "等我說完…"} disabled={!ask || busy} aria-label="輸入你的回答" />
                  <button className="dins" type="submit" disabled={!ask || busy || !text.trim()}>送出</button>
                </form>
                <div className="dinn">
                  <span>{done ? "這段聊完了，整理出來的結果在「我的保障」，也可以到上方「我的分析」看。" : `嗨 ${name}，這裡的對話只有你和你之後選的顧問看得到。`}</span>
                  {/* 4-y：預約入口全程常駐，不用聊完；前面講的一起帶給顧問（10/15 縮成一行小字，不佔對話高度） */}
                  {!paused && <a className="dadv" href="/advisors" title="不用聊完也可以先約——你到目前講的都會一起帶給顧問">想直接問人？<b>約顧問</b> ›</a>}
                </div>
              </div>
            </>
          )}
        </div>

        <aside className={`dright ${tab === "panel" ? "" : "dhide"}`}>
          <div className="dpbar"><span className="dpbt">我的保障</span>
            <span className="dpbn">{snap.facts.length} 項需求</span>
            <button className="dpbx" onClick={() => setPanelOpen(false)}>收合 ⟩</button></div>
          {snap.facts.length > 0 && (
            <div className="dpan"><div className="dph"><span className="dpt">你說的事</span><span className="dpn">{snap.facts.length} 項</span></div>
              <div className="ndl">{snap.facts.map(f => (
                <FactRow key={f.key} f={f} editing={editing === f.key} onEdit={() => setEditing(editing === f.key ? null : f.key)} onPick={i => editFact(f.key, i)} />
              ))}</div>
              {analysis.open.length === 0 && <div className="gprn" style={{ marginTop: 10 }}>這些不是表單欄位，是<b>你自己講出來的</b>。<br />後面的判斷全部從這裡長出來。不對的話點「改」。</div>}
            </div>
          )}
          <AnalysisPanels a={analysis} />
          {(analysis.open.length > 0 || analysis.locked.length > 0) && <div className="dnote" style={{ margin: "4px auto 0", display: "table" }}>📌 結果也整理在上方的「我的分析」，之後隨時回來看</div>}
        </aside>
      </div>
    </div>
  );
}

const DPH = ["聊出需求", "看現況", "補強建議"];

function Bubble({ m }: { m: Msg }) {
  const c = m.content;
  if (c.kind === "user") return <div className="acm me">{c.text}</div>;
  if (c.kind === "ai") return <div className="acm ai" dangerouslySetInnerHTML={{ __html: safeHtml(c.html) }} />;
  if (c.kind === "trend") return (
    <div className="trd dfx">
      <div className="trdh">📈 醫療現況</div>
      <div className="trdt">{c.title}</div>
      <div className="trdd">{c.body}</div>
      <div className="trdp" dangerouslySetInnerHTML={{ __html: safeHtml(c.forYou) }} />
    </div>
  );
  if (c.kind === "note") return <div className="dnote">{c.text}</div>;
  return null;   // panel 顯示在右欄
}

// 右欄「你說的事」：原型 ndi 列＋「改」（I5：每項都能改，不是表單）
function FactRow({ f, editing, onEdit, onPick }: { f: Fact; editing: boolean; onEdit: () => void; onPick: (i: number) => void }) {
  return (
    <>
      <div className="ndi" style={f.options ? { gridTemplateColumns: "auto 1fr auto" } : undefined}>
        <span className="ndk">{f.label}</span>
        <span className="ndv" style={{ minWidth: 0 }}>{f.display}{f.confidence === "estimated" && <span className="tagx" style={{ marginLeft: 6 }}>推估</span>}</span>
        {f.options && <button onClick={onEdit} aria-label={`修改${f.label}`}
          style={{ flex: "none", border: 0, background: "none", padding: "0 2px", fontFamily: "var(--ui)", fontSize: 12, fontWeight: 600, color: "var(--brand-ink)", cursor: "pointer" }}>{editing ? "取消" : "改"}</button>}
      </div>
      {editing && f.options && (
        <div className="dopts" style={{ margin: "2px 0 8px" }}>{f.options.map(o => <button key={o.index} className="dopt" onClick={() => onPick(o.index)}>{o.label}</button>)}</div>
      )}
    </>
  );
}
