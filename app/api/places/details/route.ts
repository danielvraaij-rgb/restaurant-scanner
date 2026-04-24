import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_API_KEY!;

export async function GET(req: NextRequest) {
  const placeId = req.nextUrl.searchParams.get("place_id");
  if (!placeId) return NextResponse.json({ error: "Missing place_id" }, { status: 400 });

  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=website,formatted_phone_number,url&key=${API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data);
}
