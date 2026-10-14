"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Foot } from "@/components/radia/Foot";
import type { AdvisorCard } from "@/lib/booking/service";

/*
 * 選顧問（原型 SCREENS.advisors）：先點選、再按底部「選好了」。
 * 卡片刻意不放年資與成交件數——客戶會挑看起來最專業的，而新人看起來最不專業。
 */
export function AdvisorPicker({ cards }: { cards: AdvisorCard[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<string | null>(null);
  return (
    <>
      <div className="advisors">
        {cards.map(a => (
          <button key={a.id} className="adv" aria-pressed={sel === a.id} onClick={() => setSel(a.id)}>
            <div className="hd"><div className="ava">{a.initial}</div>
              <div><div className="nm">{a.name}</div><div className="sp">{a.specialties.length ? `擅長${a.specialties.join("、")}` : "保險顧問"}</div></div></div>
            <div className="quote">「{a.intro}」</div>
            <div className="advmeta">
              <span className={`chip ${a.slotsThisWeek > 0 ? "hot" : ""}`}>{a.slotsThisWeek > 0 ? `本週還有 ${a.slotsThisWeek} 個時段` : "本週已約滿"}</span>
              <span className="chip">{a.modes.length === 2 ? "線上或面對面" : a.modes[0] === "online" ? "只接線上" : "面對面"}</span>
              {a.style && <span className="chip">{a.style}</span>}
              {a.responseLabel && <span className="chip" title="系統依顧問實際回覆紀錄計算">{a.responseLabel}</span>}{/* W2 w2-05：取代年資，保護新人（原型 2371） */}
            </div>
            <div className="dinn" style={{ textAlign: "left", padding: 0 }}>登錄字號 {a.licenseNo}</div>
          </button>
        ))}
      </div>
      <Foot><button className="btn" disabled={!sel} onClick={() => sel && router.push(`/advisors/${sel}`)}>選好了</button></Foot>
    </>
  );
}
