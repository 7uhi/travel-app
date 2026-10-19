-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TripMember" ADD COLUMN     "archivedAt" TIMESTAMP(3);
