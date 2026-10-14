/*
 * AI 諮詢的骨架（實作設計 I1）：程式決定下一步問什麼，AI 只負責把自由輸入聽懂、講得像人。
 * ⚠️ 原本自動產生自原型 v37 的 FLOW／TRENDS／EDU。2026-10-12 決議 4-ai 起手改：健康路線 s003～s024（媽媽中風示範劇本）
 *    換成單一 need 步驟，問法交給 lib/consult/needs.ts ＋ AI；開場選項與醫療趨勢卡的連接句去掉人設。
 * W1a 是種子資料；W1b 改由管理後台維護（I3／I7），屆時這份變成初始內容。
 *
 * 步驟型別：ai 說一句｜ask 問一題（等使用者）｜need 需求點引導（4-ai，AI 每輪問一點，READY 齊了才往下）｜trd 醫療趨勢卡｜panel 右欄出一塊｜ph 階段｜hl 強調某格｜up 請上傳存摺
 * br／sub：只在該分支（health｜finance）／財務子路線（ret｜tax｜edu）出現
 * skipIfSub：已經決定子路線就跳過（4-ai 10/13 顧問定案：財務版「最擔心」直接決定子路線，答「說不上來」才回頭問「從哪一塊開始看」）
 */
export const SCRIPT_VERSION = "seed-v40-4ai-lock5";

export type Option = { x: string; key?: string; label?: string; health?: boolean; v?: string; n?: number; r?: "health" | "finance"; f?: "ret" | "tax" | "edu" };
export type Step =
  | { id: string; t: "ai"; br?: string; sub?: string; skipIfSub?: boolean; h: string }
  | { id: string; t: "ask"; br?: string; sub?: string; skipIfSub?: boolean; keys: string[]; o: Option[] }   // keys：這題可能存的需求點（空＝反應題，不存）
  | { id: string; t: "trd" | "panel" | "ph" | "hl"; br?: string; sub?: string; k: string | number }
  | { id: string; t: "up"; br?: string; sub?: string }
  | { id: string; t: "need"; br?: string; sub?: string };

