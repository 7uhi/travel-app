-- DropIndex
DROP INDEX "PackingItem_tripId_idx";

-- AlterTable
ALTER TABLE "PackingItem" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "packed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PackingItem_tripId_ownerId_idx" ON "PackingItem"("tripId", "ownerId");

-- AddForeignKey
ALTER TABLE "PackingItem" ADD CONSTRAINT "PackingItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
