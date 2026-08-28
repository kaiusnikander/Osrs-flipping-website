import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

export async function ensureDatabaseSchema() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS "Item" (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        examine TEXT,
        members BOOLEAN NOT NULL DEFAULT false,
        lowalch INTEGER,
        highalch INTEGER,
        "buyLimit" INTEGER,
        icon TEXT,
        "wikiUrl" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS "PriceSnapshot" (
        id BIGSERIAL PRIMARY KEY,
        "itemId" INTEGER NOT NULL,
        "priceHigh" INTEGER NOT NULL,
        "priceLow" INTEGER NOT NULL,
        timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PriceSnapshot_itemId_fkey"
          FOREIGN KEY ("itemId") REFERENCES "Item"(id) ON DELETE CASCADE
      )
    `,
    `
      CREATE TABLE IF NOT EXISTS "Favorite" (
        id BIGSERIAL PRIMARY KEY,
        "profileId" TEXT NOT NULL,
        "itemId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Favorite_itemId_fkey"
          FOREIGN KEY ("itemId") REFERENCES "Item"(id) ON DELETE CASCADE
      )
    `,
    `CREATE INDEX IF NOT EXISTS "Item_name_idx" ON "Item" (name)`,
    `CREATE INDEX IF NOT EXISTS "PriceSnapshot_itemId_timestamp_idx" ON "PriceSnapshot" ("itemId", timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS "PriceSnapshot_timestamp_idx" ON "PriceSnapshot" (timestamp DESC)`,
    `CREATE INDEX IF NOT EXISTS "Favorite_profileId_idx" ON "Favorite" ("profileId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_profileId_itemId_key" ON "Favorite" ("profileId", "itemId")`,
  ];

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}