export const STEPS: Step[] = [
 {
  "id": "s000",
  "t": "ph",
  "k": 0
 },
 {
  "id": "s001",
  "t": "ai",
  "h": "你好，我是 RADIA。<b>我是 AI</b>，幫你把狀況整理好；判斷會由顧問跟你確認。<br>先不用急著講保單——你今天會點進來，是因為最近發生了什麼事嗎？"
 },
 {
  "id": "s002",
  "t": "ask",
  "keys": [
   "trigger",
   "intent"
  ],
  "o": [
   {
    "x": "家裡有人生病或要照顧",
    "key": "trigger",
    "label": "起因",
    "health": true,
    "v": "家人生病或需要照顧",
    "r": "health"
   },
   {
    "x": "想看看我的保單夠不夠",
    "key": "intent",
    "label": "來意",
    "health": false,
    "v": "想確認現有保單夠不夠",
    "r": "health"
   },
   {
    "x": "想算算未來需要準備多少錢",
    "key": "intent",
    "label": "來意",
    "health": false,
    "v": "想做財務準備試算",
    "r": "finance"
   }
  ]
 },
 {
  "id": "h_need",
  "t": "need",
  "br": "health"
 },
 {
  "id": "s025",
  "t": "ai",
  "br": "health",
  "h": "那在我們看你的保單之前，我想先讓你知道<b>這十年醫療發生了什麼變化</b>——<br>因為這會直接影響保單現在還賠不賠得到。"
 },
 {
  "id": "s026",
  "t": "trd",
  "br": "health",
  "k": "t1"
 },
 {
  "id": "s027",
  "t": "ai",
  "br": "health",
  "h": "這是第一個變化。還有第二個，而且影響更大。"
 },
 {
  "id": "s028",
  "t": "trd",
  "br": "health",
  "k": "t2"
 },
 {
  "id": "s029",
  "t": "ask",
  "br": "health",
  "keys": [],
  "o": [
   {
    "x": "所以我買的可能都沒用？"
   },
   {
    "x": "那我該怎麼知道我的夠不夠？"
   }
  ]
 },
 {
  "id": "s030",
  "t": "ai",
  "br": "health",
  "h": "不會沒用，<b>但很可能不是為現在的醫療設計的</b>。<br>早期的保單多半以日額型為主，那個年代住院天數長，日額型是合理的選擇。"
 },
 {
  "id": "s031",
  "t": "ai",
  "br": "health",
  "h": "還有第三個變化，這個是很多家庭都沒準備到的。"
 },
 {
  "id": "s032",
  "t": "trd",
  "br": "health",
  "k": "t3"
 },
 {
  "id": "s033",
  "t": "ai",
  "br": "health",
  "h": "所以我們不要猜。<br>你可以上傳保險存摺，我直接把你的保單攤開來看——<b>現在的醫療，哪些接得住、哪些接不住</b>。"
 },
 {
  "id": "s034",
  "t": "ask",
  "br": "health",
  "keys": [],
  "o": [
   {
    "x": "好，我傳"
   }
  ]
 },
 {
  "id": "s035",
  "t": "up",
  "br": "health"
 },
 {
  "id": "s036",
  "t": "ph",
  "br": "health",
  "k": 1
 },
 {
  "id": "s037",
  "t": "ai",
  "br": "health",
  "h": "讀完了。<b>右邊</b>是你現在有的——我把你的保單疊成一張表。"
 },
 {
  "id": "s038",
  "t": "panel",
  "br": "health",
  "k": "now"
 },
 {
  "id": "s039",
  "t": "ai",
  "br": "health",
  "h": "每一格是一種保障，<b>有寫金額的是你已經有的</b>，空著的就是還沒有。"
 },
 {
  "id": "s040",
  "t": "ph",
  "br": "health",
  "k": 2
 },
 {
  "id": "s041",
  "t": "ai",
  "br": "health",
  "h": "下一格是「<b>該補什麼</b>」。<br>哪些要補、補多少，<b>要等面談時顧問依你的保單一項一項跟你看</b>。"
 },
 {
  "id": "s042",
  "t": "panel",
  "br": "health",
  "k": "gaps"
 },
 {
  "id": "s044",
  "t": "ai",
  "br": "health",
  "h": "保額、商品、保費這些，<b>要有登錄的顧問對著條款跟你說才準</b>，所以我們留到面談時一起看。"
 },
 {
  "id": "s046",
  "t": "ai",
  "br": "health",
  "h": "哪些該補、為什麼要補，<b>顧問面談時會連同數字和出處一起跟你說明</b>。"
 },
 {
  "id": "s047",
  "t": "ai",
  "br": "health",
  "h": "你剛剛說的事和你的保單，<b>顧問面談前會先看過</b>，不用再從頭講一次。"
 },
 {
  "id": "s048",
  "t": "panel",
  "br": "health",
  "k": "sum"
 },
 {
  "id": "s049",
  "t": "ai",
  "br": "health",
  "h": "準備好了就<b>去挑一位顧問</b>。<br>我能做的是幫你整理；條款到底怎麼寫、你保不保得過，要有人當面跟你講清楚。"
 },
 {
  "id": "s050",
  "t": "ai",
  "br": "finance",
  "h": "好。那我先問你幾題，<b>都是選的、不用打字</b>。"
 },
 {
  "id": "f_worry_q",
  "t": "ai",
  "br": "finance",
  "h": "先問一件事——想到未來的錢，<b>你最擔心的是哪一個？</b>"
 },
 {
  "id": "f_worry",
  "t": "ask",
  "br": "finance",
  "keys": [
   "fin_worry"
  ],
  "o": [
   {
    "x": "退休以後錢不夠用",
    "key": "fin_worry",
    "label": "最擔心",
    "health": false,
    "v": "退休後錢不夠用",
    "f": "ret"
   },
   {
    "x": "錢傳給下一代會出問題",
    "key": "fin_worry",
    "label": "最擔心",
    "health": false,
    "v": "資產傳承出問題",
    "f": "tax"
   },
   {
    "x": "小孩的教育金",
    "key": "fin_worry",
    "label": "最擔心",
    "health": false,
    "v": "子女教育金",
    "f": "edu"
   },
   {
    "x": "說不上來",
    "key": "fin_worry",
    "label": "最擔心",
    "health": false,
    "v": "說不上來"
   }
  ]
 },
 {
  "id": "s051",
  "t": "ai",
  "br": "finance",
  "h": "再來這題會決定後面所有建議——你現在幾歲？"
 },
 {
  "id": "s052",
  "t": "ask",
  "br": "finance",
  "keys": [
   "age"
  ],
  "o": [
   {
    "x": "30 幾",
    "key": "age",
    "label": "年齡",
    "health": false,
    "v": "30～39 歲",
    "n": 35
   },
   {
    "x": "40 幾",
    "key": "age",
    "label": "年齡",
    "health": false,
    "v": "40～49 歲",
    "n": 45
   },
   {
    "x": "50～59",
    "key": "age",
    "label": "年齡",
    "health": false,
    "v": "50～59 歲",
    "n": 55
   },
   {
    "x": "60 以上",
    "key": "age",
    "label": "年齡",
    "health": false,
    "v": "60 歲以上",
    "n": 62
   }
  ]
 },
 {
  "id": "s053",
  "t": "ai",
  "br": "finance",
  "h": "再問一題，這題決定我會往哪個方向幫你想——<br><b>你的錢，比較希望它怎麼放？</b>"
 },
 {
  "id": "s054",
  "t": "ask",
  "br": "finance",
  "keys": [
   "risk"
  ],
  "o": [
   {
    "x": "願意承受波動，想讓它長大",
    "key": "risk",
    "label": "資金態度",
    "health": false,
    "v": "願意承受波動換成長",
    "n": 2
   },
   {
    "x": "穩一點就好，不要虧到本金",
    "key": "risk",
    "label": "資金態度",
    "health": false,
    "v": "優先保本，不求高報酬",
    "n": 1
   },
   {
    "x": "我沒想過，看情況",
    "key": "risk",
    "label": "資金態度",
    "health": false,
    "v": "尚未形成明確偏好",
    "n": 0
   }
  ]
 },
 {
  "id": "s055",
  "t": "panel",
  "br": "finance",
  "k": "route"
 },
 {
  "id": "s056",
  "t": "ai",
  "br": "finance",
  "h": "<b>右邊</b>是我依你的年紀和資金態度判斷的路線。<br>這不是推銷，是<b>同樣一筆錢，在不同階段該放的位置本來就不一樣</b>。"
 },
 {
  "id": "s057",
  "t": "ai",
  "br": "finance",
  "h": "那我們從哪一塊開始看？",
  "skipIfSub": true
 },
 {
  "id": "s058",
  "t": "ask",
  "br": "finance",
  "keys": [
   "focus"
  ],
  "o": [
   {
    "x": "退休以後夠不夠用",
    "key": "focus",
    "label": "最在意",
    "health": false,
    "v": "退休準備",
    "f": "ret"
   },
   {
    "x": "資產怎麼傳給下一代",
    "key": "focus",
    "label": "最在意",
    "health": false,
    "v": "資產傳承與稅",
    "f": "tax"
   },
   {
    "x": "小孩的教育金",
    "key": "focus",
    "label": "最在意",
    "health": false,
    "v": "子女教育金",
    "f": "edu"
   }
  ],
  "skipIfSub": true
 },
 {
  "id": "s059",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "那我們從一個你一定答得出來的問題開始——<br><b>你現在每個月大概花多少？</b>"
 },
 {
  "id": "s060",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "我拆開問會準很多。先問吃的：<br>伙食、日用品、通訊，一個月大概？"
 },
 {
  "id": "s061",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "food"
  ],
  "o": [
   {
    "x": "1 萬以內",
    "key": "food",
    "label": "伙食日用",
    "health": false,
    "v": "約 1 萬／月",
    "n": 10000
   },
   {
    "x": "1～2 萬",
    "key": "food",
    "label": "伙食日用",
    "health": false,
    "v": "約 1.6 萬／月",
    "n": 16000
   },
   {
    "x": "2～3 萬",
    "key": "food",
    "label": "伙食日用",
    "health": false,
    "v": "約 2.5 萬／月",
    "n": 25000
   }
  ]
 },
 {
  "id": "s062",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "住的部分呢？<br>房貸或房租、水電、管理費加起來。"
 },
 {
  "id": "s063",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "home"
  ],
  "o": [
   {
    "x": "房貸還在繳，2 萬以上",
    "key": "home",
    "label": "住",
    "health": false,
    "v": "房貸中，約 2.5 萬／月",
    "n": 25000
   },
   {
    "x": "1～2 萬",
    "key": "home",
    "label": "住",
    "health": false,
    "v": "約 1.5 萬／月",
    "n": 15000
   },
   {
    "x": "房子已繳清，只有雜支",
    "key": "home",
    "label": "住",
    "health": false,
    "v": "已繳清，約 8 千／月",
    "n": 8000
   }
  ]
 },
 {
  "id": "s064",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "交通呢？油錢、停車、大眾運輸。"
 },
 {
  "id": "s065",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "trans"
  ],
  "o": [
   {
    "x": "有開車，6 千以上",
    "key": "trans",
    "label": "交通",
    "health": false,
    "v": "約 6 千／月",
    "n": 6000
   },
   {
    "x": "3～6 千",
    "key": "trans",
    "label": "交通",
    "health": false,
    "v": "約 4 千／月",
    "n": 4000
   },
   {
    "x": "3 千以內",
    "key": "trans",
    "label": "交通",
    "health": false,
    "v": "約 2 千／月",
    "n": 2000
   }
  ]
 },
 {
  "id": "s066",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "最後一項：<b>娛樂、旅遊、治裝、人情</b>這些呢？"
 },
 {
  "id": "s067",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "fun"
  ],
  "o": [
   {
    "x": "2 萬以上",
    "key": "fun",
    "label": "娛樂人情",
    "health": false,
    "v": "約 2 萬／月",
    "n": 20000
   },
   {
    "x": "1～2 萬",
    "key": "fun",
    "label": "娛樂人情",
    "health": false,
    "v": "約 1.3 萬／月",
    "n": 13000
   },
   {
    "x": "1 萬以內",
    "key": "fun",
    "label": "娛樂人情",
    "health": false,
    "v": "約 7 千／月",
    "n": 7000
   }
  ]
 },
 {
  "id": "s068",
  "t": "panel",
  "br": "finance",
  "sub": "ret",
  "k": "exp"
 },
 {
  "id": "s069",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "<b>右邊</b>是你剛剛講的，我幫你排好了。<br>這裡有個一般人會猜錯的地方——"
 },
 {
  "id": "s070",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "大部分人以為退休後花得比較少。<br>交通和人情確實會降，子女支出會歸零。<br>但<b>醫療那一項是升的</b>，而且升得比你想的多。"
 },
 {
  "id": "s071",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "那你打算幾歲退休？"
 },
 {
  "id": "s072",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "ret"
  ],
  "o": [
   {
    "x": "65 歲",
    "key": "ret",
    "label": "退休年齡",
    "health": false,
    "v": "65 歲",
    "n": 65
   },
   {
    "x": "60 歲就想退",
    "key": "ret",
    "label": "退休年齡",
    "health": false,
    "v": "60 歲",
    "n": 60
   },
   {
    "x": "做到 70 歲",
    "key": "ret",
    "label": "退休年齡",
    "health": false,
    "v": "70 歲",
    "n": 70
   }
  ]
 },
 {
  "id": "s073",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "還有一題，我知道不好回答——<b>要規劃到幾歲？</b><br>國人平均餘命大約 80 歲，但<b>平均的意思是一半的人活得更久</b>。<br>規劃抓短了，後面那幾年沒錢才是真的麻煩。"
 },
 {
  "id": "s074",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "die"
  ],
  "o": [
   {
    "x": "抓 85 歲比較保險",
    "key": "die",
    "label": "規劃到",
    "health": false,
    "v": "85 歲",
    "n": 85
   },
   {
    "x": "90 歲",
    "key": "die",
    "label": "規劃到",
    "health": false,
    "v": "90 歲",
    "n": 90
   },
   {
    "x": "80 歲就好",
    "key": "die",
    "label": "規劃到",
    "health": false,
    "v": "80 歲",
    "n": 80
   }
  ]
 },
 {
  "id": "s075",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "最後兩題。<br>現在每個月大概能存多少？"
 },
 {
  "id": "s076",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "save"
  ],
  "o": [
   {
    "x": "5 千～1 萬",
    "key": "save",
    "label": "每月能存",
    "health": false,
    "v": "約 8 千",
    "n": 8000
   },
   {
    "x": "1～2 萬",
    "key": "save",
    "label": "每月能存",
    "health": false,
    "v": "約 1.5 萬",
    "n": 15000
   },
   {
    "x": "幾乎存不到",
    "key": "save",
    "label": "每月能存",
    "health": false,
    "v": "幾乎無結餘",
    "n": 2000
   }
  ]
 },
 {
  "id": "s077",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "退休金的部分，現在大概存了多少？<br>（勞保勞退不算，那我另外幫你估）"
 },
 {
  "id": "s078",
  "t": "ask",
  "br": "finance",
  "sub": "ret",
  "keys": [
   "saved"
  ],
  "o": [
   {
    "x": "100～300 萬",
    "key": "saved",
    "label": "現有準備",
    "health": false,
    "v": "約 200 萬",
    "n": 2000000
   },
   {
    "x": "300 萬以上",
    "key": "saved",
    "label": "現有準備",
    "health": false,
    "v": "約 400 萬",
    "n": 4000000
   },
   {
    "x": "幾乎沒有",
    "key": "saved",
    "label": "現有準備",
    "health": false,
    "v": "幾乎沒有",
    "n": 0
   }
  ]
 },
 {
  "id": "s079",
  "t": "ph",
  "br": "finance",
  "sub": "ret",
  "k": 1
 },
 {
  "id": "s080",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "算好了。<b>我只算最基礎的花費</b>——<br>沒有旅遊、沒有娛樂、沒有換車、沒有長照。"
 },
 {
  "id": "s081",
  "t": "panel",
  "br": "finance",
  "sub": "ret",
  "k": "retgap"
 },
 {
  "id": "s082",
  "t": "ph",
  "br": "finance",
  "sub": "ret",
  "k": 2
 },
 {
  "id": "s083",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "右邊那個數字是<b>扣掉勞保勞退和你現有準備之後</b>，還要自己生出來的。"
 },
 {
  "id": "s084",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "我知道看起來很多。但有兩件事要先講清楚——"
 },
 {
  "id": "s085",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "第一，<b>這是只算最基礎的</b>。如果連這個都不夠，那不是「退休品質打折」，是<b>撐不過去</b>——要跟子女拿錢，或是提早把錢花完之後還有十幾年要過。"
 },
 {
  "id": "s086",
  "t": "ai",
  "br": "finance",
  "sub": "ret",
  "h": "第二，<b>我沒有假設任何投資報酬率</b>。<br>這張表算的是「光靠存要存多少」。報酬是加分，不是前提——<b>我不想給你一個看起來很美但做不到的數字</b>。"
 },
 {
  "id": "s087",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "好。傳承這塊，大部分人第一個想到的是「要繳多少稅」。<br>但<b>真正會出事的通常不是稅額</b>，等一下你就知道為什麼。"
 },
 {
  "id": "s088",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "先問資產大概的組成。<br>房地產佔你全部資產大概多少？"
 },
 {
  "id": "s089",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "re"
  ],
  "o": [
   {
    "x": "八成以上，幾乎都在房子",
    "key": "re",
    "label": "資產組成",
    "health": false,
    "v": "不動產佔 8 成以上",
    "n": 0.8
   },
   {
    "x": "一半左右",
    "key": "re",
    "label": "資產組成",
    "health": false,
    "v": "不動產約佔一半",
    "n": 0.5
   },
   {
    "x": "不到三成",
    "key": "re",
    "label": "資產組成",
    "health": false,
    "v": "不動產佔 3 成以下",
    "n": 0.3
   }
  ]
 },
 {
  "id": "s090",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "全部資產加起來（含房子市價）大概落在？"
 },
 {
  "id": "s091",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "est"
  ],
  "o": [
   {
    "x": "2,000～3,000 萬",
    "key": "est",
    "label": "資產總額",
    "health": false,
    "v": "約 2,500 萬",
    "n": 25000000
   },
   {
    "x": "3,000～5,000 萬",
    "key": "est",
    "label": "資產總額",
    "health": false,
    "v": "約 4,000 萬",
    "n": 40000000
   },
   {
    "x": "2,000 萬以下",
    "key": "est",
    "label": "資產總額",
    "health": false,
    "v": "約 1,500 萬",
    "n": 15000000
   }
  ]
 },
 {
  "id": "s092",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "如果你走了，<b>家裡每個月的開銷大概要多少才過得下去？</b>"
 },
 {
  "id": "s093",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "surv"
  ],
  "o": [
   {
    "x": "6 萬左右",
    "key": "surv",
    "label": "遺族月開銷",
    "health": false,
    "v": "約 6 萬／月",
    "n": 60000
   },
   {
    "x": "4 萬左右",
    "key": "surv",
    "label": "遺族月開銷",
    "health": false,
    "v": "約 4 萬／月",
    "n": 40000
   },
   {
    "x": "8 萬以上",
    "key": "surv",
    "label": "遺族月開銷",
    "health": false,
    "v": "約 8 萬／月",
    "n": 80000
   }
  ]
 },
 {
  "id": "s094",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "還有兩件事會把這個數字拉大很多，我得問清楚。<br><b>第一，還有貸款嗎？</b>"
 },
 {
  "id": "s095",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "loan"
  ],
  "o": [
   {
    "x": "房貸還剩 500 萬左右",
    "key": "loan",
    "label": "貸款",
    "health": false,
    "v": "房貸餘額約 500 萬",
    "n": 5000000
   },
   {
    "x": "還剩 1,000 萬以上",
    "key": "loan",
    "label": "貸款",
    "health": false,
    "v": "房貸餘額 1,000 萬以上",
    "n": 10000000
   },
   {
    "x": "都繳清了",
    "key": "loan",
    "label": "貸款",
    "health": false,
    "v": "無貸款",
    "n": 0
   }
  ]
 },
 {
  "id": "s096",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "<b>貸款不會因為人走了就停。</b><br>而且銀行不會因為你是遺族就寬限——繳不出來，房子一樣會被拍賣。"
 },
 {
  "id": "s097",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "<b>第二，家裡的收入有多少是靠你？</b>"
 },
 {
  "id": "s098",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "dep"
  ],
  "o": [
   {
    "x": "幾乎全靠我，另一半沒在工作",
    "key": "dep",
    "label": "依賴程度",
    "health": false,
    "v": "遺族高度依賴（配偶無收入）",
    "n": 10
   },
   {
    "x": "我佔大部分，但另一半有工作",
    "key": "dep",
    "label": "依賴程度",
    "health": false,
    "v": "遺族部分依賴（雙薪但不均）",
    "n": 7
   },
   {
    "x": "兩個人收入差不多",
    "key": "dep",
    "label": "依賴程度",
    "health": false,
    "v": "遺族依賴度低（雙薪相當）",
    "n": 4
   }
  ]
 },
 {
  "id": "s099",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "那你的年收入大概是？"
 },
 {
  "id": "s100",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "inc"
  ],
  "o": [
   {
    "x": "100～150 萬",
    "key": "inc",
    "label": "年收入",
    "health": false,
    "v": "約 120 萬",
    "n": 1200000
   },
   {
    "x": "150～250 萬",
    "key": "inc",
    "label": "年收入",
    "health": false,
    "v": "約 200 萬",
    "n": 2000000
   },
   {
    "x": "100 萬以下",
    "key": "inc",
    "label": "年收入",
    "health": false,
    "v": "約 80 萬",
    "n": 800000
   }
  ]
 },
 {
  "id": "s101",
  "t": "ph",
  "br": "finance",
  "sub": "tax",
  "k": 1
 },
 {
  "id": "s102",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "好。先看稅——<b>右邊</b>是試算。"
 },
 {
  "id": "s103",
  "t": "panel",
  "br": "finance",
  "sub": "tax",
  "k": "taxest"
 },
 {
  "id": "s104",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "這個稅額可能比你想的低。<br><b>但問題不在這裡。</b>"
 },
 {
  "id": "s105",
  "t": "ph",
  "br": "finance",
  "sub": "tax",
  "k": 2
 },
 {
  "id": "s106",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "你知道一件事嗎——<br><b>人走了之後，名下的存款會被凍結。</b>"
 },
 {
  "id": "s107",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [],
  "o": [
   {
    "x": "凍多久？"
   },
   {
    "x": "那家人怎麼辦？"
   }
  ]
 },
 {
  "id": "s108",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "從銀行知道那天開始，到<b>拿到完稅證明、全體繼承人用印完成</b>為止。<br>保守估<b>十個月</b>。"
 },
 {
  "id": "s109",
  "t": "panel",
  "br": "finance",
  "sub": "tax",
  "k": "proc"
 },
 {
  "id": "s110",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "右邊是流程。紅色那五段全部都是「<b>存款動不了</b>」的期間。<br>如果還有<b>公證或自書遺囑要認證</b>、繼承人在國外、或任何一個人不配合用印——<b>再加好幾個月到一年以上都很常見</b>。"
 },
 {
  "id": "s111",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "所以真正要算的不是稅，是<b>這段期間家裡要拿得出多少現金</b>。"
 },
 {
  "id": "s112",
  "t": "panel",
  "br": "finance",
  "sub": "tax",
  "k": "taxsrc"
 },
 {
  "id": "s113",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "右邊那個缺口，是把<b>稅、喪葬、這十個月的生活費、程序費用</b>全部加起來，再扣掉真正動得了的錢。<br><b>你名下的存款不算在裡面</b>——因為那時候領不出來。"
 },
 {
  "id": "s114",
  "t": "panel",
  "br": "finance",
  "sub": "tax",
  "k": "survgap"
 },
 {
  "id": "s115",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "右邊多了一塊。<b>剛剛那一塊是「錢在但動不了」的問題，這一塊是「錢根本不夠」的問題</b>——性質完全不一樣。"
 },
 {
  "id": "s116",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "這一塊是<b>假設你不在了，家裡長期還需要多少</b>。<br>怎麼算的，我寫在數字旁邊，僅供參考。"
 },
 {
  "id": "s117",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "但你的狀況<b>還要再加上貸款</b>——因為那筆錢遺族非還不可，而且還不出來房子就沒了。"
 },
 {
  "id": "s118",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "我知道這個數字看起來很嚇人。<br><b>做不到全部也沒關係</b>——很多家庭會先想<b>貸款和孩子成年前那段</b>，其他等收入上來再說。"
 },
 {
  "id": "s119",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "不過傳承不是只有「走了之後」這一條路。<br><b>生前就可以開始移轉</b>，而且稅的算法完全不同。"
 },
 {
  "id": "s120",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "你比較想了解哪一種？"
 },
 {
  "id": "s121",
  "t": "ask",
  "br": "finance",
  "sub": "tax",
  "keys": [
   "xfer"
  ],
  "o": [
   {
    "x": "生前把房子給小孩",
    "key": "xfer",
    "label": "移轉方式",
    "health": false,
    "v": "傾向生前贈與不動產",
    "n": 1
   },
   {
    "x": "走了之後再繼承就好",
    "key": "xfer",
    "label": "移轉方式",
    "health": false,
    "v": "傾向身故後繼承",
    "n": 2
   },
   {
    "x": "兩個差在哪？",
    "key": "xfer",
    "label": "移轉方式",
    "health": false,
    "v": "想先了解兩者差異",
    "n": 0
   }
  ]
 },
 {
  "id": "s122",
  "t": "panel",
  "br": "finance",
  "sub": "tax",
  "k": "xfer"
 },
 {
  "id": "s123",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "生前贈與和繼承<b>兩條路的對照</b>，面談時顧問會跟你一起看。<br>先講一個重點：<b>不是哪個稅比較少</b>，是——"
 },
 {
  "id": "s124",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "生前贈與不動產，是用<b>公告現值</b>算贈與稅，通常遠低於市價，所以當下很省。<br>但小孩<b>日後要賣的時候</b>，房地合一稅的取得成本也是那個低的數字——<b>省下來的稅，有可能在賣房那天連本帶利吐回去</b>。"
 },
 {
  "id": "s125",
  "t": "ai",
  "br": "finance",
  "sub": "tax",
  "h": "這題沒有標準答案，要看<b>他會不會賣、什麼時候賣、你還有多少時間可以分年贈與</b>。<br>這也是為什麼這一段一定要跟顧問當面算——<b>而且通常還要會計師一起看</b>。"
 },
 {
  "id": "s126",
  "t": "ai",
  "br": "finance",
  "sub": "edu",
  "h": "好。教育金有個特性跟其他規劃不一樣——<b>時間不能商量</b>。<br>他不會因為你還沒存夠就晚五年上大學。"
 },
 {
  "id": "s127",
  "t": "ai",
  "br": "finance",
  "sub": "edu",
  "h": "小孩現在幾歲？"
 },
 {
  "id": "s128",
  "t": "ask",
  "br": "finance",
  "sub": "edu",
  "keys": [
   "kid"
  ],
  "o": [
   {
    "x": "學齡前（0～6 歲）",
    "key": "kid",
    "label": "子女年齡",
    "health": false,
    "v": "學齡前",
    "n": 3
   },
   {
    "x": "國小",
    "key": "kid",
    "label": "子女年齡",
    "health": false,
    "v": "國小",
    "n": 9
   },
   {
    "x": "國高中",
    "key": "kid",
    "label": "子女年齡",
    "health": false,
    "v": "國高中",
    "n": 15
   }
  ]
 },
 {
  "id": "s129",
  "t": "ph",
  "br": "finance",
  "sub": "edu",
  "k": 1
 },
 {
  "id": "s130",
  "t": "panel",
  "br": "finance",
  "sub": "edu",
  "k": "edugap"
 },
 {
  "id": "s131",
  "t": "ph",
  "br": "finance",
  "sub": "edu",
  "k": 2
 },
 {
  "id": "s132",
  "t": "ai",
  "br": "finance",
  "sub": "edu",
  "h": "早存和晚存差多少，面談時顧問會跟你一起看那張對照。<br>先講結論——<b>時間本身就是錢</b>。"
 },
 {
  "id": "s133",
  "t": "ai",
  "br": "finance",
  "h": "到這裡我能算的都算了。<br>但<b>要看到「補強前後差多少」，還需要你現在有什麼</b>——那要你的保單。"
 },
 {
  "id": "s134",
  "t": "ask",
  "br": "finance",
  "keys": [],
  "o": [
   {
    "x": "那我上傳保單"
   },
   {
    "x": "先約顧問再說"
   }
  ]
 },
 {
  "id": "s135",
  "t": "ai",
  "br": "finance",
  "h": "都可以。<b>面談前上傳也來得及</b>。<br>另外提醒一下：<b>我只給方向和數字，不推薦商品</b>——商品要有登錄的顧問對著條款跟你說，<b>你才知道它到底保什麼、不保什麼</b>。"
 },
 {
  "id": "s136",
  "t": "panel",
  "br": "finance",
  "k": "fsum"
 }
];

