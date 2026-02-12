-- CreateTable
CREATE TABLE "SyncLog" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asken_count" INTEGER NOT NULL DEFAULT 0,
    "strong_count" INTEGER NOT NULL DEFAULT 0,
    "day_count" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);
