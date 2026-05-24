-- CreateTable
CREATE TABLE "ScrapingLog" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScrapingLog_date_idx" ON "ScrapingLog"("date");

-- CreateIndex
CREATE INDEX "ScrapingLog_status_idx" ON "ScrapingLog"("status");

-- CreateIndex
CREATE INDEX "ScrapingLog_createdAt_idx" ON "ScrapingLog"("createdAt");
