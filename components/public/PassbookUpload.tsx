"use client";

import { useRef, useState } from "react";

/*
 * 上傳保險存摺（4-k、4-w、P1）。
 * 壽險公會的保險存摺 PDF 用被保險人的身分證字號加密。我們在「客戶自己的裝置上」解鎖（pdf.js），
 * 只把解鎖後的文字（或截圖）送上去——身分證字號不會離開這支手機，伺服器與資料庫都不會有。
 *
 * PDF 有文字層 → 送文字（小、準）；讀不到文字（掃描檔）→ 每頁轉成圖片送。截圖直接壓縮後送。
 */

type Content =
  | { kind: "text"; pages: string[] }
  | { kind: "images"; images: { mime: "image/jpeg"; data: string }[] };

const MAX_PAGES = 10;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

// 文字依 y 座標排成一行一行，表格才不會變成一長串。
// 同一行裡緊貼的片段直接接起來（字型切換時 pdf.js 會把一個詞拆成好幾段），有明顯間隔才補空白。
// NFKC：中文 PDF 常用康熙部首等相容字（「⼈」不是「人」），不轉的話商品名對不到（記憶：PDF CJK 相容字陷阱）
function linesOf(items: { str: string; transform: number[]; width?: number }[]): string {
  const rows = new Map<number, { x: number; w: number; s: string }[]>();
  for (const it of items) {
    if (!it.str.trim()) continue;
    const y = Math.round(it.transform[5] / 3) * 3;
    rows.set(y, [...(rows.get(y) ?? []), { x: it.transform[4], w: it.width ?? 0, s: it.str }]);
  }
  return [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, cells]) => {
    cells.sort((a, b) => a.x - b.x);
    let line = "", end = -Infinity;
    for (const c of cells) {
      const gap = c.x - end;
      line += line && gap > 4 ? "  " : "";
      line += c.s.trim() === "" ? "" : c.s;
      end = c.x + c.w;
    }
    return line;
  }).join("\n").normalize("NFKC");
}

const canvasToJpeg = (c: HTMLCanvasElement) => c.toDataURL("image/jpeg", 0.82).split(",")[1];

async function imageFileToJpeg(f: File): Promise<string> {
  const bmp = await createImageBitmap(f);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return canvasToJpeg(c);
}

