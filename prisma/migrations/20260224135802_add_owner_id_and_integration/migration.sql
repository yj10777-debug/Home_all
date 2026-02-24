-- AlterTable
ALTER TABLE "AiEvaluation" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "DailyData" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "SyncLog" ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Integration_userId_idx" ON "Integration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_userId_sourceType_key" ON "Integration"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "AiEvaluation_ownerId_idx" ON "AiEvaluation"("ownerId");

-- CreateIndex
CREATE INDEX "DailyData_ownerId_idx" ON "DailyData"("ownerId");
