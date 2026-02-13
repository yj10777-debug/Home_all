-- CreateTable
CREATE TABLE "AiEvaluation" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEvaluation_date_idx" ON "AiEvaluation"("date");

-- CreateIndex
CREATE INDEX "AiEvaluation_type_date_idx" ON "AiEvaluation"("type", "date");
