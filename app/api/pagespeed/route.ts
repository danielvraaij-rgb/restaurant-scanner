import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_API_KEY!;

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&category=PERFORMANCE&category=ACCESSIBILITY&strategy=MOBILE&key=${API_KEY}`;

  try {
    const res = await fetch(psUrl);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: "PageSpeed request failed" }, { status: 500 });
  }
}
