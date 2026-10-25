-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('RESERVED', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TripAiSetting" (
    "tripId" TEXT NOT NULL,
    "suggestionsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "enabledById" TEXT,
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripAiSetting_pkey" PRIMARY KEY ("tripId")
);

-- CreateTable
CREATE TABLE "AiGeneration" (
    "id" TEXT NOT NULL,
    "status" "AiGenerationStatus" NOT NULL DEFAULT 'RESERVED',
    "provider" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "validationFailed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AiGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiGeneration_tripId_createdAt_idx" ON "AiGeneration"("tripId", "createdAt");

-- CreateIndex
CREATE INDEX "AiGeneration_userId_createdAt_idx" ON "AiGeneration"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TripAiSetting" ADD CONSTRAINT "TripAiSetting_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
