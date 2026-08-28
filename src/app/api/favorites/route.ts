import { getFavoriteItems, setFavorite } from "@/lib/market";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");

  if (!profileId) {
    return NextResponse.json(
      { error: "Missing required query parameter: profileId." },
      { status: 400 },
    );
  }

  const favorites = await getFavoriteItems(profileId);
  return NextResponse.json({ favorites });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    profileId?: string;
    itemId?: number;
    favorite?: boolean;
  };

  if (!body.profileId || typeof body.profileId !== "string") {
    return NextResponse.json({ error: "profileId is required." }, { status: 400 });
  }

  const itemId = body.itemId;
  if (typeof itemId !== "number" || !Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "itemId must be a positive integer." }, { status: 400 });
  }

  if (typeof body.favorite !== "boolean") {
    return NextResponse.json({ error: "favorite must be a boolean." }, { status: 400 });
  }

  await setFavorite(body.profileId, itemId, body.favorite);
  return NextResponse.json({ ok: true });
}
