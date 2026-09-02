import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; 

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") || "";

  try {
    const items = await prisma.item.findMany({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      // Keep the results stable and readable while still limiting the response size
      orderBy: { name: "asc" },
      // Cap it at 500 items so the browser doesn't lag rendering a massive table
      take: 500,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("Error fetching items:", error);
    return NextResponse.json({ error: "Failed to load items" }, { status: 500 });
  }
}