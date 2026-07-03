/**
 * APIエラーレスポンス用のメッセージ生成
 *
 * 本番でスタックトレースやDB接続情報などの内部詳細をクライアントに
 * そのまま返さないようにする。詳細は呼び出し側で console.error 済みの前提。
 */

/** 本番向けの汎用エラーメッセージ */
const GENERIC_MESSAGE = "内部エラーが発生しました";

/**
 * クライアントに返すエラーメッセージを生成する。
 * 本番 (NODE_ENV === "production") では詳細を隠して汎用メッセージを返し、
 * それ以外の環境ではデバッグしやすいよう詳細を返す。
 */
export function toClientErrorMessage(e: unknown): string {
  if (process.env.NODE_ENV === "production") {
    return GENERIC_MESSAGE;
  }
  return e instanceof Error ? e.message : String(e);
}
