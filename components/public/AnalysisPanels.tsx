import { safeHtml } from "@/lib/consult/safeHtml";
import type { AnalysisView, PanelData } from "@/lib/consult/analysis";
import { PassbookConfirm, PassbookPoller, PassbookRetry } from "./PassbookParts";
import { CASES, KIND_LABEL, VERIFIED_AT } from "@/lib/consult/cases";

/*
 * 計算區塊：結構、class、文字一律照原型 v38 的 SEC.*（dPanelSetup）。樣式在 app/radia.css（自動搬自原型）。
 * 對話右欄與「我的分析」共用同一套——同一份資料、兩個入口（4-ag）。
 * 數字全部來自 lib/calc/engine.ts；鎖住的區塊伺服器根本沒送內容過來（模糊區只放假的骨架，不含任何數字）。
 */

const W = (n: number) => Math.round(n / 10000).toLocaleString();
const N = (n: number) => Math.round(n).toLocaleString();

const ASSUMED_LABEL: Record<string, string> = {
  age: "年齡", food: "伙食", home: "住", trans: "交通", fun: "娛樂", ret: "退休年齡", die: "規劃到幾歲", save: "每月存款",
  saved: "現有準備", est: "資產總額", re: "不動產比重", surv: "遺族每月開銷", loan: "貸款", dep: "依賴倍數", inc: "年收入",
};
function Assumed({ keys }: { keys: string[] }) {
  const ks = [...new Set(keys)].filter(k => ASSUMED_LABEL[k]);
  if (!ks.length) return null;
  return <div className="gprn" style={{ marginTop: 10 }}>還沒聊到：{ks.map(k => ASSUMED_LABEL[k]).join("、")}——先用一般情況估，聊到後會自動更新。</div>;
}

const Pan = ({ t, n, children }: { t: string; n?: React.ReactNode; children: React.ReactNode }) => (
  <div className="dpan dfx"><div className="dph"><span className="dpt">{t}</span>{n !== undefined && <span className="dpn">{n}</span>}</div>{children}</div>
);

const PROC: [string, string, "frz" | "ok"][] = [
  ["第 0～2 週", "死亡登記、除戶、申請謄本", "frz"], ["第 1～6 個月", "遺產稅申報期", "frz"], ["第 6～9 個月", "國稅局核定", "frz"],
  ["第 9 個月", "繳稅、取得完稅證明", "frz"], ["第 9～11 個月", "繼承登記、存款解凍", "frz"], ["之後", "遺產分割完成", "ok"],
];
const LVT: Record<string, string> = { must: "一定要補", boost: "建議補強", ok: "夠了", later: "這輪先不做" };
const sm = (color: string, text: React.ReactNode) => <><br /><span style={{ fontFamily: "var(--ui)", fontSize: 11, color }}>{text}</span></>;

