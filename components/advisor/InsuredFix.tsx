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
  const set = async (owner: boolean) => {
    if (!owner && !confirm("被保險人是家人的保單不能留（第三人的個資），這一筆會刪掉。確定嗎？")) return;
    setBusy(true); setErr("");
    const r = await fetch(`/api/advisor/clients/${userId}/passbook/insured`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId, owner }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "沒有存成功"); return; }
    router.refresh();
  };
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>被保險人是：</span>
      <button className="alink" style={{ padding: 0, fontWeight: insured === "self" ? 700 : 400 }} disabled={busy} onClick={() => set(true)}>本人</button>
      <button className="alink" style={{ padding: 0 }} disabled={busy} onClick={() => set(false)}>家人（刪掉這筆）</button>
      {err && <span style={{ fontSize: 12, color: "var(--must)" }}>{err}</span>}
    </span>
  );
}
