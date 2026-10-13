/*
 * 合規檢查第一層：規則攔截（實作設計 I4、N1）。
 * AI 的每一句回覆送出前先過這裡；第二層 AI 審查在 W1b。
 *
 * N1 三條：不得解釋商品內容、不得建議保額、不得比較條款。
 * 規則刻意寫得保守——寧可誤攔一句改送安全回覆，也不要放過一句違規招攬。
 * 腳本裡的固定台詞（lib/consult/script.ts）已經顧問審過，不經過這裡。
 */
export interface ComplianceResult {
  ok: boolean;
  reason?: string;
}

const RULES: { reason: string; re: RegExp }[] = [
  // 建議保額／金額：「建議你保 500 萬」「保額至少要 1000 萬」「補到 30 萬」
  { reason: "建議保額", re: /(建議|應該|最好|至少|要|可以)[^。！？\n]{0,6}(保|買|加保|投保|補)[^。！？\n]{0,4}\d[\d,，.]*\s*(萬|元)/ },
  { reason: "建議保額", re: /(保額|保險金額|額度)[^。！？\n]{0,8}(建議|至少|要|補到|拉到|提高到)[^。！？\n]{0,6}\d/ },
  // 推薦具體商品或保險公司
  { reason: "推薦商品", re: /(推薦|建議|可以考慮|適合你)[^。！？\n]{0,12}(人壽|產險|保險公司|這張|這款|商品|保單)/ },
  { reason: "提到公司名", re: /(南山|國泰|富邦|新光|三商美邦|台灣人壽|全球人壽|中國人壽|凱基|遠雄|安聯|保誠|宏泰|元大|第一金|合作金庫|法國巴黎|安達|友邦|台銀)人壽/ },
  // 解釋或比較條款
  { reason: "解釋條款", re: /(條款|契約)[^。！？\n]{0,10}(寫|規定|約定|載明)[^。！？\n]{0,10}(賠|給付|不賠|除外)/ },
  { reason: "比較條款", re: /(比|比較|勝過|優於|不如)[^。！？\n]{0,10}(這張|那張|別家|其他家|這款|商品)/ },
  // 保證承保／保證報酬（N16、N23）
  { reason: "保證用語", re: /(保證|一定)(會)?(承保|過件|賠|理賠|獲利|報酬|免稅|免遺產稅|免贈與稅)/ },
  // N25：保險給付不得宣稱一定免遺產稅
  { reason: "宣稱免稅", re: /(買|有|用)保險[^。！？\n]{0,6}(就|可以|能)[^。！？\n]{0,3}免(遺產|贈與)?稅/ },
];

// 4-ai：AI 把自己的猶豫寫進回覆（2026-10-12 實測：「點擊此處預約顧問…不行，不能說，不知道系統有沒有預約按鈕。這樣講就好：……」）
// 或把內部指令念出來（「最後問持續多久」「下一題」）。對客戶來說這是聊天，不是問卷
const LEAK = /不行，|不能說|這樣講就好|這樣說就好|我應該(說|問|回)|系統有沒有|不知道系統|下一題|這一輪|最後問|回到剛剛|撰寫考量|考量：|結果：|```|\*\*|字，符合|ask_now|still_missing|known/;

export function checkCompliance(text: string): ComplianceResult {
  const plain = text.replace(/<[^>]+>/g, "");
  for (const r of RULES) if (r.re.test(plain)) return { ok: false, reason: r.reason };
  if (LEAK.test(plain)) return { ok: false, reason: "思考外洩" };
  return { ok: true };
}

/** 需求點引導的一整輪輸出：回覆＋選項都要過（4-ai），還有長度上限 */
export function checkTurn(reply: string, chips: string[]): ComplianceResult {
  const r = checkCompliance(reply);
  if (!r.ok) return r;
  if (reply.replace(/<[^>]+>/g, "").length > 120) return { ok: false, reason: "回覆太長" };
  if (chips.length > 4) return { ok: false, reason: "選項太多" };
  for (const c of chips) {
    if (c.length > 20) return { ok: false, reason: "選項太長" };
    const cr = checkCompliance(c);
    if (!cr.ok) return { ok: false, reason: `選項${cr.reason}` };
    if (/\d[\d,，.]*\s*(萬|元)/.test(c)) return { ok: false, reason: "選項含金額" };
  }
  return { ok: true };
}

/** 連兩次被攔時改送的固定安全回覆 */
export const SAFE_REPLY =
  "這題要看條款實際怎麼寫、你的狀況適合多少，<b>面談時顧問會當面跟你說明</b>——這部分我不能代替他回答。";
