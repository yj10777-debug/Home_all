/**
 * AI 食事評価の実行・保存ロジック
 * Gemini API でプロンプトを送信し、結果を AiEvaluation テーブルに保存する
 */
import { prisma } from "./prisma";
import { callGemini, getGeminiModelName } from "./geminiClient";
import { generateDailyPrompt, generateWeeklyPrompt, getGemSystemPrompt } from "./gemini";

/** AI 評価の実行結果 */
export type EvaluationResult = {
  id: string;
  date: string;
  type: "daily" | "weekly";
  model: string;
  response: string;
  trigger: string;
  createdAt: Date;
};

/**
 * 日次AI評価を実行し、DBに保存して返す
 * @param dateStr 対象日付 (YYYY-MM-DD)
 * @param trigger 実行トリガー ("manual" | "cron")
 * @param systemPromptOverride 未指定時は getGemSystemPrompt() を使用
 */
export async function runDailyEvaluation(
  dateStr: string,
  trigger: "manual" | "cron",
  systemPromptOverride?: string
): Promise<EvaluationResult> {
  const prompt = await generateDailyPrompt(dateStr);
  const systemPrompt = (systemPromptOverride && systemPromptOverride.trim()) ? systemPromptOverride.trim() : getGemSystemPrompt();
  const modelName = getGeminiModelName();

  // Gemini API に送信
  const response = await callGemini(prompt, systemPrompt);

  // DB に保存
  const record = await prisma.aiEvaluation.create({
    data: {
      date: dateStr,
      type: "daily",
      model: modelName,
      prompt,
      response,
      trigger,
    },
  });

  return {
    id: record.id,
    date: record.date,
    type: "daily",
    model: record.model,
    response: record.response,
    trigger: record.trigger,
    createdAt: record.createdAt,
  };
}

/**
 * 週次AI評価を実行し、DBに保存して返す
 * @param sundayStr 週の開始日（日曜） (YYYY-MM-DD)
 * @param trigger 実行トリガー ("manual" | "cron")
 * @param systemPromptOverride 未指定時は getGemSystemPrompt() を使用
 */
export async function runWeeklyEvaluation(
  sundayStr: string,
  trigger: "manual" | "cron",
  systemPromptOverride?: string
): Promise<EvaluationResult> {
  const prompt = await generateWeeklyPrompt(sundayStr);
  const systemPrompt = (systemPromptOverride && systemPromptOverride.trim()) ? systemPromptOverride.trim() : getGemSystemPrompt();
  const modelName = getGeminiModelName();

  const response = await callGemini(prompt, systemPrompt);

  const record = await prisma.aiEvaluation.create({
    data: {
      date: sundayStr,
      type: "weekly",
      model: modelName,
      prompt,
      response,
      trigger,
    },
  });

  return {
    id: record.id,
    date: record.date,
    type: "weekly",
    model: record.model,
    response: record.response,
    trigger: record.trigger,
    createdAt: record.createdAt,
  };
}

/**
 * 指定日の最新AI評価を取得
 */
export async function getLatestEvaluation(
  dateStr: string,
  type: "daily" | "weekly" = "daily"
): Promise<EvaluationResult | null> {
  const record = await prisma.aiEvaluation.findFirst({
    where: { date: dateStr, type },
    orderBy: { createdAt: "desc" },
  });

  if (!record) return null;

  return {
    id: record.id,
    date: record.date,
    type: record.type as "daily" | "weekly",
    model: record.model,
    response: record.response,
    trigger: record.trigger,
    createdAt: record.createdAt,
  };
}
