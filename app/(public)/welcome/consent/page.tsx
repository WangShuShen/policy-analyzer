"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConsentDocument } from "@/components/public/ConsentDocument";
import { CONSENT_VERSION } from "@/lib/consentVersion";
import { Foot } from "@/components/radia/Foot";

const ERRORS: Record<string, string> = {
  consent_required: "要先看完並勾選同意書，才能用 Google 繼續。",
  consent_outdated: "同意書內容更新了，請再看一次並重新同意。",
  oauth_failed: "Google 授權沒有完成，請再試一次。",
  invalid_state: "登入請求已過期，請重新開始。",
  token_exchange_failed: "Google 驗證失敗，請再試一次。",
  userinfo_failed: "無法取得 Google 帳號資訊，請再試一次。",
  account_disabled: "這個帳號已停用，如有疑問請聯繫我們。",
  advisor_account: "這個 Google 帳號是顧問帳號。要體驗客戶流程，請換一個 Google 帳號。",
};

/*
 * 個資同意（N4、N21、4-z）
 * ①全文可讀（九條）②捲到底才解鎖勾選 ③必要與行銷分開勾，行銷不勾不影響服務
 * 這一關擋在 AI 諮詢前面：同意必須發生在蒐集特種個資「之前」。
 * 「先不同意」不是跳過同意，是進衛教模式——AI 只答知識問題，一個字都不記。
 */
function ConsentForm() {
  const params = useSearchParams();
  const error = ERRORS[params.get("error") ?? ""];
  const hint = params.get("hint");
  const box = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [agree, setAgree] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const readAll = progress >= 0.995;

  const onScroll = useCallback(() => {
    const el = box.current;
    if (!el) return;
    const p = Math.min(1, (el.scrollTop + el.clientHeight) / (el.scrollHeight - 4));
    setProgress(prev => Math.max(prev, p));   // 捲回上面不會重新上鎖
  }, []);
  useEffect(() => { onScroll(); }, [onScroll]);   // 螢幕夠高、全文一次看得完的情況

  const goGoogle = () => {
    if (!readAll || !agree) return;
    setLeaving(true);
    const q = new URLSearchParams({ flow: "consult", cv: CONSENT_VERSION, mk: marketing ? "1" : "0" });
    window.location.href = `/api/auth/google?${q}`;
  };

  return (
    <div className="cols"><div className="main">
      <h2 className="t">先建個帳號</h2>
      <p className="sub">這樣聊到一半離開，下次回來不用重講一遍。</p>
      {error && <div className="rd-err">{error}{hint && <><br /><small>Google 帳號：{hint}</small></>}</div>}

      <div className="csw">
        <div className="csh">
          <span className="csht">個人資料蒐集、處理及利用告知暨同意書</span>
          <span className="cshn">依個資法第 8 條、第 6 條 · 版本 {CONSENT_VERSION}</span>
        </div>
        <div className="csb" ref={box} onScroll={onScroll} tabIndex={0} aria-label="同意書全文，請捲動閱讀">
          <ConsentDocument />
        </div>
        <div className={`csbar ${readAll ? "done" : ""}`} aria-live="polite">
          <span>{readAll ? "已看完全文，可以勾選了" : `往下滑看完全文才能勾選同意（還有 ${Math.round((1 - progress) * 100)}%）`}</span>
          <span className="cstrack"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
        </div>
        <div className="csopts">
          <label className={`csk ${readAll ? "" : "off"}`}>
            <input type="checkbox" disabled={!readAll} checked={agree} onChange={e => setAgree(e.target.checked)} />
            <span>我已完整閱讀並同意上述蒐集、處理及利用我的個人資料，<b>包含第 6 條特種個人資料（健康與醫療）</b>。<span className="req">必要</span>
              <small>不同意就無法進行個人化分析，但你仍然可以使用衛教問答。</small></span>
          </label>
          <label className={`csk ${readAll ? "" : "off"}`}>
            <input type="checkbox" disabled={!readAll} checked={marketing} onChange={e => setMarketing(e.target.checked)} />
            <span>我同意接收保險相關資訊與平台快訊。<span className="csopt">選填</span>
              <small>不勾也完全不影響其他服務，之後隨時可以取消。</small></span>
          </label>
        </div>
      </div>

      <Foot>
        <button className="gbtn" onClick={goGoogle} disabled={!readAll || !agree || leaving} style={{ opacity: readAll && agree ? 1 : .45 }}>
          <svg width="19" height="19" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45 24.5c0-1.6-.1-2.8-.4-4H24v7.3h12c-.2 2-1.5 5-4.4 7l6.7 5.2c4-3.7 6.7-9.1 6.7-15.5z"/><path fill="#34A853" d="M24 46c5.8 0 10.7-1.9 14.3-5.2l-6.8-5.3c-1.8 1.3-4.3 2.2-7.5 2.2-5.7 0-10.6-3.8-12.3-9l-7 5.4C8.3 41.1 15.6 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.7c-.5-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2l-7-5.4C3.6 17.8 3 20.8 3 24s.6 6.2 1.7 9.1z"/><path fill="#EA4335" d="M24 10.6c3.2 0 5.3 1.4 6.6 2.5l5.9-5.8C32.9 4 28.5 2 24 2 15.6 2 8.3 6.9 4.7 14.1l7 5.4c1.7-5.2 6.6-8.9 12.3-8.9z"/></svg>
          {leaving ? "前往 Google…" : "用 Google 繼續"}
        </button>
        <a className="btn ghost" href="/consult/edu">先不同意，只問知識</a>
      </Foot>
    </div></div>
  );
}

export default function ConsentPage() {
  return <Suspense><ConsentForm /></Suspense>;
}
