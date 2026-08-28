-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "examine" TEXT,
    "members" BOOLEAN NOT NULL DEFAULT false,
    "lowalch" INTEGER,
    "highalch" INTEGER,
    "buyLimit" INTEGER,
    "icon" TEXT,
    "wikiUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "priceHigh" INTEGER NOT NULL,
    "priceLow" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" BIGSERIAL NOT NULL,
    "profileId" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_name_idx" ON "Item"("name");

-- CreateIndex
CREATE INDEX "PriceSnapshot_itemId_timestamp_idx" ON "PriceSnapshot"("itemId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "PriceSnapshot_timestamp_idx" ON "PriceSnapshot"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "Favorite_profileId_idx" ON "Favorite"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_profileId_itemId_key" ON "Favorite"("profileId", "itemId");

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
