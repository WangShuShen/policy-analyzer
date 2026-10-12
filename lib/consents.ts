import db from "@/lib/db";
import { consents } from "@/lib/schema";
import { and, eq, isNull } from "drizzle-orm";

/*
 * 個資同意（N4、N21、4-z）。
 * 同意書全文改了就要換版本號：舊版本的同意不再算數，使用者回來時要重新同意才能繼續。
 * 全文在 components/public/ConsentDocument.tsx，版本號在 lib/consentVersion.ts。
 */
import { CONSENT_VERSION } from "@/lib/consentVersion";
export { CONSENT_VERSION };

export type ConsentScope = "required" | "marketing";

/** 是否已同意「目前版本」的必要條款且未撤回 */
export async function hasRequiredConsent(userId: string): Promise<boolean> {
  const rows = await db.select({ id: consents.id }).from(consents)
    .where(and(
      eq(consents.user_id, userId),
      eq(consents.doc_version, CONSENT_VERSION),
      eq(consents.scope, "required"),
      isNull(consents.withdrawn_at),
    ))
    .limit(1);
  return rows.length > 0;
}

/** 曾經同意過任何版本的必要條款（用來區分「從沒同意過」和「同意書改版了」） */
export async function hasAnyRequiredConsent(userId: string): Promise<boolean> {
  const rows = await db.select({ id: consents.id }).from(consents)
    .where(and(eq(consents.user_id, userId), eq(consents.scope, "required"), isNull(consents.withdrawn_at)))
    .limit(1);
  return rows.length > 0;
}

/**
 * 寫入同意紀錄。必要條款一定要有；行銷是選填（不勾不影響服務）。
 * 同一版本已同意過的不重複寫，所以重複登入、重整頁面都安全。
 */
export async function recordConsent(userId: string, opts: { marketing: boolean }): Promise<void> {
  const scopes: ConsentScope[] = opts.marketing ? ["required", "marketing"] : ["required"];
  const existing = await db.select({ scope: consents.scope }).from(consents)
    .where(and(eq(consents.user_id, userId), eq(consents.doc_version, CONSENT_VERSION), isNull(consents.withdrawn_at)));
  const have = new Set(existing.map(r => r.scope));
  const toAdd = scopes.filter(s => !have.has(s));
  if (toAdd.length === 0) return;
  await db.insert(consents).values(toAdd.map(scope => ({
    id: crypto.randomUUID(), user_id: userId, doc_version: CONSENT_VERSION, scope,
  })));
}
