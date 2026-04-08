import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    const buf = await res.arrayBuffer();
    // Content-Type 헤더에서 charset 추출
    const ct = res.headers.get("content-type") || "";
    let charset = "utf-8";
    const ctMatch = ct.match(/charset=([^\s;]+)/i);
    if (ctMatch) charset = ctMatch[1];
    // HTML meta 태그에서 charset 추출 (헤더에 없는 경우)
    if (!ctMatch) {
      const preview = new TextDecoder("utf-8", { fatal: false }).decode(buf.slice(0, 4096));
      const metaMatch = preview.match(/<meta[^>]+charset=["']?([^\s"';>]+)/i);
      if (metaMatch) charset = metaMatch[1];
    }
    const html = new TextDecoder(charset, { fatal: false }).decode(buf);
    // <title> 태그 추출
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const raw = match?.[1]?.trim() || "";
    // HTML 엔티티 디코딩
    const title = raw.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
    return NextResponse.json({ title });
  } catch {
    return NextResponse.json({ title: "" });
  }
}
