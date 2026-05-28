import { NextRequest } from "next/server";

const TII_BASE = "https://insprod.tii.org.tw";

const FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: TII_BASE,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
};

export async function GET(req: NextRequest) {
  const planCode = req.nextUrl.searchParams.get("planCode");
  if (!planCode) {
    return new Response("Missing planCode", { status: 400 });
  }

  try {
    // Step 1: Fetch the TII product detail page to find PDF GUIDs
    const detailRes = await fetch(
      `${TII_BASE}/DetailList.aspx?productId=${encodeURIComponent(planCode)}`,
      { headers: FETCH_HEADERS, redirect: "follow" }
    );

    if (!detailRes.ok) {
      return new Response(`TII detail page returned ${detailRes.status}`, { status: 502 });
    }

    const html = await detailRes.text();

    // Extract Open2.ashx PDF GUID — prefer 保單條款, fallback to first match
    const allMatches = [...html.matchAll(/Open2\.ashx\?id=([a-f0-9-]{36})/gi)];
    if (allMatches.length === 0) {
      return new Response("No PDF found on detail page", { status: 404 });
    }

    // Try to find the 保單條款 link specifically
    let guid = allMatches[0][1];
    const clauseIdx = html.indexOf("保單條款");
    if (clauseIdx !== -1) {
      const snippet = html.slice(clauseIdx, clauseIdx + 300);
      const clauseMatch = snippet.match(/Open2\.ashx\?id=([a-f0-9-]{36})/i);
      if (clauseMatch) guid = clauseMatch[1];
    }

    // Step 2: Fetch the actual PDF from TII
    const pdfRes = await fetch(`${TII_BASE}/Open2.ashx?id=${guid}`, {
      headers: { ...FETCH_HEADERS, Accept: "application/pdf,*/*" },
    });

    if (!pdfRes.ok) {
      return new Response(`PDF fetch failed: ${pdfRes.status}`, { status: 502 });
    }

    const pdfBuffer = await pdfRes.arrayBuffer();

    return new Response(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${planCode}.pdf"`,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error("[pdf-proxy] Error:", err);
    return new Response("Internal error", { status: 500 });
  }
}
