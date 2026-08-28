import { syncMarketData } from "@/lib/market";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let force = false;
  const contentType = request.headers.get("content-type");

  if (contentType?.includes("application/json")) {
    try {
      const bodyText = await request.text();
      if (bodyText) {
        const body = JSON.parse(bodyText) as { force?: unknown };
        force = body.force === true;
      }
    } catch {
      force = false;
    }
  }

  const result = await syncMarketData(force);
  return NextResponse.json(result);
}