/** 醫療趨勢卡：[標題, 說明, 對你的保單來說]（刻意不放統計數字，N17） */
export const TRENDS: Record<string, [string, string, string]> = {
 "t1": [
  "住院天數一直在縮短",
  "以前開個刀住一週，現在達文西手術當天或隔天就出院。很多化療、放療，也從住院改成門診做。",
  "舊的日額型保單是<b>按住院天數賠的</b>——住得越短，領得越少。<br>治療沒有變便宜，只是不在病房裡發生了。"
 ],
 "t2": [
  "自費的那一塊越來越大",
  "健保給付追不上新藥和新醫材。標靶、免疫療法、自費支架、人工水晶體、達文西手術耗材，常常一次十幾萬到上百萬。",
  "這塊只有<b>實支實付</b>接得住。日額型一天賠兩千，對上一次二十萬的自費醫材，差距不是倍數的問題。"
 ],
 "t3": [
  "活得久，不代表健康地久",
  "醫療進步讓人活下來，但不一定站得起來。中風、失智、重大傷病之後，被照顧的那段期間反而被拉長了。",
  "以前買保險想的是「走了家人怎麼辦」。<br>現在真正會拖垮一個家的，是<b>「沒走，但要被照顧很多年」</b>——這也是很多家庭沒準備到的那件事。"
 ]
};

/** 衛教模式的開場（沒同意個資蒐集時；一個字都不記） */
export const EDU_OPENING: string[] = [
 "沒問題。<br>你沒有同意個資蒐集，所以<b>我不會記下任何你說的事</b>——這段對話結束就沒了。",
 "不過保險知識我還是可以講。想問什麼？"
];
export const EDU_SUGGESTIONS: string[] = ["重大傷病卡是什麼？","實支實付的正本副本差在哪？","失能險跟長照險怎麼選？"];
