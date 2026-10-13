// 同意書版本號。獨立成檔，讓瀏覽器端的同意書頁也能引用，又不會把資料庫程式帶進前端。
// ⚠️ 改了 components/public/ConsentDocument.tsx 的任何文字，就要換這個版本號。
export const CONSENT_VERSION = "2026-10-13";   // 2026-10-13：拿掉蒐集機構的保險公司名稱（4-aj）。舊版同意紀錄保留不動，舊版同意者下次會被請求同意新版
