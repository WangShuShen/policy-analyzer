import { ImageResponse } from "next/og";
import { getPublic } from "@/lib/news/store";
import { OG_ICONS } from "@/lib/news/ogIcons";

// 分享圖（W3，顧問 10/14：不開放上傳，系統用標題＋封面圖示自動產生）。LINE／FB／Google 會抓這張
export const alt = "RADIA 保險快訊";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

// satori 只吃 ttf/otf：跟 Google Fonts 要「只含這幾個字」的思源黑體（幾 KB）。拿不到就只畫圖示和品牌
async function font(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${encodeURIComponent(text)}`, { signal: AbortSignal.timeout(4000) })).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url, { signal: AbortSignal.timeout(4000) })).arrayBuffer() : null;
  } catch { return null; }
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const a = await getPublic((await params).slug);
  const title = a?.title ?? "保險快訊";
  const label = `${a?.category ?? "保險快訊"} · RADIA 保險快訊`;
  const data = await font(`${title}${label}RADIA顧問已審閱`);
  const icon = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(OG_ICONS[a?.cover ?? "i-doc"] ?? OG_ICONS["i-doc"])}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f6f8f6", fontFamily: data ? "TC" : undefined }}>
        <div style={{ width: 420, height: "100%", background: "#e2efeb", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={icon} width={240} height={240} alt="" />
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "64px 64px 56px" }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: "#151a19", display: "flex" }}>RAD<span style={{ color: "#2f7a6b" }}>IA</span></div>
          {data && <div style={{ fontSize: title.length > 24 ? 50 : 58, fontWeight: 700, color: "#151a19", lineHeight: 1.35, display: "flex" }}>{title}</div>}
          <div style={{ fontSize: 26, color: "#1f5a4e", display: "flex" }}>{data ? `${label}　·　顧問已審閱` : "RADIA"}</div>
        </div>
      </div>
    ),
    { ...size, fonts: data ? [{ name: "TC", data, weight: 700, style: "normal" }] : [] },
  );
}