export function Panel({ d }: { d: PanelData }) {
  if ("needsPolicies" in d) {
    return d.key === "gaps"
      ? <Pan t="該補什麼"><div className="gprn">{d.hasPolicies ? <>缺口要補哪些、補多少，<b>面談時顧問會依你的保單一項一項跟你看</b>。</> : <>要有你的保單才算得出來。<b>上傳保險存摺</b>後，這裡會列出缺口。</>}</div></Pan>
      : <Pan t="方向確認"><div className="gprn">{d.hasPolicies ? "面談時跟顧問一起確認方向。" : "要有你的保單才整理得出方向。"}</div></Pan>;
  }
  switch (d.key) {
    case "now": return <NowPanel d={d} />;
    case "gaps": return <GapsPanel rows={d.rows} />;
    case "sum": return (
      <div className="dpan dfx"><div className="dsum">
        <div className="dsr"><span>一定要補</span><b>{d.must.length ? d.must.join("、") : "—"}</b></div>
        <div className="dsr"><span>建議補強</span><b>{d.boost.length ? d.boost.join("、") : "—"}</b></div>
        <div className="dsr"><span>保費</span><b style={{ fontWeight: 600, color: "var(--muted)" }}>面談時由顧問試算</b></div>
      </div>
        <div className="dmark" style={{ marginTop: 11 }}>保費要看具體商品與核保結果，<b>由顧問用公司建議書幫你試算</b>——這裡不先估一個可能不準的數字。</div></div>
    );
    case "route": {
      const R = d.r;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">你現在的位置</span><span className="dpn">{R.age} 歲 · {R.stage}</span></div>
          <div className="stagebar">
            <div className={`stg ${R.acc ? "on" : "done"}`}><b>累積期</b><span>～49 歲</span><small>跌了有時間漲回來</small></div>
            <div className={`stg ${R.acc ? "" : "on"}`}><b>保全期</b><span>50 歲～</span><small>不能再賠，時間不夠修復</small></div>
          </div>
          <div className="rtmain">建議路線　<b>{R.main}</b></div>
          <div className="gpwy" style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: safeHtml(R.why) }} />
          <div className="ndl" style={{ marginTop: 11 }}>{R.tools.map(t => <div key={t} className="ndi"><span className="ndk">工具</span><span className="ndv">{t}</span></div>)}</div>
          <div className="gprn" style={{ marginTop: 11 }}><b>50 歲是分水嶺，不是因為規定</b>，是因為「賠掉之後還有沒有時間賺回來」。<br />
            {R.risk === 2 && !R.acc && <>你願意承受波動，但這個階段<b>時間才是限制因素</b>。</>}
            {R.risk === 1 && R.acc && <>你時間夠但不想虧——<b>工具要配合人，不是人配合工具</b>。</>}
            {R.risk === 0 && <>你還沒有明確偏好，<b>這題面談時顧問會用適合度分析（KYC）幫你問清楚</b>，那是法規要求的程序。</>}</div>
        </div>
      );
    }
    case "exp": {
      const c = d.r;
      const rows: [string, number, number, string][] = [
        ["伙食與日用", c.food, c.food, "持平"], ["住", c.home, c.homeRet, c.homeRet < c.home ? "↓ 房貸繳清" : "持平"],
        ["交通", c.trans, c.transRet, "↓ 不通勤"], ["醫療與保健", 0, c.medical, "↑ 會升"], ["娛樂、旅遊、人情", c.fun, 0, "基礎版不計"],
      ];
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">你現在每個月花在哪裡</span><span className="dpn">你說的</span></div>
          <div className="exg">
            <div className="exr exh"><span>項目</span><span className="exv">現在</span><span className="exc">退休後</span></div>
            {rows.map(([k, a, b, t]) => (
              <div key={k} className={`exr ${b === 0 && a > 0 ? "off" : ""}`}><span>{k}</span><span className="exv">{a ? N(a) : "—"}</span>
                <span className={`exc ${t.includes("↑") ? "up" : t.includes("↓") ? "dn" : "eq"}`}>{b ? N(b) : "—"}</span></div>
            ))}
            <div className="exr tot"><span>基礎生活費</span><span className="exv">{N(c.baseNow)}</span><span className="exc eq">{N(c.baseRet)}</span></div>
          </div>
          <div className="gprn" style={{ marginTop: 10 }}>大部分人以為退休後花得比較少。<br />交通和人情確實會降，<b>但醫療是升的</b>——而且這還沒算長照。</div>
          <Assumed keys={d.assumed.filter(k => ["food", "home", "trans", "fun"].includes(k))} />
        </div>
      );
    }
    case "retgap": {
      const c = d.r, L = c.labor;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">退休缺口</span><span className="dpn">只算最基礎</span></div>
          <div className="fnbig" style={{ margin: "0 0 12px" }}><b>{W(c.gap)}</b><span>萬</span></div>
          <div className="exg">
            <div className="exr"><span>退休後基礎月開銷（今天物價）</span><span className="exv">{N(c.baseRet)}</span><span className="exc eq" /></div>
            <div className="exr"><span>{c.yrs} 年後（通膨 2%）</span><span className="exv">{N(c.needM)}</span><span className="exc up">×{c.inf.toFixed(2)}</span></div>
            <div className="exr tot"><span>{c.ret}→{c.die} 歲共 {c.span} 年要花</span><span className="exv">{W(c.total)} 萬</span><span className="exc eq" /></div>
            <div className="exr"><span>− 勞保年金＋勞退</span><span className="exv">{W(c.gov)} 萬</span><span className="exc dn" /></div>
            <div className="exr"><span>− 你現有的準備</span><span className="exv">{W(c.saved)} 萬</span><span className="exc dn" /></div>
            <div className="exr tot"><span>還要自己生出來</span><span className="exv" style={{ color: "var(--must)" }}>{W(c.gap)} 萬</span><span className="exc eq" /></div>
          </div>
          {c.add > 0
            ? <div className="frzband" style={{ marginTop: 11 }}>照你現在每月存 {N(c.save)}，到 {c.ret} 歲會有 <b>{W(c.accNow)} 萬</b>，但需要 <b>{W(c.needSelf)} 萬</b>。<br /><b>每月要多存 {N(c.add)} 元</b>才補得上。</div>
            : <div className="frzband" style={{ marginTop: 11 }}>照你現在每月存 {N(c.save)}，到 {c.ret} 歲會有 <b>{W(c.accNow)} 萬</b>，需要的是 <b>{W(c.needSelf)} 萬</b>。<br /><b>照現在的存法就補得上</b>——前提是這 {c.yrs} 年都持續存、中間不動用。</div>}
          <div className="gprn" style={{ marginTop: 10 }}>⚠️ <b>沒有假設任何投資報酬率</b>——這是「光靠存」的數字。<br />報酬是加分，不是前提。<b>我不想給你一個看起來很美但做不到的數字。</b><br />
            勞保是估算（{L.actual ? "依你的實際紀錄" : `${L.insuredFromIncome ? "依你的年收" : "沒問收入，用一般"}投保薪資 ${N(L.insuredSalary)}、年資 ${L.years} 年；${L.monthly ? `月領約 ${N(L.monthly)}（${L.annuityStartAge} 歲起）` : `一次領約 ${W(L.lumpSum)} 萬`}、勞退累積 ${W(L.pensionLump)} 萬`}）。</div>
          <Assumed keys={d.assumed} />
        </div>
      );
    }
    case "taxest": {
      const t = d.r;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">遺產稅試算</span><span className="dpn">示意</span></div>
          <div className="taxg">
            <div className="taxr"><span>遺產總額</span><b>{W(t.est)} 萬</b></div>
            <div className="taxr sub"><span>− 免稅額 ＋ 各項扣除額</span><b>{W(t.deductTotal)} 萬</b></div>
            <div className="taxr"><span>課稅遺產淨額</span><b>{W(t.net)} 萬</b></div>
            <div className="taxr tot"><span>應納遺產稅</span><b>{W(t.tax)} 萬</b></div>
          </div>
          <div className="gprn" style={{ marginTop: 10 }}>⚠️ 假設家人是<b>配偶 ＋ {t.children} 位子女</b>。免稅額與扣除額依財政部 115 年公告，<b>此為示意試算</b>。</div>
          <Assumed keys={d.assumed} />
        </div>
      );
    }
    case "proc": return (
      <div className="dpan dfx"><div className="dph"><span className="dpt">走完流程要多久</span><span className="dpn">保守估 {d.months} 個月</span></div>
        <div className="tlx">{PROC.map(([m, t, c]) => (
          <div key={m} className="tlrow" style={{ gridTemplateColumns: "86px 1fr" }}><span className="tlm">{m}</span><div className={`tlc ${c}`}><div className="tlt" style={{ fontSize: 12.5 }}>{t}</div></div></div>
        ))}</div>
        <div className="frzband" style={{ marginTop: 8 }}>紅色那五段，<b>名下存款一毛都領不出來</b>。<br />有遺囑要認證、繼承人在國外、或任何一人不配合用印——<b>再加好幾個月都很常見</b>。</div>
      </div>
    );
    case "taxsrc": {
      const t = d.r;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">稅源缺口</span><span className="dpn">不只算稅</span></div>
          <div className="fnbig" style={{ margin: "0 0 12px" }}><b>{W(t.gap)}</b><span>萬</span></div>
          <div className="srcg">
            <div className="srcr"><span>遺產稅</span><b>{W(t.tax)} 萬</b></div>
            <div className="srcr"><span>喪葬實際支出</span><b>{W(t.funeral)} 萬</b></div>
            <div className="srcr"><span>遺族這 {t.months} 個月的生活費</span><b>{W(t.survTotal)} 萬</b></div>
            <div className="srcr"><span>程序費用</span><b>{W(t.procedure)} 萬</b></div>
            <div className="srcr tot"><span>合計需要</span><b>{W(t.need)} 萬</b></div>
          </div>
          <div className="srcg" style={{ marginTop: 9 }}>
            <div className="srcr no"><span>你名下的存款{sm("var(--must)", "⚠️ 完稅前凍結，不能算")}</span><b>{W(t.frozenCash)} 萬</b></div>
            <div className="srcr"><span>家人自有資金{!t.ownKnown && sm("var(--muted)", "還沒問到，先以 0 計")}</span><b>{W(t.own)} 萬</b></div>
            <div className="srcr tot gap"><span>實際動得了</span><b>{W(t.own)} 萬</b></div>
          </div>
          <div className="frzband" style={{ marginTop: 11 }}>最常見的結果是<b>賤價賣房繳稅</b>，急售通常要打八折以下。<br />或是兄弟姊妹各自墊錢，然後為了誰出多少翻臉。</div>
          <Assumed keys={d.assumed} />
        </div>
      );
    }
    case "survgap": {
      const t = d.r;
      const lifeNote = !d.life ? "還沒有你的保單，先以 0 計" : [`依你的保險存摺${d.life.preliminary ? "（含 AI 初步讀取）" : ""}`, d.life.missing ? `尚未含 ${d.life.missing} 張還在確認的` : ""].filter(Boolean).join("，");
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">遺族長期保障缺口</span><span className="dpn">年收 × {t.mult} 倍</span></div>
          <div className="fnbig" style={{ margin: "0 0 12px" }}><b>{W(t.longGap)}</b><span>萬</span></div>
          <div className="srcg">
            <div className="srcr"><span>收入替代{sm("var(--muted)", `年收 ${W(t.inc)} 萬 × ${t.mult} 倍`)}</span><b>{W(t.repl)} 萬</b></div>
            <div className="srcr"><span>貸款餘額{sm("var(--must)", "⚠️ 不會因為人走了就停")}</span><b>{W(t.loan)} 萬</b></div>
            <div className="srcr tot"><span>長期要撐的</span><b>{W(t.longNeed)} 萬</b></div>
            <div className="srcr"><span>− 現有壽險{sm("var(--muted)", lifeNote)}</span><b>{W(t.haveLife)} 萬</b></div>
            <div className="srcr tot gap"><span>還差</span><b>{W(t.longGap)} 萬</b></div>
          </div>
          <div className="twolayer">
            <div className="tl2"><span className="tl2h">第一層 · 流動性</span><b>{W(d.layer1)} 萬</b><small>錢在但動不了（那 {d.months} 個月）</small></div>
            <div className="tl2"><span className="tl2h">第二層 · 金額</span><b>{W(t.longGap)} 萬</b><small>錢根本不夠（長期替代）</small></div>
          </div>
          <div className="frzband" style={{ marginTop: 11 }}><b>這兩層性質完全不一樣，不能混在一起算。</b><br />第一層靠<b>指定受益人的壽險</b>解決——快，7～15 天就到。<br />第二層是<b>保額本身要夠</b>——這是另一件事。</div>
          <div className="gprn" style={{ marginTop: 10 }}>⚠️ <b>{t.mult} 倍是起點，不是答案。</b><br />實際要看小孩多大、配偶能不能工作、房貸還剩幾年。<br /><b>做不到全部也沒關係</b>——實務上最常見的折衷是先補到 <b>{W(t.minGap)} 萬</b>（貸款 ＋ 孩子成年前五年），其他等收入上來再說。</div>
          <Assumed keys={d.assumed} />
        </div>
      );
    }
    case "xfer": {
      const t = d.r;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">生前贈與 vs 身故繼承</span><span className="dpn">兩條路</span></div>
          <div className="xf">
            <div className={`xfc ${t.pick === 1 ? "on" : ""}`}>
              <div className="cfh">生前把房子給小孩</div>
              <div className="xfr"><span>課什麼稅</span><b>贈與稅</b></div>
              <div className="xfr"><span>怎麼估價</span><b>公告現值</b></div>
              <div className="xfr"><span>每年免稅額</span><b>{W(t.giftExemption)} 萬／人</b></div>
              <div className="xfr good"><span>當下稅負</span><b>通常低很多</b></div>
              <div className="xfr bad"><span>⚠️ 小孩日後賣掉</span><b>房地合一稅重</b></div>
              <div className="cfgap">取得成本是贈與時的<b>公告現值（低）</b>，賣價減成本的價差大，稅就重。<b>當下省的，有可能在賣房那天連本帶利吐回去。</b></div>
            </div>
            <div className={`xfc ${t.pick === 2 ? "on" : ""}`}>
              <div className="cfh">走了之後再繼承</div>
              <div className="xfr"><span>課什麼稅</span><b>遺產稅</b></div>
              <div className="xfr"><span>怎麼估價</span><b>公告現值</b></div>
              <div className="xfr"><span>免稅額</span><b>{W(t.estateExemption)} 萬</b></div>
              <div className="xfr good"><span>不用分年，一次到位</span><b>—</b></div>
              <div className="xfr bad"><span>⚠️ 流程與凍結</span><b>{t.months} 個月以上</b></div>
              <div className="cfgap">免稅額一次用得多，但<b>要等流程跑完</b>，而且那 {t.months} 個月家裡要有現金撐著。</div>
            </div>
          </div>
          <div className="frzband" style={{ marginTop: 11 }}><b>重點不是哪個稅比較少。</b><br />要看<b>他會不會賣、什麼時候賣、你還有多少年可以分年贈與</b>。<br />這題沒有標準答案——<b>一定要跟顧問當面算，而且通常還要會計師一起看</b>。</div>
          <div className="gprn" style={{ marginTop: 10 }}>⚠️ 免稅額、稅率與房地合一稅規定依財政部最新公告為準，<b>以上為示意</b>。<br />二親等間財產移轉另有「以贈與論」等規定，實際操作務必洽稅務專業人員。</div>
        </div>
      );
    }
    case "edugap": {
      const e = d.r;
      return (
        <div className="dpan dfx"><div className="dph"><span className="dpt">教育金</span><span className="dpn">私立大學＋研究所估 {W(e.total)} 萬</span></div>
          <div className="exg">
            <div className="exr"><span>現在開始（還有 {e.years} 年）</span><span className="exv">{N(e.monthly)}</span><span className="exc dn">／月</span></div>
            <div className="exr"><span>再等五年（剩 {e.years5} 年）</span><span className="exv">{N(e.monthly5)}</span><span className="exc up">／月</span></div>
            <div className="exr tot"><span>晚五年的代價</span><span className="exv" style={{ color: "var(--must)" }}>＋{N(e.delayCost)}</span><span className="exc eq">／月</span></div>
          </div>
          <div className="frzband" style={{ marginTop: 11 }}><b>教育金的時間不能商量</b>——<br />他不會因為你還沒存夠就晚五年上大學。</div>
        </div>
      );
    }
    case "fsum": return (
      <div className="dpan dfx"><div className="dsum">
        <div className="dsr"><span>已整理</span><b>{d.facts} 項狀況</b></div>
        <div className="dsr"><span>還需要</span><b style={d.hasPolicies ? undefined : { color: "var(--amber)" }}>{d.hasPolicies ? "保單已整理" : "你的保單"}</b></div>
        <a className="btn dsbtn" href="/advisors">去挑顧問</a>
      </div>
        <div className="dmark" style={{ marginTop: 11 }}>{d.hasPolicies ? <>顧問會先看過你的保單，面談就能直接談<b>補強前後的差異</b>。</> : <>面談前上傳保險存摺也來得及。<br />顧問會先看過，面談就能直接談<b>補強前後的差異</b>。</>}</div></div>
    );
  }
}

