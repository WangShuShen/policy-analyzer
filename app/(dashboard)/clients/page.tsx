import { requireAdvisorPage } from "@/lib/advisor/pageGate";
import { listClients } from "@/lib/advisor/clients";
import { ClientsBoard } from "@/components/advisor/ClientsBoard";
import { taipeiDay } from "@/lib/admin/usage";

/*
 * 客戶（原型 SCREENS.advclients）。按狀態分組，不做大表格——新人一年二三十個客戶，不需要篩選排序。
 * 「等我處理」永遠在最上面。W2：平台預約自動變成客戶、手動新增客戶、成交／沒成、下次追蹤到了排進等我處理。
 */
export default async function ClientsPage() {
  const { advisorId } = await requireAdvisorPage();
  const rows = await listClients(advisorId);
  const month = taipeiDay(Date.now()).slice(0, 7);
  const firstSeen = (r: (typeof rows)[number]) => taipeiDay(Date.parse(r.createdAt.replace(" ", "T") + "Z")).slice(0, 7);
  return <ClientsBoard rows={rows} newThisMonth={rows.filter(r => firstSeen(r) === month).length} />;
}
