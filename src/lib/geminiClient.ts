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

  const model = genAI.getGenerativeModel({
    model: modelName,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
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
