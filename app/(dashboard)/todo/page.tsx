import Link from "next/link";
import { requireAdvisorPage } from "@/lib/advisor/pageGate";
import { listClients } from "@/lib/advisor/clients";
import { fmtTaipei, toTaipei } from "@/lib/booking/slots";

/*
 * 待辦（原型 SCREENS.advhome）：告訴顧問「現在做什麼」。
 * 需要現在處理：還沒看諮詢紀錄、今天的面談、剛面談完還沒標記；這週：面談完超過 12 小時還沒記錄（B1）。
 * 延後／關掉（原型的 ⋯ 選單）屬於 W2 CRM，這裡先不做。
 */
const LVC = { r: "var(--must)", o: "var(--amber)", y: "#b4972a", g: "var(--brand)" };
const ago = (iso: string) => {
  const d = (Date.now() - Date.parse(iso)) / 3600_000;
  if (d < 0) return toTaipei(iso).date === toTaipei(Date.now()).date ? "今天" : fmtTaipei(iso).replace(/（.*/, "");
  if (d < 24) return `${Math.max(1, Math.round(d))} 小時前`;
  return `${Math.round(d / 24)} 天前`;
};

export default async function TodoPage() {
  const { advisorId } = await requireAdvisorPage();
  const rows = await listClients(advisorId);
  const today = toTaipei(Date.now()).date;
  type Item = { g: string; lv: keyof typeof LVC; c: (typeof rows)[number]; t: string; d: string; act: string };
  const items = rows.flatMap((c): Item[] => {
    const t = fmtTaipei(c.startsAt).replace(/^.*?）/, "");
    const isToday = toTaipei(c.startsAt).date === today;
    if (c.status === "面談完結果還沒記錄") return [{ g: "week", lv: "y", c, t: `${fmtTaipei(c.startsAt).replace(/（.*/, "")} 面談完，結果還沒記錄`, d: "沒記錄的話客戶端不會解鎖，後續追蹤也會接不上", act: "記錄結果" }];
    if (c.status === "面談結束了，記得標記結果") return [{ g: "now", lv: "r", c, t: "剛面談完，記得標記結果", d: "標「已面談」客戶的完整分析才會解鎖", act: "記錄結果" }];
    if (c.status === "還沒看諮詢紀錄") return [{ g: "now", lv: "r", c, t: `預約了 ${fmtTaipei(c.startsAt)}，你還沒看他的諮詢紀錄`, d: c.source, act: "看他的背景" }];
    if (c.group === "upcoming" && isToday) return [{ g: "now", lv: "o", c, t: `今天 ${t} 面談`, d: c.source, act: "開客戶頁" }];
    return [];
  });
  const GRP: [string, string][] = [["now", "需要現在處理"], ["week", "這週"]];
  return (
    <>
      {GRP.map(([g, label]) => {
        const list = items.filter(x => x.g === g);
        if (!list.length) return null;
        return (
          <div key={g} className={`agrp ag-${g}`}>
            <div className="agh">{label}<span>{list.length}</span></div>
            {list.map(x => (
              <div key={x.c.userId} className="atd">
                <span className="adot" style={{ background: LVC[x.lv] }} />
                <div className="atx"><div className="at1"><b>{x.c.name}</b>　{x.t}</div><div className="at2">{x.d}</div></div>
                <div className="ago">{ago(x.c.startsAt)}</div>
                <div className="aact"><Link className="abtn pri" href={`/clients/${x.c.userId}${x.act === "看他的背景" ? "?tab=chat" : ""}`} style={{ textDecoration: "none" }}>{x.act}</Link></div>
              </div>
            ))}
          </div>
        );
      })}
      {items.length === 0 && (
        <div className="aempty">
          <svg className="ill i44" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-done" /></svg>
          <div className="aet">今天的事做完了</div>
          <p className="ah2" style={{ marginTop: 6 }}>{rows.length ? <>全部客戶在「<Link href="/clients" style={{ color: "var(--brand-ink)" }}>客戶</Link>」</> : <>還沒有客戶預約你。先到「<Link href="/profile" style={{ color: "var(--brand-ink)" }}>我的顧問頁</Link>」把自我介紹與時段設好</>}</p>
        </div>
      )}
    </>
  );
}
