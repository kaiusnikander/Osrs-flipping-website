import { ensureDatabaseSchema, prisma } from "@/lib/prisma";
import { fetchItemMapping, fetchLatestPrices } from "@/lib/osrs";
import type { FavoriteItem, MarketItem, PriceHistoryPoint } from "@/types/market";

const STALE_MINUTES = 15;
const MAX_ITEMS = 150;
const OSRS_SALES_TAX = 0.01;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function calculatePotentialProfit(low: number, high: number): number {
  return Math.floor(high * (1 - OSRS_SALES_TAX) - low);
}

async function hasFreshData(): Promise<boolean> {
  const latestSnapshot = await prisma.priceSnapshot.findFirst({
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });

  if (!latestSnapshot) {
    return false;
  }

  const staleThreshold = new Date(Date.now() - STALE_MINUTES * 60 * 1000);
  return latestSnapshot.timestamp > staleThreshold;
}

export async function syncMarketData(force = false): Promise<{
  updatedItems: number;
  createdSnapshots: number;
  skipped: boolean;
}> {
  await ensureDatabaseSchema();

  if (!force && (await hasFreshData())) {
    return { updatedItems: 0, createdSnapshots: 0, skipped: true };
  }

  const [mapping, latestPrices] = await Promise.all([
    fetchItemMapping(),
    fetchLatestPrices(),
  ]);

  const itemsWithPrices = mapping
    .map((item) => {
      const latest = latestPrices.data[item.id];
      if (!latest?.low || !latest?.high) {
        return null;
      }

      return {
        id: item.id,
        name: item.name,
        examine: item.examine ?? null,
        members: item.members ?? false,
        lowalch: item.lowalch ?? null,
        highalch: item.highalch ?? null,
        buyLimit: item.limit ?? null,
        icon: item.icon ?? null,
        wikiUrl: item.name
          ? `https://oldschool.runescape.wiki/w/${encodeURIComponent(item.name)}`
          : null,
        high: latest.high,
        low: latest.low,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  for (const rowChunk of chunk(itemsWithPrices, 75)) {
    await Promise.all(
      rowChunk.map((row) =>
        prisma.item.upsert({
          where: { id: row.id },
          create: {
            id: row.id,
            name: row.name,
            examine: row.examine,
            members: row.members,
            lowalch: row.lowalch,
            highalch: row.highalch,
            buyLimit: row.buyLimit,
            icon: row.icon,
            wikiUrl: row.wikiUrl,
          },
          update: {
            name: row.name,
            examine: row.examine,
            members: row.members,
            lowalch: row.lowalch,
            highalch: row.highalch,
            buyLimit: row.buyLimit,
            icon: row.icon,
            wikiUrl: row.wikiUrl,
          },
        }),
      ),
    );
  }

  await prisma.priceSnapshot.createMany({
    data: itemsWithPrices.map((item) => ({
      itemId: item.id,
      priceHigh: item.high,
      priceLow: item.low,
      timestamp: new Date(),
    })),
  });

  return {
    updatedItems: itemsWithPrices.length,
    createdSnapshots: itemsWithPrices.length,
    skipped: false,
  };
}

async function ensureDataExists(): Promise<void> {
  await ensureDatabaseSchema();
  const snapshotCount = await prisma.priceSnapshot.count();
  if (snapshotCount === 0) {
    await syncMarketData(true);
  }
}

export async function searchMarketItems(
  query: string,
  profileId: string,
): Promise<MarketItem[]> {
  await ensureDatabaseSchema();
  await ensureDataExists();

  const trimmedQuery = query.trim();
  const items = await prisma.item.findMany({
    where: trimmedQuery
      ? { name: { contains: trimmedQuery, mode: "insensitive" } }
      : undefined,
    include: {
      snapshots: {
        orderBy: { timestamp: "desc" },
        take: 1,
      },
      favorites: {
        where: { profileId },
        select: { id: true },
      },
    },
    take: MAX_ITEMS,
    orderBy: { name: "asc" },
  });

  return items
    .map((item) => {
      const latest = item.snapshots[0];
      if (!latest) {
        return null;
      }

      const margin = latest.priceHigh - latest.priceLow;
      return {
        itemId: item.id,
        name: item.name,
        high: latest.priceHigh,
        low: latest.priceLow,
        margin,
        potentialProfit: calculatePotentialProfit(latest.priceLow, latest.priceHigh),
        favorited: item.favorites.length > 0,
        updatedAt: latest.timestamp.toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((left, right) => right.potentialProfit - left.potentialProfit);
}

export async function getPriceHistory(
  itemId: number,
  hours = 24,
): Promise<PriceHistoryPoint[]> {
  await ensureDatabaseSchema();
  const since = new Date(Date.now() - Math.max(1, hours) * 60 * 60 * 1000);

  const snapshots = await prisma.priceSnapshot.findMany({
    where: {
      itemId,
      timestamp: { gte: since },
    },
    orderBy: { timestamp: "asc" },
    take: 400,
  });

  return snapshots.map((snapshot) => ({
    timestamp: snapshot.timestamp.toISOString(),
    high: snapshot.priceHigh,
    low: snapshot.priceLow,
  }));
}

export async function setFavorite(
  profileId: string,
  itemId: number,
  favorite: boolean,
): Promise<void> {
  await ensureDatabaseSchema();

  if (favorite) {
    await prisma.favorite.upsert({
      where: {
        profileId_itemId: {
          profileId,
          itemId,
        },
      },
      create: { profileId, itemId },
      update: {},
    });
    return;
  }

  await prisma.favorite.deleteMany({
    where: {
      profileId,
      itemId,
    },
  });
}

export async function getFavoriteItems(profileId: string): Promise<FavoriteItem[]> {
  await ensureDatabaseSchema();
  await ensureDataExists();

  const favorites = await prisma.favorite.findMany({
    where: { profileId },
    include: {
      item: {
        include: {
          snapshots: {
            orderBy: { timestamp: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return favorites
    .map((favorite) => {
      const latest = favorite.item.snapshots[0];
      if (!latest) {
        return null;
      }

      const margin = latest.priceHigh - latest.priceLow;
      return {
        itemId: favorite.itemId,
        name: favorite.item.name,
        high: latest.priceHigh,
        low: latest.priceLow,
        margin,
        potentialProfit: calculatePotentialProfit(latest.priceLow, latest.priceHigh),
      };
    })
    .filter((favorite): favorite is NonNullable<typeof favorite> => favorite !== null);
}
