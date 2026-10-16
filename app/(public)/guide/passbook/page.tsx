import type { Metadata } from "next";
import Link from "next/link";

/*
 * 保險存摺下載教學（主管派工 10/16，顧問同意）。公開頁：客戶常在還沒下載前就點進來，不用登入。
 * 內容定稿：RADIA-派工/附件/保險存摺下載教學.html（依壽險公會《保險存摺操作說明手冊》v4.0 整理）——只搬內容，
 * 畫面用原型的元件（eyebrow／h2.t／sub、bookguide 步驟、gpwhy 問答），不仿公會的畫面、不放公會 logo；不提三商（4-aj）。
 * 上傳區塊（PassbookUpload）的「不知道怎麼下載？看教學」連到這裡；最後一步回 /analysis#upload。
 */
export const metadata: Metadata = {
  title: "保險存摺下載教學 · RADIA",
  description: "照步驟把壽險公會「保險存摺」的投保紀錄下載下來，上傳到 RADIA，顧問就能對著你手上真正有的保單幫你看。",
};

const ext = { target: "_blank", rel: "noopener noreferrer" } as const;
// 公會 App／網站上的按鈕名稱
const K = ({ children }: { children: React.ReactNode }) => <span className="gd-k">{children}</span>;

const PREP: [string, React.ReactNode][] = [
  ["你自己名下門號的手機", <>用手機驗證身分最快，不用讀卡機。驗證時要用行動網路（4G／5G），<b>先把 Wi-Fi 關掉</b>。</>],
  ["身分證", <>會問你身分證的「發證日期、發證地點、領補換類別」，都印在身分證正面下方。</>],
  ["信用卡或 ATM 轉帳", <>升級白金會員要繳 100 元，一年內可以不限次數下載。</>],
];

const FAQ: [string, React.ReactNode][] = [
  ["行動身分識別一直失敗", <>最常見的原因是連著 Wi-Fi，先關掉 Wi-Fi 改用行動網路。門號必須是你本人申辦的，用家人名下的門號、公司門號或預付卡都可能過不了。還是不行，就改用電腦加自然人憑證或晶片金融卡。</>],
  ["付了 100 元，還是看不到白金會員功能", <>付完要登出再重新登入。用 ATM 付款的話，要等 5～10 分鐘系統才會收到。</>],
  ["PDF 打不開，說密碼錯誤", <>密碼是被保險人的身分證字號，英文字母要大寫，總共 10 碼。</>],
  ["這 100 元可以退嗎？", <>白金會員屬於線上數位服務，公會在付款前會請你同意不適用 7 天鑑賞期，所以付了就不能退。</>],
  ["家人的保單也要一起看", <>保險存摺只能看到你自己是要保人或被保險人的保單。家人的保單要家人自己用他的身分證註冊、下載，再由他本人上傳。</>],
  ["弄到一半不想弄了", <>沒關係，直接<Link href="/advisors">約顧問</Link>，面談時再一起處理也可以。</>],
];

