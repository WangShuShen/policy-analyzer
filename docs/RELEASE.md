# RADIA 上線流程手冊

> 設計準則 §4：開發版與上線版完全分開。**只有顧問親口說「上線」才走這份流程**，任何 session 不得自行上線。
> 開發版 https://radia-dev-woad.vercel.app（Vercel `radia-dev`／Neon `radia-dev`）
> 上線版 https://policy-analyzer-three.vercel.app（Vercel `policy-analyzer`／Neon `patient-cloud-70270601`）

## 平常（開發版）
1. 各卡在自己的分支、自己的 Neon 分支開發 → 申請合併
2. 卡 A 合進 `dev` 分支 → 部署開發版 → `node scripts/smoke.mjs --env dev` 全過
3. 在驗收清單把跑通的項目標「完成」（只標 Claude 標記；「驗收通過」只有顧問能勾）
4. 有改到使用者看得到的東西，就在 `CHANGELOG.md` 的「開發版（尚未上線）」加一行白話說明

## 開發版驗收
- 開發版**沒有自動排程**：GitHub 排程只從 `main` 跑、打的是上線版。驗收要靠排程的功能時，由 Claude 代跑：
  - `node scripts/dev-cron.mjs`：依序跑預約提醒（前一天／前 1 小時）＋寄信重試、AI 用量警報
  - `node scripts/dev-cron.mjs --only bookings`：只跑一支（`bookings`｜`ai-usage`）
  - 密碼是開發版專用的 CRON_SECRET，放在 `~/.config/radia/dev-cron.env`（權限 600），腳本只讀不印；打上線版會直接拒絕
- 驗收「前一天提醒信」：約一個明天的時段 → 跑 `dev-cron.mjs --only bookings` → 看信箱與顧問鈴鐺（重複跑不會重寄）
- 測試帳號（`@example.invalid`）的信只進寄信佇列、不會真的寄出；要收真信請用自己的 Google 帳號約
- **驗收截圖**（每次部署開發版後重拍）：`scripts/shots.mjs` 對開發版拍每個驗收項目，手機／平板／電腦三種尺寸，輸出到 `100_Todo/projects/RADIA-驗收截圖/`（jpg＋`manifest.json`，驗收清單頁讀這份），約 13 分鐘
  - 第一次先在暫存資料夾裝 playwright（**不要**加進 repo 的 dependencies）：`mkdir -p /tmp/radia-pw && cd /tmp/radia-pw && npm init -y && npm i playwright@1.60.0 && npx playwright install chromium`
  - 跑：`DEV_DB_URL="$(npx -y neonctl connection-string main --project-id lingering-rain-26998425)" node scripts/shots.mjs --pw /tmp/radia-pw --out ../../100_Todo/projects/RADIA-驗收截圖`
  - 用獨立的 headless 瀏覽器，**不碰 Playwright MCP 共用瀏覽器**（卡 B 的三商登入）；測試登入鑰匙讀 `~/.config/radia/dev-login.env`（權限 600，不印）；上線版網址會直接拒絕
  - 會現做測試資料（測試客戶、模擬存摺、預約、一位手動客戶「截圖測試客戶（手動）」、互動紀錄），拍完把這次建的預約改成 `cancelled_by_advisor`（不刪、不寄信）；w1b-10 會暫時把每人每天上限調到 0.000001 美元，拍完自動還原（沒還原會大字提醒）
  - 每張自動檢查：橫向捲動、超出畫面右邊、手機可點元件小於 40×40（頂部導覽列分開記）、客戶端出現「三商」（存摺確認畫面除外）、主控台錯誤——只記錄在 manifest 的 issues，不修

## 上線（顧問說「上線」之後）

> ⚠️ **推 main 到 GitHub 就會自動部署上線版**（`.github/workflows/deploy.yml`：push main → `vercel --prod`）。所以資料庫（步驟 3）一定要在推 main **之前**做完，而且推了就不要再手動部署一次。
> 10/14 已在開發版的拋棄式資料庫分支乾跑過步驟 3：把一份上線版資料的複本退回「只有 0000」，跑 0001～0013 約 25 秒、全過（0014 是之後才加的，上線前要再乾跑一次）；跑完的結構跟開發版逐欄一致；舊版（main）程式接新結構，13 個頁面／API 沒有任何 500。

