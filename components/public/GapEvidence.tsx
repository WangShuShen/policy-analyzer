import { CASES, KIND_LABEL, VERIFIED_AT } from "@/lib/consult/cases";

/**
 * 為什麼要補？看數據（A3b，原型 GAPS 的佐證區）。素材在 lib/consult/cases.ts，每筆都有出處與年份（N17）。
 * 用 <details> 開合：這個元件也在伺服器頁面（我的分析）與顧問端 GapEditor（client）共用，所以用原生開合、不靠 React 狀態，也不能 import 伺服器專用的東西
 */
export function Evidence({ k }: { k: string }) {
  const c = CASES[k as keyof typeof CASES];
  if (!c) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="alink" style={{ listStyle: "none", cursor: "pointer", padding: 0 }}>為什麼要補？看數據</summary>
      <div className="gpev">
        <div className="evh">📊 公開統計</div>
        {c.stats.map(s => (
          <div key={s.n + s.label}>
            <div className="evs"><span className="evn">{s.n}</span><span className="evl">{s.label}</span></div>
            <div className="evsrc" style={{ color: "var(--muted)" }}>{KIND_LABEL[s.kind]}｜<a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{s.source}</a>｜{s.year}</div>
          </div>
        ))}
        {c.scenario && (
          <div style={{ marginTop: 11, paddingTop: 9, borderTop: "1px dashed var(--line)" }}>
            <div className="evh">🧮 情境試算，非統計</div>
            <div className="evt">{c.scenario.title}：{c.scenario.total}</div>
            {c.scenario.items.map(i => <div key={i.label} className="evd">・{i.label} ＝ {i.amount}（{i.ref}）</div>)}
            <div className="evd">{c.scenario.excluded}。這是用上面的公開數字算出來的量級，不代表你會遇到，也不是平均。</div>
          </div>
        )}
        <div className="evsrc" style={{ color: "var(--muted)" }}>這些是公開資料，你可以點來源自己查（{VERIFIED_AT} 查證）。</div>
      </div>
    </details>
  );
}