export default function PassbookGuide() {
  return (
    <article className="gd">
      <div className="eyebrow">教學</div>
      <h2 className="t">保險存摺下載教學</h2>
      <p className="sub">保險存摺是壽險公會的官方服務，把你在各家保險公司的保單集中在一個地方。照下面的步驟把它下載下來，上傳到 RADIA，顧問就能對著你手上真正有的保單幫你看。</p>
      <div className="gd-facts">
        <div><b>約 10 分鐘</b><span>註冊加申請</span></div>
        <div><b>約 5 分鐘</b><span>檔案寄到 Email</span></div>
        <div><b>NT$100／年</b><span>白金會員才能下載</span></div>
      </div>

      <h3 className="gd-h">先準備好這三樣</h3>
      <div className="bookguide gd-prep">
        {PREP.map(([t, d]) => (
          <div key={t} className="bgs"><span className="bgn" aria-hidden="true">✓</span><div><div className="bgt">{t}</div><div className="bgd">{d}</div></div></div>
        ))}
      </div>

      <h3 className="gd-h">步驟</h3>
      <ol className="gd-steps">
        <Step n={1} title="下載 App，或打開保險存摺網站">
          <p>建議直接在手機上做。App 叫「保險存摺」，下載後還可以綁指紋或臉部辨識登入。</p>
          <div className="gd-links">
            <a href="https://apps.apple.com/tw/app/%E4%BF%9D%E9%9A%AA%E5%AD%98%E6%91%BA/id1602613149" {...ext}>iPhone 下載 ↗</a>
            <a href="https://play.google.com/store/apps/details?id=tw.org.lia.roc.passbook" {...ext}>Android 下載 ↗</a>
            <a href="https://insurtech.lia-roc.org.tw/" {...ext}>保險存摺網站 ↗</a>
          </div>
        </Step>
        <Step n={2} title="註冊帳號">
          <p>點 <K>立即登入</K>，第一次使用再點 <K>立即註冊</K>。</p>
          <p>接著會出現個資告知聲明，<b>要滑到最下面</b>才能按同意。之後每次登入都會再出現一次。</p>
        </Step>
        <Step n={3} title="驗證身分">
          <p>用手機註冊時只會出現 <K>行動身分識別</K>，點它：</p>
          <ul>
            <li>系統會用你的手機門號確認是你本人，所以要用行動網路，不能連 Wi-Fi。</li>
            <li>輸入身分證上的發證日期、發證地點、領補換類別。</li>
            <li>最後填基本資料、設定登入密碼，就註冊完成了。</li>
          </ul>
          <div className="gd-warn"><b>注意：</b>身分證資料同一天打錯 3 次，當天就不能再驗證了。打之前先拿出身分證對一下。</div>
          <p className="gd-mute">用電腦註冊的話，也可以選自然人憑證或晶片金融卡，但要另外準備讀卡機。</p>
        </Step>
        <Step n={4} title="升級白金會員（100 元）" when="一年一次">
          <p>登入後到 <K>我的保單</K>，點 <K>升級白金會員</K>，在會員服務內容頁再點一次升級，選信用卡或 ATM 付款。</p>
          <ul>
            <li>信用卡大約 1 分鐘就生效；ATM 要等 5～10 分鐘。</li>
            <li>付完<b>登出再重新登入</b>，白金會員的功能才會出現。</li>
          </ul>
          <div className="gd-tip">普通會員只看得到第一張保單，也不能申請下載，所以這 100 元一定要付。付了之後一年內隨時都能再下載最新的，到期前一個月續約還有優惠。</div>
        </Step>
        <Step n={5} title="申請投保紀錄">
          <p>回到 <K>我的保單</K>（或首頁的快捷功能），點 <K>申請投保紀錄</K>：</p>
          <ul>
            <li>看完下載告知事項，往下確認資料。</li>
            <li>檢查你的資料和 Email 對不對，點 <K>送出申請</K>。</li>
            <li>之後可以點 <K>查看進度</K> 確認處理到哪裡。</li>
          </ul>
        </Step>
        <Step n={6} title="到 Email 收檔案" when="約 5 分鐘">
          <p>送出後大約 5 分鐘，公會就會把 PDF 寄到你剛剛確認的 Email。等了一陣子還沒收到，先看一下垃圾郵件匣，或點 <K>查看進度</K>。官方說明寫最久可能要 1～2 天。</p>
          <p>這個 PDF 有密碼，<b>密碼是被保險人的身分證字號</b>，開頭英文字母要大寫，例如 A123456789。</p>
        </Step>
        <Step n={7} title="上傳到 RADIA">
          <p>登入 RADIA，到 <K>我的分析</K> 的「上傳保險存摺」，選剛剛那個 PDF，再輸入身分證字號。</p>
          <div className="gd-tip">身分證字號只在你自己的手機或電腦上用來打開檔案，不會傳出去，我們也看不到。上傳的只有保單內容。</div>
          <Link className="btn gd-cta" href="/analysis#upload">去上傳保險存摺</Link>
        </Step>
      </ol>

      <h3 className="gd-h">信一直沒來？先傳截圖</h3>
      <div className="bookguide">
        <p className="gd-p">少數時候信會晚到。升級白金會員後，App 裡就能直接看到每一張保單，可以先截圖上傳：</p>
        {[<>到 <K>我的保單</K>，點每張保單的商品名稱，進到詳細頁。</>,
          <>截圖，畫面裡要看得到<b>保險公司、商品名稱、保額</b>。</>,
          <>到 RADIA 的「上傳保險存摺」點 <K>傳截圖</K>，一次最多 10 張。</>].map((d, i) => (
          <div key={i} className="bgs"><span className="bgn">{i + 1}</span><div className="bgd" style={{ marginTop: 2 }}>{d}</div></div>
        ))}
        <p className="gd-mute">PDF 比較完整，等收到之後最好再補傳一次。</p>
      </div>

      <h3 className="gd-h">卡住了？</h3>
      {FAQ.map(([q, a]) => (
        <details key={q} className="gpwhy"><summary>{q}</summary><div className="gpwb">{a}</div></details>
      ))}

      <p className="gd-src">依壽險公會《保險存摺操作說明手冊》v4.0 整理。保險存摺的畫面、按鈕名稱和收費可能會更新，請以保險存摺網站上顯示的為準。</p>
    </article>
  );
}

function Step({ n, title, when, children }: { n: number; title: string; when?: string; children: React.ReactNode }) {
  return (
    <li className="gd-step">
      <div className="gd-sh"><span className="bgn">{n}</span><h4>{title}</h4>{when && <span className="tagx ok">{when}</span>}</div>
      <div className="gd-sb">{children}</div>
    </li>
  );
}
