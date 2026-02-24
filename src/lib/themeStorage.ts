/**
 * 色テーマの保存・読み込み（localStorage）
 */

export const THEME_STORAGE_KEY = "nutrition-app-theme";

export type ThemeId = "default" | "light" | "dark" | "pink" | "ocean";

const VALID_THEMES: ThemeId[] = ["default", "light", "dark", "pink", "ocean"];

/**
 * 保存されているテーマIDを取得。無効な値の場合は "default"
 */
export function getStoredTheme(): ThemeId {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw && VALID_THEMES.includes(raw as ThemeId)) return raw as ThemeId;
  } catch {
    // ignore
  }
  return "default";
}

/**
 * テーマを保存し、document の data-theme を更新する
 */
export function setStoredTheme(theme: ThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  } catch {
    // ignore
  }
}

/**
 * 起動時に document にテーマを適用する（_app で呼ぶ）
 */
export function applyStoredTheme(): void {
  const theme = getStoredTheme();
  document.documentElement.dataset.theme = theme;
}
