import { notFound, redirect } from "next/navigation";
import { requireConsultPage } from "@/lib/consult/pageGate";
import { advisorCard, advisorSlotsFor, activeBooking } from "@/lib/booking/service";
import { SlotPicker } from "@/components/public/SlotPicker";

// 選時段（原型 SCREENS.slots）：當下就約，不做「留下電話我們再聯絡」——那會流失一半
export default async function AdvisorSlotsPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireConsultPage();
  const { id } = await params;
  const active = await activeBooking(userId);
  if (active) redirect(`/booked/${active.id}`);
  const card = await advisorCard(id);
  if (!card) notFound();
  const slots = await advisorSlotsFor(id);
  return <SlotPicker advisor={card} slots={slots} />;
}
