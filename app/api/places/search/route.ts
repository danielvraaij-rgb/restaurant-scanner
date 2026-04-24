import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.GOOGLE_API_KEY!;

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lng = req.nextUrl.searchParams.get("lng");
  const radius = req.nextUrl.searchParams.get("radius") || "5000";
  const pagetoken = req.nextUrl.searchParams.get("pagetoken");

  let url: string;
  if (pagetoken) {
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pagetoken}&key=${API_KEY}`;
  } else {
    if (!lat || !lng) return NextResponse.json({ error: "Missing lat/lng" }, { status: 400 });
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${API_KEY}`;
  }

  const res = await fetch(url);
  const data = await res.json();
  return NextResponse.json(data);
}
