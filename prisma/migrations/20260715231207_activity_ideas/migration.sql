-- CreateTable
CREATE TABLE "ActivityIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "locationName" TEXT,
    "estimatedCost" DECIMAL(12,2),
    "promotedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tripId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "ActivityIdea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityVote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ideaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ActivityVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityIdea_tripId_idx" ON "ActivityIdea"("tripId");

-- CreateIndex
CREATE INDEX "ActivityVote_userId_idx" ON "ActivityVote"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityVote_ideaId_userId_key" ON "ActivityVote"("ideaId", "userId");

-- AddForeignKey
ALTER TABLE "ActivityIdea" ADD CONSTRAINT "ActivityIdea_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityIdea" ADD CONSTRAINT "ActivityIdea_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVote" ADD CONSTRAINT "ActivityVote_ideaId_fkey" FOREIGN KEY ("ideaId") REFERENCES "ActivityIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVote" ADD CONSTRAINT "ActivityVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
