import Link from "next/link";
import { requireAdvisorPage } from "@/lib/advisor/pageGate";
import { listClients, GROUP_LABEL, type ClientGroup } from "@/lib/advisor/clients";
import { fmtTaipei } from "@/lib/booking/slots";

/*
 * 客戶（原型 SCREENS.advclients）。按狀態分組，不做大表格——新人一年二三十個客戶，不需要篩選排序。
 * 「等我處理」永遠在最上面；手動新增客戶屬於 W2 CRM。
 */
const DOT: Record<ClientGroup, string> = { todo: "var(--must)", upcoming: "var(--brand)", met: "var(--good,#0ca30c)", closed: "var(--muted)" };

export default async function ClientsPage() {
  const { advisorId } = await requireAdvisorPage();
  const rows = await listClients(advisorId);
  const groups = (["todo", "upcoming", "met", "closed"] as ClientGroup[]).map(g => [g, rows.filter(r => r.group === g)] as const).filter(([, l]) => l.length);
  return (
    <>
      {rows.length === 0 && (
        <div className="aempty"><div className="aet">還沒有客戶預約你</div>
          <p className="ah2" style={{ marginTop: 6 }}>先到「<Link href="/profile" style={{ color: "var(--brand-ink)" }}>我的顧問頁</Link>」把自我介紹與時段設好，客戶才看得到你。</p></div>
      )}
      {groups.map(([g, list]) => (
        <div key={g} className="agrp">
          <div className="agh">{GROUP_LABEL[g]}<span>{list.length}</span></div>
          {list.map(c => (
            <div key={c.userId} className="atd">
              <span className="adot" style={{ background: DOT[g] }} />
              <div className="atx"><div className="at1"><b>{c.name}</b>　{c.status}</div><div className="at2">{fmtTaipei(c.startsAt)} 面談</div></div>
              <span className="asrc">{c.source}</span>
              <Link className="abtn" href={`/clients/${c.userId}`} style={{ textDecoration: "none" }}>開客戶頁</Link>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
