import type { FxGrid } from "@/lib/advisor/fxgrid";

/** 十格全險圖（原型 fxRender）：保單分析、商品條款頁共用 */
export function FxGridView({ grid: g, noAmount }: { grid: FxGrid; noAmount?: boolean }) {
  const cls = (v: string) => `fxr ${v === "無" ? "nil" : ""} ${v.length > 16 ? "txt" : ""}`;
  return (
    <>
      <div className="fxg" style={{ marginTop: 14 }}>{g.boxes.map(b => (
        <div key={b.key} className={`fxb ${b.on ? "on" : ""}`}>
          <div className="fxh"><span className="fxn">{b.key}</span><span className="fxf">{b.on ? "" : "這張沒有"}</span></div>
          {b.on ? b.rows.map(([l, v], i) => <div key={i} className={cls(v)}><span>{l}</span><b>{v}</b></div>)
            : <div className="fxe"><b>這類通常給付</b>{b.typ}</div>}
        </div>
      ))}</div>
      {g.lim && <div className="fxl" style={{ marginTop: 10 }}>{g.lim}</div>}
      {g.others.length > 0 && (
        <div className="acnext" style={{ display: "block" }}><div className="anx" style={{ marginBottom: 6 }}>其他給付（不屬於十格）</div>
          {g.others.map(([l, v], i) => <div key={i} className={cls(v)}><span>{l}</span><b>{v}</b></div>)}</div>
      )}
      <div className="fxsum"><span className="fxc">{g.filled}</span><span>／ 10 個格子有東西</span>
        {noAmount && <div className="fxprem"><div className="pl">沒填保額，算不出金額的項目顯示條款寫的計算方式</div></div>}</div>
    </>
  );
}
