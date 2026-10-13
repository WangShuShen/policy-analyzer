"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/radia/Shell";

/*
 * 顧問申請（w1b-03、C4）。放在 /welcome/ 底下是因為這段路徑本來就不用登入（proxy 白名單）。
 * 原型沒有這一頁：用顧問登入頁同一套外框（cols／h2.t／gbtn）與我的顧問頁的表單元件（pf／ack／pta／pfhint）組成。
 * ①按「用 Google 申請」驗證 email ②填表送出 ③等管理者核准，核准後用同一個 Google 帳號從顧問登入頁進來。
 */
const ERRORS: Record<string, string> = {
  oauth_failed: "Google 授權沒有完成，請再試一次。",
  invalid_state: "驗證請求已過期，請重新開始。",
  token_exchange_failed: "Google 驗證失敗，請再試一次。",
  userinfo_failed: "無法取得 Google 帳號資訊，請再試一次。",
};

type Status = { applicant: { email: string; googleName: string } | null; application: { status: string; name: string; createdAt: string; note: string | null } | null };

const GoogleIcon = () => (
  <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.7-9.1 6.7-15.5z"/><path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-6.8-5.3c-1.8 1.3-4.3 2.2-7.5 2.2-5.7 0-10.6-3.8-12.3-9l-7 5.4C8.3 41.1 15.6 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.7c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2l-7-5.4C3.6 17.8 3 20.8 3 24s.6 6.2 1.7 9.1z"/><path fill="#EA4335" d="M24 10.6c3.2 0 5.3 1.4 6.6 2.5l5.9-5.8C32.9 4 28.5 2 24 2 15.6 2 8.3 6.9 4.7 14.1l7 5.4c1.7-5.2 6.6-8.9 12.3-8.9z"/></svg>
);

function ApplyContent() {
  const params = useSearchParams();
  const urlError = ERRORS[params.get("error") ?? ""];
  const [st, setSt] = useState<Status | null>(null);
  const [f, setF] = useState({ name: "", license_no: "", company: "", phone: "", intro: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const r = await fetch("/api/auth/advisor-apply");
    const d: Status = await r.json();
    setSt(d);
    if (d.applicant) setF(x => ({ ...x, name: x.name || d.applicant!.googleName }));
  }
  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const r = await fetch("/api/auth/advisor-apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json();
    if (r.ok) await load(); else setError(d.error ?? "送出失敗，請再試一次");
    setBusy(false);
  }

  const app = st?.application;
  const field = (k: keyof typeof f, label: string, hint: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="pf"><div className="ack">{label}</div>
      <input className="pta" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} required {...props} />
      <div className="pfhint">{hint}</div></div>
  );

  let body: React.ReactNode;
  if (!st) body = <div className="rd-loading">讀取中…</div>;
  else if (!st.applicant) body = (
    <>
      <p className="sub">先用 Google 驗證你的 email，再填幾個欄位。管理者核准後，就能用同一個 Google 帳號登入顧問工作台。</p>
      <button className="gbtn" style={{ marginTop: 20 }} onClick={() => { setBusy(true); window.location.href = "/api/auth/google?flow=advisor_apply"; }} disabled={busy}>
        <GoogleIcon />{busy ? "跳轉中…" : "用 Google 申請"}
      </button>
    </>
  );
  else if (app?.status === "pending") body = (
    <p className="sub">已收到 <b>{app.name}</b> 的申請（{st.applicant.email}），管理者審核中。核准後請從 <a href="/login" style={{ color: "var(--brand-ink)" }}>顧問登入</a> 用同一個 Google 帳號進來。</p>
  );
  else if (app?.status === "approved") body = (
    <p className="sub">申請已核准。請從 <a href="/login" style={{ color: "var(--brand-ink)" }}>顧問登入</a> 用 {st.applicant.email} 登入，記得先到「我的顧問頁」把資料填完，客戶才看得到你。</p>
  );
  else body = (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      {app?.status === "rejected" && <div className="rd-err">上一次的申請沒有通過{app.note ? `：${app.note}` : "。"}可以修改後再送一次。</div>}
      <div className="pf"><div className="ack">Google 帳號</div><div className="pfhint" style={{ fontSize: 14 }}>{st.applicant.email}</div></div>
      {field("name", "姓名", "客戶會看到這個名字", { maxLength: 30 })}
      {field("license_no", "登錄字號", "管理者核准前會核對", { maxLength: 40 })}
      {field("company", "所屬公司／通路", "只給管理者看，客戶看不到", { maxLength: 60 })}
      {field("phone", "手機", "管理者聯絡你用，客戶看不到", { inputMode: "tel", maxLength: 20 })}
      <div className="pf"><div className="ack">一句自我介紹</div>
        <textarea className="pta" maxLength={100} value={f.intro} onChange={e => setF({ ...f, intro: e.target.value })} required />
        <div className="pfhint">{f.intro.length} / 100 字 · 只給管理者看；客戶看到的自介，核准後在「我的顧問頁」另外寫</div></div>
      {error && <div className="rd-err">{error}</div>}
      <button className="btn" type="submit" disabled={busy}>{busy ? "送出中…" : "送出申請"}</button>
    </form>
  );

  return (
    <Shell chrome={<div className="chrome"><span className="brand">RAD<i>IA</i></span></div>}>
      <div className="cols"><div className="main" style={{ maxWidth: 480 }}>
        <div className="eyebrow">顧問工作台</div>
        <h2 className="t">申請成為 RADIA 顧問</h2>
        {urlError && <div className="rd-err">{urlError}</div>}
        {body}
      </div></div>
    </Shell>
  );
}

export default function AdvisorApplyPage() {
  return <Suspense><ApplyContent /></Suspense>;
}
