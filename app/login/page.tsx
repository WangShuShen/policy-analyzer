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
    <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.985 0.012 80)" }}>
      <div className="w-full max-w-sm">
        <div className="bg-white border border-amber-100 rounded-2xl shadow-sm p-8 space-y-6">
          <div className="text-center space-y-1">
            <div className="text-3xl mb-3">🗂️</div>
            <h1 className="text-lg font-bold text-stone-800">保單分析系統</h1>
            <p className="text-xs text-stone-400">請輸入帳號密碼登入</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs text-stone-500">帳號</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
                autoComplete="username"
                className="w-full bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-stone-500">密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full bg-amber-50/50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-200"
              />
            </div>

            {error && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!username || !password || loading}
              className="w-full py-2.5 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "oklch(0.58 0.13 55)" }}
            >
              {loading
                ? <><Loader2 className="h-4 w-4 animate-spin" />登入中…</>
                : <><Lock className="h-4 w-4" />登入</>
              }
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
