-- AlterTable
ALTER TABLE "DailyData" ADD COLUMN     "activeMinutes" INTEGER,
ADD COLUMN     "avgHeartRate" INTEGER,
ADD COLUMN     "distanceMeters" DOUBLE PRECISION,
ADD COLUMN     "healthRaw" JSONB,
ADD COLUMN     "healthSyncedAt" TIMESTAMP(3),
ADD COLUMN     "restingHeartRate" INTEGER,
ADD COLUMN     "sleepMinutes" INTEGER,
ADD COLUMN     "totalCalories" DOUBLE PRECISION,
ADD COLUMN     "weightKg" DOUBLE PRECISION;
