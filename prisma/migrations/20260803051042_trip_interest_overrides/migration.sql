-- CreateTable
CREATE TABLE "TripInterest" (
    "id" TEXT NOT NULL,
    "tag" "InterestTag" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 0,
    "tripPreferenceId" TEXT NOT NULL,

    CONSTRAINT "TripInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripInterest_tripPreferenceId_tag_key" ON "TripInterest"("tripPreferenceId", "tag");

-- AddForeignKey
ALTER TABLE "TripInterest" ADD CONSTRAINT "TripInterest_tripPreferenceId_fkey" FOREIGN KEY ("tripPreferenceId") REFERENCES "TripPreference"("id") ON DELETE CASCADE ON UPDATE CASCADE;
