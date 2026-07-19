/**
 * Google Drive API クライアント（OAuth 2.0 リフレッシュトークン方式）
 * googleapis パッケージを使わず、REST API を直接呼び出す軽量実装。
 * 認証部分は googleAuth.ts に共通化済み。
 */

import { getGoogleAccessToken, getGoogleOAuthConfig } from "./googleAuth";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

type DriveConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId: string;
};

function getConfig(): DriveConfig | null {
  const oauth = getGoogleOAuthConfig();
  if (!oauth) return null;
  const folderId = process.env.GOOGLE_DRIVE_STRONG_FOLDER_ID;
  return { ...oauth, folderId: folderId || "" };
}

/** フォルダ内の .txt ファイル一覧を取得（nextPageToken を辿り全件取得） */
async function listTxtFiles(
  accessToken: string,
  folderId: string,
  modifiedAfterIso?: string
): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  let query = `'${folderId}' in parents and mimeType='text/plain' and trashed=false`;
  // 同期対象期間より十分前のファイルを除外（フォルダが成長しても全件DLしないため）
  if (modifiedAfterIso) query += ` and modifiedTime > '${modifiedAfterIso}'`;
  const fields = "nextPageToken,files(id,name,modifiedTime)";

  const allFiles: { id: string; name: string; modifiedTime: string }[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields,
      orderBy: "modifiedTime desc",
      pageSize: "1000",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`ファイル一覧取得失敗: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      files: { id: string; name: string; modifiedTime: string }[];
      nextPageToken?: string;
    };
    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/** ファイルのテキスト内容をダウンロード */
async function downloadFile(accessToken: string, fileId: string): Promise<string> {
  const url = `${DRIVE_API}/files/${fileId}?alt=media`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`ファイルダウンロード失敗: ${res.status}`);
  }

  return res.text();
}

/**
 * Google Drive の Strong フォルダから .txt ファイルを取得する
 * @param modifiedAfterIso この時刻(RFC3339)より後に更新されたファイルのみ取得（省略時は全件）
 * @returns ファイル名と内容の配列。環境変数未設定時はnull
 */
export async function fetchStrongFilesFromDrive(
  modifiedAfterIso?: string
): Promise<{ name: string; content: string }[] | null> {
  const config = getConfig();
  if (!config || !config.folderId) {
    return null;
  }

  const accessToken = await getGoogleAccessToken(config);
  const files = await listTxtFiles(accessToken, config.folderId, modifiedAfterIso);

  if (files.length === 0) {
    return [];
  }

  const results: { name: string; content: string }[] = [];
  for (const file of files) {
    try {
      const content = await downloadFile(accessToken, file.id);
      results.push({ name: file.name, content });
    } catch (e) {
      console.error(`Google Drive: ${file.name} のダウンロード失敗:`, e);
    }
  }

  return results;
}

/**
 * Google Drive が設定されているか確認
 */
export function isGoogleDriveConfigured(): boolean {
  return getConfig() !== null && !!process.env.GOOGLE_DRIVE_STRONG_FOLDER_ID;
}
