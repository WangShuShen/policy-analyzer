"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/*
 * 被保險人待確認的保單：顧問確認是本人 → 算進保障；是家人 → 刪掉這一筆（4-ay：別人當被保險人的保單不存，第三人的個資）。
 * 改完重新整理頁面，全險圖與缺口重算。
 */
export function InsuredFix({ userId, policyId, insured }: { userId: string; policyId: string; insured: "self" | "pending" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asking, setAsking] = useState(false);      // 按了「家人」→ 頁面內展開確認（跟客戶端刪存摺 EraseControls 一樣，不跳瀏覽器視窗）
  const set = async (owner: boolean) => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/advisor/clients/${userId}/passbook/insured`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId, owner }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有存成功"); return; }
    setAsking(false);
    router.refresh();
  };
  return (
    <span style={{ display: "block", marginTop: 4 }}>
      <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>被保險人是：</span>
        <button className="alink" style={{ padding: 0, fontWeight: insured === "self" ? 700 : 400 }} disabled={busy} onClick={() => set(true)}>本人</button>
        <button className="alink" style={{ padding: 0 }} disabled={busy} aria-expanded={asking} onClick={() => { setAsking(true); setErr(""); }}>家人（刪掉這筆）</button>
      </span>
      {asking && (
        <span role="group" aria-label="刪除這張保單" style={{ display: "block", background: "var(--must-soft)", borderRadius: 10, padding: "10px 12px", margin: "6px 0 2px" }}>
          <span style={{ display: "block", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 8 }}>被保險人是家人的保單不能留（第三人的個資），這一筆會刪掉。確定嗎？</span>
          <span style={{ display: "inline-flex", gap: 8, flexWrap: "wrap" }}>
            <button className="abtn pri" style={{ background: "var(--must)", borderColor: "var(--must)" }} disabled={busy} onClick={() => set(false)}>{busy ? "刪除中…" : "確定刪除"}</button>
            <button className="abtn" disabled={busy} onClick={() => { setAsking(false); setErr(""); }}>取消</button>
          </span>
        </span>
      )}
      {err && <span style={{ display: "block", fontSize: 12, color: "var(--must)", marginTop: 4 }}>{err}</span>}
    </span>
  );
}