/** 該補什麼（N18、G1–G8；原型 SEC.gaps）：前兩級展開、後兩級收在「其他 N 項」但一定看得到 */
function GapsPanel({ rows }: { rows: Extract<PanelData, { key: "gaps"; rows: unknown }>["rows"] }) {
  const top = rows.filter(r => r.level === "must" || r.level === "boost").sort((a, b) => (a.level === "must" ? 0 : 1) - (b.level === "must" ? 0 : 1));
  const rest = rows.filter(r => r.level === "ok" || r.level === "later");
  return (
    <div className="dpan dfx"><div className="dph"><span className="dpt">該補什麼</span><span className="dpn">依急迫性排</span></div>
      {top.map(r => (
        <div key={r.key} className={`gpi ${r.level}`}>
          <div className="gph2"><span className="gpnm">{r.label}</span><span className={`lvl ${r.level}`}>{LVT[r.level]}</span></div>
          <div className="gpvs">現在 {r.current}{r.preliminary && "（初步）"}{r.standard && <><span>→</span><b>{r.standard}</b></>}</div>
          <div className="gpwy">{r.reason}{r.adjusted && "（顧問調整）"}</div>
          {r.pendingNote && <div className="gprn" style={{ marginTop: 4 }}>{r.pendingNote}</div>}
          <Evidence k={r.key} />
        </div>
      ))}
      {rest.length > 0 && (
        <div className="gprest">
          <div className="gprh">其他 {rest.length} 項</div>
          {rest.map(r => (
            <div key={r.key} className="gprl"><span className="gpnm2">{r.label}</span><span style={{ color: "var(--muted)" }}>{r.current}</span><span className={`lvl ${r.level}`}>{LVT[r.level]}</span></div>
          ))}
          <div className="gprn">{rest.filter(r => r.level === "later").map(r => r.reason).filter((v, i, a) => a.indexOf(v) === i).join("；")}<br />
            這輪先不做不是永遠不做，是<b>不要一次把保費做滿</b>。</div>
        </div>
      )}
    </div>
  );
}

