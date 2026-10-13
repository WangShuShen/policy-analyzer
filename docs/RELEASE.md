# RADIA 上線流程手冊

> 設計準則 §4：開發版與上線版完全分開。**只有顧問親口說「上線」才走這份流程**，任何 session 不得自行上線。
> 開發版 https://radia-dev-woad.vercel.app（Vercel `radia-dev`／Neon `radia-dev`）
> 上線版 https://policy-analyzer-three.vercel.app（Vercel `policy-analyzer`／Neon `patient-cloud-70270601`）

## 平常（開發版）
1. 各卡在自己的分支、自己的 Neon 分支開發 → 申請合併
2. 卡 A 合進 `dev` 分支 → 部署開發版 → `node scripts/smoke.mjs --env dev` 全過
3. 在驗收清單把跑通的項目標「完成」（只標 Claude 標記；「驗收通過」只有顧問能勾）
4. 有改到使用者看得到的東西，就在 `CHANGELOG.md` 的「開發版（尚未上線）」加一行白話說明

## 上線（顧問說「上線」之後）

| 步驟 | 做什麼 | 沒過怎麼辦 |
|---|---|---|
| 0. 確認 | 驗收清單上這次要上的項目都「驗收通過」；`node scripts/smoke.mjs --env dev` 全過 | 停，回報顧問 |
| 1. 備份 | Neon 上線版建一個分支 `backup-YYYYMMDD`（等於整個資料庫快照） | 停 |
| 2. 環境變數 | 比對新版需要的變數，缺的用**上線版自己的金鑰**加到 `policy-analyzer`（只設 Production）。**絕不設** `DEV_LOGIN`／`RADIA_ENV`／`DEV_LOGIN_KEY`／`AI_MOCK` | 停 |
| 3. 資料庫 | 先跑 migration 到上線版資料庫（`drizzle/` 只加不刪，舊版程式照常能跑） | 不動程式，回報 |
| 4. 程式 | `git checkout main && git merge --ff-only dev` → 從 main 部署 `policy-analyzer` production | 用 Vercel「Promote」切回上一個部署 |
| 5. 冒煙 | `node scripts/smoke.mjs --env prod` 全過；顧問用真帳號登入看待辦、客戶端看同意書 | 立刻 Promote 回上一版，再查 |
| 6. 收尾 | 打版本號 `git tag v1.x`；CHANGELOG 的「開發版（尚未上線）」改成「v1.x（日期）」；通知顧問 | — |

## 回退
- 程式：Vercel → `policy-analyzer` → Deployments → 上一個 → Promote（30 秒內生效）
- 資料庫：migration 只加不刪，程式退回舊版也能用新表；真的資料出問題才從 `backup-YYYYMMDD` 分支還原（先問顧問）

## 紅線
- 金鑰不貼進任何對話；上線版金鑰不出現在任何 worktree
- 上線版不出現「三商美邦」字樣（4-aj）
- 開發版的測試資料、回饋清單不搬到上線版
