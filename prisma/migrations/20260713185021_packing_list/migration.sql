-- CreateEnum
CREATE TYPE "PackingCategory" AS ENUM ('GEAR', 'CLOTHING', 'TOILETRIES', 'ELECTRONICS', 'DOCUMENTS', 'FOOD', 'OTHER');

-- CreateTable
CREATE TABLE "PackingItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "PackingCategory" NOT NULL DEFAULT 'OTHER',
    "packed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tripId" TEXT NOT NULL,
    "assigneeId" TEXT,

    CONSTRAINT "PackingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackingItem_tripId_idx" ON "PackingItem"("tripId");

-- CreateIndex
CREATE INDEX "PackingItem_assigneeId_idx" ON "PackingItem"("assigneeId");

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