| 步驟 | 做什麼 | 沒過怎麼辦 |
|---|---|---|
| 0. 確認 | 驗收清單上這次要上的項目都「驗收通過」；`node scripts/smoke.mjs --env dev` 全過；上線前法遵清單（`100_Todo/projects/RADIA-派工/v1.0-上線前法遵清單.md`）要法遵／顧問看的項目都有結論 | 停，回報顧問 |
| 1. 備份 | Neon 上線版建一個分支 `backup-YYYYMMDD`（等於整個資料庫快照） | 停 |
| 2. 環境變數 | 比對新版需要的變數，缺的用**上線版自己的金鑰**加到 `policy-analyzer`（只設 Production）。v1.0 新增必設：`FIELD_ENC_KEY_V1`（32 bytes base64）＋`FIELD_ENC_KEY_CURRENT=1`，以及客服信箱 `NEXT_PUBLIC_SUPPORT_EMAIL`（顧問給地址；設好要重新部署才生效）——對話與存摺內容用它加密，**沒設 AI 諮詢會直接壞掉；金鑰弄丟＝資料永遠讀不回來**，產生後另存一份在顧問自己的密碼管理器。**絕不設** `DEV_LOGIN`／`RADIA_ENV`／`DEV_LOGIN_KEY`／`AI_MOCK` | 停 |
| 3. 資料庫 | ①先確認上線版的 migration 紀錄（`drizzle.__drizzle_migrations`）**剛好 1 筆**（0000），不是就停 ②`DATABASE_URL="$(npx neonctl connection-string --project-id patient-cloud-70270601)" npx drizzle-kit migrate`（連線字串只在指令裡用，不寫進任何檔案）③確認紀錄筆數＝`migrations/meta/_journal.json` 的筆數（v1.0 目前是 16：0000～0015）。`migrations/` 只加不刪，舊版程式照常能跑；唯一改到既有資料的是 0002（只把商品的銷售起訖日從 NULL 補上值，不覆蓋任何東西） | 不推 main，回報 |
| 4. 程式 | `git checkout main && git merge --ff-only dev && git push origin main` → GitHub 自動部署（看 Actions 的 Deploy to Vercel 變綠）。同時 `booking-cron.yml` 也會開始每 10 分鐘跑 | 用 Vercel「Promote」切回上一個部署 |
| 5. 冒煙 | `node scripts/smoke.mjs --env prod` 全過；顧問用真帳號登入看待辦、客戶端看同意書（舊客戶會被請求同意 2026-10-13 新版） | 立刻 Promote 回上一版，再查 |
| 5a. 開門前設定 | 上線版剛搬完**沒有任何可約時段**，客戶會卡在「這位顧問沒有可約的時段」：每位顧問到個人設定填自介、專長、登錄字號、視訊連結／面談地點，並開好時段；管理者看一下 AI 用量警報門檻（預設每月 20 美元、每人每天 0.5 美元；超過當天 AI 就暫停〔N7〕，台灣 0 點恢復） | 不影響已上線的程式，補完再對外公告 |
| 5b. 開發版排程（v1.0 這次）| 跟著這次進 main：新增 `.github/workflows/dev-cron.yml`，每 10 分鐘打開發版的 `/api/cron/bookings`、`/api/cron/ai-usage`，用**開發版專用**的 GitHub secrets（`DEV_APP_URL`、`DEV_CRON_SECRET`），跟上線版的 `APP_URL`／`CRON_SECRET` 分開；之後 `dev-cron.mjs` 只留給手動測試 | 不影響上線版，可下一版再補 |
| 6. 收尾 | 打版本號 `git tag v1.x`；CHANGELOG 的「開發版（尚未上線）」改成「v1.x（日期）」；通知顧問 | — |

## 回退
- 程式：Vercel → `policy-analyzer` → Deployments → 上一個 → Promote（30 秒內生效）
- 資料庫：migration 只加不刪，程式退回舊版也能用新表；真的資料出問題才從 `backup-YYYYMMDD` 分支還原（先問顧問）

## 紅線
- 金鑰不貼進任何對話；上線版金鑰不出現在任何 worktree
- 上線版不出現「三商美邦」字樣（4-aj）
- 開發版的測試資料、回饋清單不搬到上線版
