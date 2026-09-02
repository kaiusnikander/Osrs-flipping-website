import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; 

export async function POST() {
  try {
    // 1. Fetch 1-hour data (contains prices AND trade volume)
    const priceRes = await fetch("https://prices.runescape.wiki/api/v1/osrs/1h", {
      headers: { "User-Agent": "FlipFinderApp - your@email.com" } 
    });
    const priceJson = await priceRes.json();
    const prices = priceJson.data;

    // 2. Fetch Item Mapping (Names, Buy Limits)
    const mappingRes = await fetch("https://prices.runescape.wiki/api/v1/osrs/mapping", {
      headers: { "User-Agent": "FlipFinderApp - your@email.com" }
    });
    const mappingData = await mappingRes.json(); 

    // 3. Create a fast lookup map
    const itemInfoMap = new Map();
    for (const item of mappingData) {
      itemInfoMap.set(item.id, {
        name: item.name,
        limit: item.limit ?? 0, 
      });
    }

    // 4. Merge prices, volume, and limits
    const mergedItems = [];
    for (const [idString, priceData] of Object.entries(prices)) {
      const id = Number(idString);
      const info = itemInfoMap.get(id);

      if (info) {
        // @ts-ignore - The 1h API uses these specific field names
        const high = priceData.avgHighPrice ?? 0;
        // @ts-ignore
        const low = priceData.avgLowPrice ?? 0;
        // @ts-ignore - Total volume is buy volume + sell volume
        const volume = (priceData.highPriceVolume ?? 0) + (priceData.lowPriceVolume ?? 0);

        mergedItems.push({
          id,
          name: info.name,
          limit: info.limit,
          high,
          low,
          volume,
        });
      }
    }

    // 5. Save everything to your database!
    // (This uses a transaction to update the DB efficiently)
    await prisma.$transaction(
      mergedItems.map((item) =>
        prisma.item.upsert({
          where: { id: item.id },
          update: {
            name: item.name,
            high: item.high,
            low: item.low,
            limit: item.limit,
            volume: item.volume, // Ensure 'volume' exists in your Prisma schema!
          },
          create: {
            id: item.id,
            name: item.name,
            high: item.high,
            low: item.low,
            limit: item.limit,
            volume: item.volume,
          },
        })
      )
    );

    return NextResponse.json({ success: true, count: mergedItems.length });

  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: "Failed to sync market data" }, { status: 500 });
  }
}