import { getPriceHistory } from "@/lib/market";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
  const params = await context.params;
  const itemId = Number.parseInt(params.itemId, 10);

  if (!Number.isInteger(itemId) || itemId <= 0) {
    return NextResponse.json({ error: "Invalid item id." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const hoursParam = searchParams.get("hours");
  const hours = hoursParam ? Number.parseInt(hoursParam, 10) : 24;

  const history = await getPriceHistory(itemId, Number.isNaN(hours) ? 24 : hours);
  return NextResponse.json({ history });
}
