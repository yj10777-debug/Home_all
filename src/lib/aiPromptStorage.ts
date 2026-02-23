/**
 * 設定画面で保存した AI システムプロンプトの localStorage キー
 * トップ・日付ページの両方で同じキーを使い、評価時に送信する
 */
export const AI_PROMPT_STORAGE_KEY = "nutrition-ai-system-prompt";

/** ブラウザで保存済みプロンプトを取得（未設定・空の場合は null） */
export function getStoredSystemPrompt(): string | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(AI_PROMPT_STORAGE_KEY);
  if (v == null || v.trim() === "") return null;
  return v.trim();
}
