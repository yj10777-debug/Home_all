/**
 * Gemini API クライアント
 * 環境変数でモデルを切り替え可能
 *
 * GEMINI_API_KEY: APIキー（必須）
 * GEMINI_MODEL: モデル名（デフォルト: gemini-2.0-flash）
 *   - gemini-2.0-flash（高速・無料枠大）
 *   - gemini-1.5-pro（高品質・無料枠小）
 *   - gemini-2.0-pro（最高品質）
 */
import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.5-flash";

/** Gemini にテキストを送信し、回答を取得する */
export async function callGemini(prompt: string, systemPrompt?: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY が設定されていません");
  }

  const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const genAI = new GoogleGenerativeAI(apiKey);

  // 応答速度対策: 2.5系は内部思考(thinking)で遅くなるため既定で thinkingBudget=0（無効化）。
  // GEMINI_THINKING_BUDGET で上書き可能（0=無効, -1=動的, 正数=トークン上限）。
  const thinkingBudgetRaw = process.env.GEMINI_THINKING_BUDGET;
  const thinkingBudget = thinkingBudgetRaw != null && thinkingBudgetRaw !== "" ? Number(thinkingBudgetRaw) : 0;

  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    ...(Number.isFinite(thinkingBudget)
      ? { generationConfig: { thinkingConfig: { thinkingBudget } } as Record<string, unknown> }
      : {}),
  });

  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();

  if (!text) {
    throw new Error("Gemini からの応答が空です");
  }

  return text;
}

/** Gemini API が設定されているか確認 */
export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/** 現在のモデル名を返す */
export function getGeminiModelName(): string {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}
