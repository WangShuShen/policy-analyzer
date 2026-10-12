"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Shell } from "@/components/radia/Shell";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "您的 Google 帳號尚未開通，請聯繫管理員新增授權。",
  account_disabled: "此帳號已停用，如有疑問請聯繫我們。",
  oauth_failed: "Google 授權失敗，請再試一次。",
  invalid_state: "登入請求已過期，請重新開始。",
  token_exchange_failed: "Google 驗證失敗，請再試一次。",
  userinfo_failed: "無法取得 Google 帳號資訊，請再試一次。",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  const errorKey = searchParams.get("error") ?? "";
  const hint = searchParams.get("hint") ?? "";
  const errorMsg = ERROR_MESSAGES[errorKey] ?? "";

  const handleGoogleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/google";
  };

  // 顧問登入：同一個 RADIA 外框與元件（原型沒有這一頁，用原型的 cols／h2.t／gbtn 組成）
  return (
    <Shell chrome={<div className="chrome"><span className="brand">RAD<i>IA</i></span></div>}>
      <div className="cols"><div className="main" style={{ maxWidth: 440 }}>
        <div className="eyebrow">顧問工作台</div>
        <h2 className="t">顧問登入</h2>
        <p className="sub">僅限授權顧問。客戶請從 <a href="/welcome" style={{ color: "var(--brand-ink)" }}>RADIA 首頁</a> 開始。</p>
        {errorMsg && <div className="rd-err">{errorMsg}{hint && <><br /><small>Google 帳號：{hint}</small></>}</div>}
        <button className="gbtn" style={{ marginTop: 20 }} onClick={handleGoogleLogin} disabled={loading}>
          <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.7-9.1 6.7-15.5z"/><path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-6.8-5.3c-1.8 1.3-4.3 2.2-7.5 2.2-5.7 0-10.6-3.8-12.3-9l-7 5.4C8.3 41.1 15.6 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.7c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2l-7-5.4C3.6 17.8 3 20.8 3 24s.6 6.2 1.7 9.1z"/><path fill="#EA4335" d="M24 10.6c3.2 0 5.3 1.4 6.6 2.5l5.9-5.8C32.9 4 28.5 2 24 2 15.6 2 8.3 6.9 4.7 14.1l7 5.4c1.7-5.2 6.6-8.9 12.3-8.9z"/></svg>
          {loading ? "跳轉中…" : "使用 Google 帳號登入"}
        </button>
      </div></div>
    </Shell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
