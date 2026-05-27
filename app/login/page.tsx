"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "登入失敗");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("連線異常，請稍後再試");
    } finally {
      setLoading(false);
    }
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand-icon.png"
                alt="傳家知保"
                className="w-20 h-20 object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                  (e.currentTarget.nextElementSibling as HTMLElement).style.display = "flex";
                }}
              />
              <span className="text-4xl hidden items-center justify-center">🏠</span>
            </div>
            <div>
              <h1
                className="text-2xl font-bold text-stone-800"
                style={{ fontFamily: "var(--font-serif-tc), serif" }}
              >
                傳家知保
              </h1>
              <p className="text-xs text-stone-400 mt-1">保單分析工具 · 請登入繼續</p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-500">帳號</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-stone-500">密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-[#FEF9F2] border border-[#E8D5B7] rounded-xl px-4 py-3 text-sm text-stone-800 placeholder-stone-300 focus:outline-none focus:border-[#C8956C] focus:ring-2 focus:ring-[#C8956C]/20 transition-all"
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!username || !password || loading}
              className="w-full py-3 rounded-2xl font-semibold text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
              style={{ background: "linear-gradient(135deg, #C8956C, #A0714F)" }}
              onMouseEnter={(e) => {
                if (username && password && !loading)
                  (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #B07850, #8B5E3C)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #C8956C, #A0714F)";
              }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />登入中…</>
                : <><Lock className="h-4 w-4" />登入</>
              }
            </button>
          </form>

          <p className="text-center text-[11px] text-stone-300">
            © 傳家知保 保單分析工具
          </p>
        </div>
      </div>
    </div>
  );
}
