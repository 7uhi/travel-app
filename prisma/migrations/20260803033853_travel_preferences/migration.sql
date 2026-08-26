-- CreateEnum
CREATE TYPE "TravelPace" AS ENUM ('RELAXED', 'BALANCED', 'PACKED');

-- CreateEnum
CREATE TYPE "BudgetTier" AS ENUM ('SHOESTRING', 'MODERATE', 'COMFORT', 'LUXURY');

-- CreateEnum
CREATE TYPE "DayRhythm" AS ENUM ('EARLY_BIRD', 'FLEXIBLE', 'NIGHT_OWL');

-- CreateEnum
CREATE TYPE "LodgingStyle" AS ENUM ('HOSTEL', 'RENTAL', 'HOTEL', 'BOUTIQUE', 'CAMPING');

-- CreateEnum
CREATE TYPE "InterestTag" AS ENUM ('FOOD', 'NIGHTLIFE', 'ART_MUSEUMS', 'HISTORY', 'NATURE', 'HIKING', 'BEACH', 'WATER_SPORTS', 'ADVENTURE', 'SHOPPING', 'WELLNESS', 'LOCAL_LIFE');

-- CreateEnum
CREATE TYPE "TravelRegion" AS ENUM ('ANYWHERE', 'DOMESTIC', 'EUROPE', 'ASIA', 'AFRICA', 'NORTH_AMERICA', 'SOUTH_AMERICA', 'OCEANIA');

-- CreateEnum
CREATE TYPE "Climate" AS ENUM ('WARM', 'MILD', 'COLD', 'NO_PREFERENCE');

-- CreateTable
CREATE TABLE "TravelProfile" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pace" "TravelPace",
    "budgetTier" "BudgetTier",
    "dayRhythm" "DayRhythm",
    "lodgingStyle" "LodgingStyle",
    "dietaryNotes" TEXT,
    "accessibilityNotes" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TravelProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TravelInterest" (
    "id" TEXT NOT NULL,
    "tag" "InterestTag" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT NOT NULL,

    CONSTRAINT "TravelInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripPreference" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "budgetComfort" "BudgetTier",
    "mustDo" TEXT,
    "dealBreakers" TEXT,
    "preferredRegion" "TravelRegion",
    "preferredClimate" "Climate",
    "maxTravelHours" INTEGER,
    "userId" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,

    CONSTRAINT "TripPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelProfile_userId_key" ON "TravelProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelInterest_profileId_tag_key" ON "TravelInterest"("profileId", "tag");

-- CreateIndex
CREATE INDEX "TripPreference_tripId_idx" ON "TripPreference"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "TripPreference_userId_tripId_key" ON "TripPreference"("userId", "tripId");

-- AddForeignKey
ALTER TABLE "TravelProfile" ADD CONSTRAINT "TravelProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelInterest" ADD CONSTRAINT "TravelInterest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "TravelProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPreference" ADD CONSTRAINT "TripPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripPreference" ADD CONSTRAINT "TripPreference_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
