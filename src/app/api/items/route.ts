import { searchMarketItems } from "@/lib/market";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const profileId = searchParams.get("profileId")?.trim() || "guest";

  const items = await searchMarketItems(query, profileId);
  return NextResponse.json({ items });
}