/**
 * 為什麼要補？看數據（A3b，原型 GAPS 的佐證區）。素材在 lib/consult/cases.ts，每筆都有出處與年份（N17）。
 * 用 <details> 開合：這個元件也在伺服器頁面（我的分析、顧問端客戶頁）出現，不能靠前端狀態
 */
function Evidence({ k }: { k: string }) {
  const c = CASES[k as keyof typeof CASES];
  if (!c) return null;
  return (
    <details style={{ marginTop: 6 }}>
      <summary className="alink" style={{ listStyle: "none", cursor: "pointer", padding: 0 }}>為什麼要補？看數據</summary>
      <div className="gpev">
        <div className="evh">📊 公開統計</div>
        {c.stats.map(s => (
          <div key={s.n + s.label}>
            <div className="evs"><span className="evn">{s.n}</span><span className="evl">{s.label}</span></div>
            <div className="evsrc" style={{ color: "var(--muted)" }}>{KIND_LABEL[s.kind]}｜<a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>{s.source}</a>｜{s.year}</div>
          </div>
        ))}
        {c.scenario && (
          <div style={{ marginTop: 11, paddingTop: 9, borderTop: "1px dashed var(--line)" }}>
            <div className="evh">🧮 情境試算，非統計</div>
            <div className="evt">{c.scenario.title}：{c.scenario.total}</div>
            {c.scenario.items.map(i => <div key={i.label} className="evd">・{i.label} ＝ {i.amount}（{i.ref}）</div>)}
            <div className="evd">{c.scenario.excluded}。這是用上面的公開數字算出來的量級，不代表你會遇到，也不是平均。</div>
          </div>
        )}
        <div className="evsrc" style={{ color: "var(--muted)" }}>這些是公開資料，你可以點來源自己查（{VERIFIED_AT} 查證）。</div>
      </div>
    </details>
  );
}

