import { notFound, redirect } from "next/navigation";
import { requireConsultPage } from "@/lib/consult/pageGate";
import { advisorCard, advisorSlotsFor, activeBooking } from "@/lib/booking/service";
import { SlotPicker } from "@/components/public/SlotPicker";

// 選時段（原型 SCREENS.slots）：當下就約，不做「留下電話我們再聯絡」——那會流失一半
// ?reschedule=<預約 id>：改期（B5），同一位顧問重新挑時間
export default async function AdvisorSlotsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reschedule?: string }> }) {
  const { userId } = await requireConsultPage();
  const { id } = await params;
  const { reschedule } = await searchParams;
  const active = await activeBooking(userId);
  const rescheduling = !!active && reschedule === active.id && active.advisor_id === id;
  if (active && !rescheduling) redirect("/me");
  const card = await advisorCard(id);
  if (!card) notFound();
  // 改期時自己原本那場不算衝突，才挑得到同一天前後的時間（4-ar）
  const slots = await advisorSlotsFor(id, Date.now(), rescheduling ? active!.id : undefined);
  return <SlotPicker advisor={card} slots={slots} reschedule={rescheduling ? { id: active!.id, startsAt: active!.starts_at } : undefined} />;
}
