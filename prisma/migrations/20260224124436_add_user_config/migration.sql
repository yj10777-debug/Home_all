-- CreateTable
CREATE TABLE "UserConfig" (
    "userId" TEXT NOT NULL,
    "goals" JSONB,
    "personal" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConfig_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "goals" JSONB,
    "personal" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);