/** 你現在的保障（原型 SEC.now 的十格）＋存摺的各個階段（讀取、確認、對版本） */
function NowPanel({ d }: { d: Extract<PanelData, { key: "now" }> }) {
  const pb = d.passbook;
  if (!pb?.upload) return <Pan t="你現在的保障"><div className="gprn">要有你的保單才算得出來。<b>上傳保險存摺</b>後，這裡會列出你現在有哪些保障。</div></Pan>;
  const st = pb.upload.status;
  if (st === "queued" || st === "reading") return (
    <Pan t="你現在的保障" n="讀取中"><PassbookPoller status={st} />
      <div className="statusline" style={{ margin: 0 }}><span className="dotp" /><span>正在讀你的存摺，通常不到一分鐘。<b>對話可以繼續</b>，讀好會出現在這裡。</span></div></Pan>
  );
  if (st === "failed") return <Pan t="你現在的保障" n="沒讀成功"><div className="rd-err" style={{ marginTop: 0 }}>{pb.upload.error ?? "存摺沒讀成功"}</div><PassbookRetry /></Pan>;
  if (st === "confirming") return <Pan t="你現在的保障" n="請確認"><PassbookConfirm uploadId={pb.upload.id} policies={pb.policies} /></Pan>;
  const own = pb.policies.filter(p => !p.forOther && p.matchStatus !== "removed");
  if (st === "matching") return (
    <Pan t="你現在的保障" n="對商品資料庫中"><PassbookPoller status={st} />
      <div className="statusline" style={{ margin: "0 0 10px" }}><span className="dotp" /><span>正在找每一張的條款版本——找到的用<b>顧問審過的給付公式</b>算，還沒審過的先讀條款（每張約 40 秒）。</span></div>
      <div className="ndl">{own.map(p => <div key={p.id} className="ndi"><span className="ndk">讀到</span><span className="ndv">{p.productName}・{p.amountText}</span></div>)}</div></Pan>
  );
  const c = pb.counts;
  return (
    <div className="dpan dfx"><div className="dph"><span className="dpt">你現在的保障</span><span className="dpn">{c.total - c.removed - c.others} 張保單合併</span></div>
      <div className="dcl">{(pb.coverage ?? []).map(r => (
        <div key={r.key} className={`dci ${r.value ? "" : "nil"}`}><span className="dcn">{r.label}</span>
          <span className="dcv">{r.value ?? "沒有"}{r.preliminary && "＊"}{r.missing > 0 && `（尚未含 ${r.missing} 張）`}</span></div>
      ))}</div>
      {(c.preliminary > 0 || c.pending > 0) && (
        <div className="gprn" style={{ marginTop: 10 }}>
          {c.preliminary > 0 && <>標＊的是 <b>AI 讀條款算出來的</b>，顧問面談前會再核對。<br /></>}
          {c.pending > 0 && <><b>{c.pending} 張還在確認</b>——不是你沒有這張，是資料庫還沒對到它的條款，確認好會自動補上。</>}
        </div>
      )}
      <details className="gpwhy" style={{ marginTop: 10 }}>
        <summary>每一張保單的明細</summary>
        <div className="ndl" style={{ marginTop: 8 }}>
          {own.concat(pb.policies.filter(p => p.forOther && p.matchStatus !== "removed")).map(p => (
            <div key={p.id} className="ndi" style={{ flexDirection: "column", alignItems: "flex-start" }}>
              <span className="ndv"><b>{p.productName}</b>　{p.forOther ? `被保險人：${p.forOther}` : p.matchStatus === "matched" ? "已核對" : p.matchStatus === "ai_read" ? "AI 初步讀取" : "還在確認"}</span>
              <span className="ndv" style={{ fontSize: 12, color: "var(--muted)" }}>{p.amountText}{p.effectiveDate && ` · ${p.effectiveDate} 生效`}{p.matchNote && p.matchStatus !== "matched" && p.matchStatus !== "ai_read" && ` · ${p.matchNote}`}</span>
              {p.items.length > 0 && <span className="ndv" style={{ fontSize: 12 }}>{p.items.slice(0, 8).map(i => `${i.name} ${i.value}`).join("　")}</span>}
            </div>
          ))}
        </div>
      </details>
      <div className="gprn" style={{ marginTop: 10 }}>這裡只整理<b>你現在有什麼</b>。保單內容與條款怎麼解讀，面談時由顧問說明。</div>
    </div>
  );
}

