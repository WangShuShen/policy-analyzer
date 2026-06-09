"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "您的 Google 帳號尚未開通，請聯繫管理員新增授權。",
  oauth_failed: "Google 授權失敗，請再試一次。",
  invalid_state: "登入請求已過期，請重新開始。",
  token_exchange_failed: "Google 驗證失敗，請再試一次。",
  userinfo_failed: "無法取得 Google 帳號資訊，請再試一次。",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const [iconError, setIconError] = useState(false);
  const [loading, setLoading] = useState(false);

  const errorKey = searchParams.get("error") ?? "";
  const errorMsg = ERROR_MESSAGES[errorKey] ?? "";

  const handleGoogleLogin = () => {
    setLoading(true);
    window.location.href = "/api/auth/google";
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "oklch(0.985 0.012 75)" }}
    >
      <div className="w-full max-w-sm px-4">
        <div className="bg-white border border-[#EDE0CE] rounded-3xl shadow-sm p-8 space-y-6">

          {/* Brand */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 rounded-3xl overflow-hidden bg-[#FBF0E3] mx-auto flex items-center justify-center">
              {iconError ? (
                <span className="text-4xl">🏠</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/brand-icon.png"
                  alt="傳家知保"
                  className="w-20 h-20 object-cover"
                  onError={() => setIconError(true)}
                />
              )}
            </div>
            <div>
              <h1
                className="text-2xl font-bold text-stone-800"
                style={{ fontFamily: "var(--font-serif-tc), serif" }}
              >
                傳家知保
              </h1>
              <p className="text-xs text-stone-400 mt-1">保單分析工具 · 顧問專用</p>
            </div>
          </div>

          {/* Error */}
          {errorMsg && (
            <p className="text-red-500 text-xs bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl text-center">
              {errorMsg}
            </p>
          )}

          {/* Google Login */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 rounded-2xl font-semibold text-sm text-stone-700 bg-white border border-stone-200 hover:bg-stone-50 flex items-center justify-center gap-3 transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? "跳轉中…" : "使用 Google 帳號登入"}
          </button>

          <p className="text-center text-[11px] text-stone-300">
            僅限授權顧問登入 · © 傳家知保
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
