/**
 * Google Drive API クライアント（OAuth 2.0 リフレッシュトークン方式）
 * googleapis パッケージを使わず、REST API を直接呼び出す軽量実装
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

/** 環境変数からOAuth設定を取得 */
function getConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_STRONG_FOLDER_ID;

  if (!clientId || !clientSecret || !refreshToken) {
    return null; // 未設定の場合はnull（スキップ用）
  }
  return { clientId, clientSecret, refreshToken, folderId: folderId || "" };
}

/** リフレッシュトークンからアクセストークンを取得 */
async function getAccessToken(config: NonNullable<ReturnType<typeof getConfig>>): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`アクセストークン取得失敗: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** フォルダ内の .txt ファイル一覧を取得 */
async function listTxtFiles(accessToken: string, folderId: string): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const query = `'${folderId}' in parents and mimeType='text/plain' and trashed=false`;
  const fields = "files(id,name,modifiedTime)";
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&orderBy=modifiedTime desc&pageSize=1000`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ファイル一覧取得失敗: ${res.status} ${err}`);
  }

  const data = (await res.json()) as { files: { id: string; name: string; modifiedTime: string }[] };
  return data.files || [];
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
 * @returns ファイル名と内容の配列。環境変数未設定時はnull
 */
export async function fetchStrongFilesFromDrive(): Promise<{ name: string; content: string }[] | null> {
  const config = getConfig();
  if (!config || !config.folderId) {
    console.log("Google Drive 設定が未完了（スキップ）");
    return null;
  }

  const accessToken = await getAccessToken(config);
  const files = await listTxtFiles(accessToken, config.folderId);

  if (files.length === 0) {
    console.log("Google Drive: .txt ファイルが見つかりません");
    return [];
  }

  console.log(`Google Drive: ${files.length} 件の .txt ファイルを検出`);

  // 全ファイルをダウンロード
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