export function PassbookUpload({ conversationId, onUploaded, onSkip, busy }: {
  conversationId: string | null; onUploaded: () => void; onSkip?: () => void; busy?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [images, setImages] = useState<File[]>([]);
  const [needPw, setNeedPw] = useState(false);
  const [pw, setPw] = useState("");
  const [state, setState] = useState<"idle" | "working" | "sending">("idle");
  const [error, setError] = useState("");
  const [howOpen, setHowOpen] = useState(false);

  const pick = (fs: FileList | null) => {
    setError(""); setNeedPw(false); setPw("");
    const list = [...(fs ?? [])];
    if (!list.length) return;
    const pdf = list.find(f => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
    if (pdf) { setFile(pdf); setImages([]); void openPdf(pdf, ""); return; }
    const imgs = list.filter(f => f.type.startsWith("image/")).slice(0, MAX_PAGES);
    if (!imgs.length) { setError("請選 PDF 或截圖"); return; }
    setFile(null); setImages(imgs);
  };

  async function openPdf(f: File, password: string) {
    setState("working"); setError("");
    try {
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()), password });
      const doc = await task.promise;
      const n = Math.min(doc.numPages, MAX_PAGES * 2);
      const pages: string[] = [];
      for (let i = 1; i <= n; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        pages.push(linesOf(tc.items as { str: string; transform: number[]; width?: number }[]));
      }
      let content: Content;
      if (pages.join("").replace(/\s/g, "").length >= 30) content = { kind: "text", pages };
      else {
        // 掃描檔：沒有文字層，每頁轉成圖片
        const imgs: { mime: "image/jpeg"; data: string }[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, MAX_PAGES); i++) {
          const page = await doc.getPage(i);
          const vp0 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(2, 1600 / Math.max(vp0.width, vp0.height)) });
          const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
          await page.render({ canvas: c, canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          imgs.push({ mime: "image/jpeg", data: canvasToJpeg(c) });
        }
        content = { kind: "images", images: imgs };
      }
      await task.destroy();
      setPw("");                                   // 用完就清掉
      await send(content);
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === "PasswordException") {
        setNeedPw(true); setState("idle");
        if (password) setError("密碼不對。保險存摺的密碼是被保險人的身分證字號，英文字母要大寫");
        return;
      }
      setState("idle"); setError("這個檔案打不開，可能不是 PDF 或檔案損壞。也可以改傳截圖");
    }
  }

  async function sendImages() {
    setState("working"); setError("");
    try {
      const data = await Promise.all(images.map(imageFileToJpeg));
      await send({ kind: "images", images: data.map(d => ({ mime: "image/jpeg" as const, data: d })) });
    } catch { setState("idle"); setError("截圖讀不出來，請換一張再試"); }
  }

  async function send(content: Content) {
    setState("sending");
    const r = await fetch("/api/passbook", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId, content }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setState("idle"); setError(j.error ?? "沒傳上去，請再試一次"); return; }
    setState("idle"); setFile(null); setImages([]);
    onUploaded();
  }

  const working = state !== "idle" || busy;
  // 原型「約好了」頁的上傳卡（upload up2）：為什麼要給、怎麼拿、給了會怎樣——三件事缺一不可（4-k）
  return (
    <div className="upload up2" style={{ marginTop: 12 }}>
      <svg className="ill i44" viewBox="0 0 48 48" style={{ margin: "0 auto" }} aria-hidden="true"><use href="#i-upload" /></svg>
      <h3>上傳你的保險存摺</h3>
      <p><strong>有你的保單，才做得出專屬你的分析</strong>——現在有多少、還差多少、該補哪裡。<br />沒有的話，面談只能講通用的方向。</p>

      {!needPw && !images.length && (
        <div className="upbtns">
          <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple hidden onChange={e => { pick(e.target.files); e.target.value = ""; }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={working}>
            {state === "working" ? "打開中…" : state === "sending" ? "傳送中…" : "上傳保險存摺"}
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={working}>傳截圖</button>
        </div>
      )}

      {needPw && file && (
        <form style={{ marginTop: 14 }} onSubmit={e => { e.preventDefault(); if (pw.trim()) void openPdf(file, pw.trim().toUpperCase()); }}>
          <div className="bgd" style={{ marginBottom: 8 }}>{file.name} 有密碼保護，密碼是<b>被保險人的身分證字號</b></div>
          <div className="dinp" style={{ marginTop: 0 }}>
            <input className="dinf" id="pbpw" value={pw} onChange={e => setPw(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false}
              maxLength={10} placeholder="A123456789" disabled={working} aria-label="身分證字號" style={{ letterSpacing: ".08em", textTransform: "uppercase" }} />
            <button className="dins" type="submit" disabled={working || !pw.trim()}>{state === "idle" ? "解鎖並上傳" : "處理中…"}</button>
          </div>
          <div className="privacy" style={{ marginTop: 10 }}>
            <div className="pvt">🔒 只在你這台裝置上用來打開檔案</div>
            <div className="pvd">身分證字號不會傳出去，我們也看不到。</div>
          </div>
          <button type="button" className="upwhy" onClick={() => { setNeedPw(false); setFile(null); setPw(""); }}>換一個檔案</button>
        </form>
      )}

      {images.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="bgd" style={{ textAlign: "center" }}>已選 {images.length} 張截圖{images.length >= MAX_PAGES ? `（最多 ${MAX_PAGES} 張）` : ""}</div>
          <div className="upbtns">
            <button type="button" onClick={sendImages} disabled={working}>{state === "idle" ? "上傳" : "處理中…"}</button>
            <button type="button" onClick={() => setImages([])} disabled={working}>重選</button>
          </div>
        </div>
      )}

      {error && <div className="rd-err">{error}</div>}

      <button type="button" className="upwhy" onClick={() => setHowOpen(!howOpen)} aria-expanded={howOpen}>{howOpen ? "收起說明" : "不知道怎麼拿到保險存摺？"}</button>
      {howOpen && (
        <div className="upguide">
          <div className="bgh">三步驟，手機就能做</div>
          {([["到壽險公會「保險存摺」網站", <>用<strong>本人門號＋身分證</strong>做行動身分識別最快——不用讀卡機</>],
             ["登入後把保單資料下載成 PDF", "檔案密碼是你的身分證字號"],
             ["回到這裡上傳", "PDF 或截圖都可以，有商品名稱和保額就夠了"]] as [string, React.ReactNode][]).map(([t, d], i) => (
            <div key={t} className="bgs"><span className="bgn">{i + 1}</span><div><div className="bgt">{t}</div><div className="bgd">{d}</div></div></div>
          ))}
        </div>
      )}
      <div className="privacy">
        <div className="pvt">🔒 你的保單只有你之後選的顧問看得到</div>
        <div className="pvd">加密保存 · 保存一年到期自動刪除 · 你隨時可以要求刪除</div>
      </div>
      {onSkip && <button type="button" className="upwhy" onClick={onSkip} disabled={working}>先跳過，之後再傳</button>}
    </div>
  );
}
