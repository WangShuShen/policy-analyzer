import { requireAdvisorPage } from "@/lib/advisor/pageGate";
import { buildTodos } from "@/lib/crm/todo";
import { TodoBoard } from "@/components/advisor/TodoBoard";

/*
 * 待辦（原型 SCREENS.advhome）：告訴顧問「現在做什麼」。
 * 需要現在處理：還沒看諮詢紀錄、今天的面談、剛面談完還沒標記、追蹤日過了；這週：面談完超過 12 小時還沒記錄、今天要追蹤；
 * 提示：客戶又打開了「我的分析」。每件可延後、可關掉（W2 w2-03；計算在 lib/crm/todo.ts）。
 */
export default async function TodoPage() {
  const { advisorId } = await requireAdvisorPage();
  const { items, handled, total } = await buildTodos(advisorId);
  return <TodoBoard items={items} handled={handled} total={total} />;
}
