import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_API_KEY!;

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)},+Nederland&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data);
}