const fmtDate = (iso: string) => new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/** 鎖卡（原型 lockcard＋lockwrap，4-af／4-ah）。模糊區是假骨架：伺服器沒送鎖住的內容，這裡只畫輪廓 */
export function LockCard({ a }: { a: AnalysisView }) {
  if (a.unlocked || a.locked.length === 0) return null;
  return (
    <>
      <div className="lockcard">
        <div className="lkh"><span className="lkic">🔒</span><span className="lkt">下面這些我已經算好了</span></div>
        <div className="lkd">但<b>完整內容要面談時跟顧問一起看</b>。<br />不是刁難——<b>保額、商品、保費要由登錄的顧問當面說明條款</b>，這是規定。</div>
        {a.headlines.length > 0 && <div className="lkl">{a.headlines.map(h => <div key={h.label} className="lkr"><span className="lkk">{h.label}</span><span className="lkn">{h.value}</span><span className="lkx">已算出</span></div>)}</div>}
        <div className="lkl">{a.locked.map(l => <div key={l.key} className="lkr"><span className="lkk">🔒</span><span>{l.title}</span><span className="lkx">{l.hint}</span></div>)}</div>
        {a.booking?.status === "booked"
          ? <div className="statusline" style={{ margin: "4px 0 0" }}><span className="dotp" /><span>已約好 <b>{fmtDate(a.booking.startsAt)}</b>。<b>面談時顧問會跟你一起打開</b>，談完就一直留在這裡。</span></div>
          : <a className="btn lkbtn" href="/advisors">預約顧問，一起看完整的</a>}
        <div className="lkfoot">這份一直留在「<b>我的分析</b>」，<b>之後你隨時可以回來看</b>。<br />不想談也可以——<b>上面你已經看到的部分不會收回去</b>。</div>
      </div>
      <div className="lockwrap" aria-hidden="true"><div className="lockblur">
        {a.locked.map(l => (
          <div key={l.key} className="dpan"><div className="dph"><span className="dpt">{l.title}</span></div>
            <div className="exg">{[0, 1, 2, 3].map(i => <div key={i} className="exr"><span>　　　　　　　</span><span className="exv">—</span><span className="exc" /></div>)}</div></div>
        ))}
      </div></div>
    </>
  );
}

export function AnalysisPanels({ a }: { a: AnalysisView }) {
  return <>{a.open.map(d => <Panel key={d.key} d={d} />)}<LockCard a={a} /></>;
}
