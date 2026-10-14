/** 網站網址（sitemap、canonical、分享圖要完整網址）。APP_URL 各環境自己設 */
export const siteUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
/**
 * 只有上線版開放搜尋引擎（卡 E 步驟 3）。上線版永遠不設 RADIA_ENV（見 dev-login），開發版是 RADIA_ENV=dev；
 * 本機、預覽部署沒有 VERCEL_ENV=production，一律擋
 */
export const indexable = () => !process.env.RADIA_ENV && process.env.VERCEL_ENV === "production";
