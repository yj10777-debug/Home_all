/**
 * クロスプラットフォームのクリップボード読み取り。
 * Windows: PowerShell Get-Clipboard
 * macOS:   pbpaste
 * Linux:   xclip / xsel（どちらか存在する方）
 *
 * Cookie値を扱うため、失敗時のエラーメッセージにクリップボードの中身は含めない。
 */
import { spawnSync } from "child_process";

function tryRun(cmd: string, args: string[]): string | null {
  const result = spawnSync(cmd, args, { encoding: "utf-8" });
  if (result.error || result.status !== 0) return null;
  const out = result.stdout ?? "";
  return out;
}

export function readClipboardText(): string {
  const platform = process.platform;

  if (platform === "win32") {
    // -Raw で改行を保持したまま取得する
    const out = tryRun("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-Clipboard -Raw",
    ]);
    if (out !== null) return out.replace(/\r\n/g, "\n");
    throw new Error(
      "クリップボードの読み取りに失敗しました（PowerShell Get-Clipboard）。手動でファイルに保存し、パス指定で実行してください。"
    );
  }

  if (platform === "darwin") {
    const out = tryRun("pbpaste", []);
    if (out !== null) return out;
    throw new Error("クリップボードの読み取りに失敗しました（pbpaste）。手動でファイルに保存し、パス指定で実行してください。");
  }

  // Linux 等: xclip → xsel の順に試す
  const xclipOut = tryRun("xclip", ["-selection", "clipboard", "-o"]);
  if (xclipOut !== null) return xclipOut;
  const xselOut = tryRun("xsel", ["--clipboard", "--output"]);
  if (xselOut !== null) return xselOut;

  throw new Error(
    "クリップボードの読み取りに失敗しました（xclip / xsel が見つかりません）。手動でファイルに保存し、パス指定で実行してください。"
  );
}
