import crypto from "crypto";
import type { PlanId } from "@/lib/plans";
import { PLANS } from "@/lib/plans";

// 綠界 AIO 金流。預設值為綠界公開的「測試環境」特店，
// 正式上線只需在環境變數填入自己的商店代號與金鑰，程式不用改。
// 測試特店資訊來源：https://developers.ecpay.com.tw/45895/
const TEST_MERCHANT = {
  merchantId: "2000132",
  hashKey: "5294y06JbISpM5x9",
  hashIV: "v77hoKGq4kWxNNIS",
};

export function ecpayConfig() {
  const isProd = process.env.ECPAY_ENV === "production";
  return {
    isProd,
    merchantId: process.env.ECPAY_MERCHANT_ID || TEST_MERCHANT.merchantId,
    hashKey: process.env.ECPAY_HASH_KEY || TEST_MERCHANT.hashKey,
    hashIV: process.env.ECPAY_HASH_IV || TEST_MERCHANT.hashIV,
    actionUrl: isProd
      ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
      : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5",
  };
}

/**
 * 綠界 CheckMacValue：
 * 參數依名稱排序 → 前後加上 HashKey/HashIV → URL encode 後轉小寫
 * → 比照 .NET HttpUtility.UrlEncode 還原部分字元 → SHA256 → 轉大寫。
 */
export function checkMacValue(
  params: Record<string, string | number>,
  hashKey: string,
  hashIV: string
): string {
  // 依參數名排序。用純字元比較而非 localeCompare，避免不同執行環境的
  // 語系設定影響排序、進而算出不同的簽章。
  const sorted = Object.keys(params)
    .filter(k => k !== "CheckMacValue")
    .sort((a, b) => {
      const x = a.toLowerCase();
      const y = b.toLowerCase();
      return x < y ? -1 : x > y ? 1 : 0;
    })
    .map(k => `${k}=${params[k]}`)
    .join("&");

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;

  const encoded = encodeURIComponent(raw)
    .toLowerCase()
    .replace(/%20/g, "+")
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%27/g, "'")
    .replace(/%7e/g, "~");

  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

export function verifyCheckMacValue(payload: Record<string, string>): boolean {
  const { hashKey, hashIV } = ecpayConfig();
  const received = payload.CheckMacValue;
  if (!received) return false;
  return checkMacValue(payload, hashKey, hashIV) === received.toUpperCase();
}

/** 綠界要求訂單編號唯一且僅限英數，長度 20 以內。 */
export function newTradeNo(prefix = "RD"): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}${ts}${rand}`.slice(0, 20);
}

function tradeDate(now = new Date()): string {
  // 綠界格式：yyyy/MM/dd HH:mm:ss（台北時間）
  const tw = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${tw.getUTCFullYear()}/${p(tw.getUTCMonth() + 1)}/${p(tw.getUTCDate())} ${p(tw.getUTCHours())}:${p(tw.getUTCMinutes())}:${p(tw.getUTCSeconds())}`;
}

export interface CheckoutParams {
  plan: PlanId;
  tradeNo: string;
  appUrl: string;
}

/**
 * 組出「信用卡定期定額」的表單參數。
 * PeriodType=M / Frequency=1 → 每月扣款一次；ExecTimes 為總扣款次數上限。
 */
export function buildSubscriptionForm({ plan, tradeNo, appUrl }: CheckoutParams): {
  action: string;
  params: Record<string, string>;
} {
  const cfg = ecpayConfig();
  const def = PLANS[plan];
  const amount = def.monthlyPrice;

  const params: Record<string, string> = {
    MerchantID: cfg.merchantId,
    MerchantTradeNo: tradeNo,
    MerchantTradeDate: tradeDate(),
    PaymentType: "aio",
    TotalAmount: String(amount),
    TradeDesc: "RADIA 訂閱",
    ItemName: `RADIA ${def.name} 月繳`,
    ReturnURL: `${appUrl}/api/webhooks/ecpay`,
    PeriodReturnURL: `${appUrl}/api/webhooks/ecpay`,
    ClientBackURL: `${appUrl}/pricing?paid=1`,
    ChoosePayment: "Credit",
    EncryptType: "1",
    // 定期定額
    PeriodAmount: String(amount),
    PeriodType: "M",
    Frequency: "1",
    ExecTimes: "99",
    CustomField1: plan,
  };

  params.CheckMacValue = checkMacValue(params, cfg.hashKey, cfg.hashIV);
  return { action: cfg.actionUrl, params };
}
