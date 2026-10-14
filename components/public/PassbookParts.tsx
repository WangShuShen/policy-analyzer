"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PolicyView } from "@/lib/passbook/service";
import { PassbookUpload } from "./PassbookUpload";

/*
 * 存摺的兩個互動小塊（P1 ②、P2）。放在「你現在的保障」區塊裡，對話右欄與我的分析都用得到。
 * 狀態一變就發 passbook:changed，對話畫面收到會重抓；我的分析頁用 router.refresh()。
 */
const changed = () => window.dispatchEvent(new Event("passbook:changed"));

/** 讀取中／對版本中：每 4 秒看一次，有變化就更新畫面 */
export function PassbookPoller({ status, api = "/api/passbook" }: { status: string; api?: string }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(async () => {
      const r = await fetch(api).catch(() => null);
      const j = r?.ok ? await r.json() : null;
      if (j?.upload && j.upload.status !== status) { changed(); router.refresh(); }
    }, 4000);
    return () => clearInterval(t);
  }, [status, router, api]);
  return null;
}

const looksEnded = (s: string | null) => !!s && /終止|解約|滿期|失效|撤銷/.test(s);

/** 「我讀到 N 張，對嗎？」——可刪掉已解約的、可改保額（事實確認，不碰條款，N1） */
export function PassbookConfirm({ uploadId, policies, api = "/api/passbook" }: { uploadId: string; policies: PolicyView[]; api?: string }) {
  const router = useRouter();
  const [keep, setKeep] = useState<Record<string, boolean>>(() => Object.fromEntries(policies.map(p => [p.id, !looksEnded(p.status)])));
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setBusy(true); setError("");
    const items = policies.map(p => {
      const e = edit[p.id];
      const n = e !== undefined ? Number(e.replace(/[,，\s]/g, "")) : NaN;
      return { id: p.id, keep: keep[p.id], ...(e !== undefined && Number.isFinite(n) ? { amount: n } : {}) };
    });
    const r = await fetch(`${api}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uploadId, items }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setError(j.error ?? "沒送出去，請再試一次"); return; }
    changed(); router.refresh();
  };

  const n = Object.values(keep).filter(Boolean).length;
  return (
    <div>
      <div className="gprn" style={{ marginBottom: 8 }}>我讀到 <b>{policies.length} 張</b>，對嗎？<br />已經解約或不想算進來的，取消勾選；保額不對直接改。</div>
      <div className="ndl">
        {policies.map(p => (
          <div key={p.id} className="ndi" style={{ alignItems: "center", opacity: keep[p.id] ? 1 : .55 }}>
            <label className="gpck" style={{ margin: 0, padding: 0, border: 0, flex: 1, minWidth: 0, alignItems: "flex-start" }}>
              <input type="checkbox" checked={keep[p.id]} onChange={e => setKeep({ ...keep, [p.id]: e.target.checked })} />
              <span className="ndv" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <b style={{ textDecoration: keep[p.id] ? "none" : "line-through" }}>{p.productName}</b>
                <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{[p.company.replace(/保險股份有限公司|保險事業股份有限公司/, ""), p.isRider ? "附約" : null, p.effectiveDate ? `${p.effectiveDate} 生效` : null, p.status].filter(Boolean).join("・")}</span>
                {p.forOther && <span style={{ fontSize: 11.5, color: "var(--amber)" }}>被保險人：{p.forOther}（不算進你的保障）</span>}
              </span>
            </label>
            <input className="dinf" style={{ flex: "0 0 112px", padding: "6px 10px", fontSize: 13, textAlign: "right" }} aria-label={`${p.productName} 的保額`}
              value={edit[p.id] ?? p.amountText} disabled={!keep[p.id]}
              onFocus={() => { if (edit[p.id] === undefined) setEdit({ ...edit, [p.id]: (p.amountText.match(/[\d,.]+/)?.[0] ?? "") }); }}
              onChange={e => setEdit({ ...edit, [p.id]: e.target.value })} />
          </div>
        ))}
      </div>
      {error && <div className="rd-err">{error}</div>}
      <button className="btn" style={{ marginTop: 12, width: "100%" }} onClick={submit} disabled={busy}>{busy ? "送出中…" : `對，算這 ${n} 張`}</button>
    </div>
  );
}

/** 沒讀成功時重新上傳（伺服器頁面不能直接傳函式給客戶端元件，包一層） */
export function PassbookRetry({ api }: { api?: string } = {}) {
  const router = useRouter();
  return <PassbookUpload conversationId={null} api={api} onUploaded={() => { changed(); router.refresh(); }} />;
}
