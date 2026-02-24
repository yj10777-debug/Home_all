/**
 * データソース用認証情報取得
 * 現状は default ユーザーのみ env から取得。将来は Integration / 暗号化ストアから取得する想定。
 */

import { DEFAULT_USER_ID } from "../dbConfig";

export type AskenCredentials = { email: string; password: string };

/**
 * あすけん用の認証情報を取得する
 * @param userId 未指定または "default" のときは環境変数 ASKEN_EMAIL / ASKEN_PASSWORD を返す。それ以外は将来 DB から取得（現状は null）
 */
export async function getAskenCredentials(
  userId: string = DEFAULT_USER_ID
): Promise<AskenCredentials | null> {
  if (userId !== DEFAULT_USER_ID) {
    // 将来: Integration や暗号化ストアから取得
    return null;
  }
  const email = process.env.ASKEN_EMAIL;
  const password = process.env.ASKEN_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}
