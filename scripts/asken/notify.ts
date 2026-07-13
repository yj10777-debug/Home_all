/**
 * Windowsデスクトップ通知（トースト）。BurntToast モジュールが無い環境でも動くよう、
 * MessageBox ポップアップ → msg コマンドの順にフォールバックする。
 * Windows以外では console.warn のみ行う。
 *
 * 通知文言にCookie値・パスワード等の秘匿情報を含めないこと。
 */
import { spawnSync } from "child_process";

/** PowerShell文字列リテラル用に単一引用符をエスケープ */
function psQuote(s: string): string {
  return s.replace(/'/g, "''");
}

function runPowerShell(script: string): boolean {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf-8",
  });
  return !result.error && result.status === 0;
}

export function notifyWindows(title: string, message: string): void {
  if (process.platform !== "win32") {
    console.warn(`[通知] ${title}: ${message}`);
    return;
  }

  const t = psQuote(title);
  const m = psQuote(message);

  // 1. BurntToast があればトースト通知
  const burntToastScript = `
if (Get-Module -ListAvailable -Name BurntToast) {
  Import-Module BurntToast
  New-BurntToastNotification -Text '${t}', '${m}'
  exit 0
} else {
  exit 1
}
`;
  if (runPowerShell(burntToastScript)) return;

  // 2. Windows Forms の MessageBox（管理者権限不要、BurntToast未導入でも動く）
  const messageBoxScript = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show('${m}', '${t}') | Out-Null
`;
  if (runPowerShell(messageBoxScript)) return;

  // 3. msg コマンド（Windows Home 等では失敗しうるので最終フォールバック）
  const msgResult = spawnSync("msg", ["*", `${title}: ${message}`], { encoding: "utf-8" });
  if (!msgResult.error && msgResult.status === 0) return;

  // すべて失敗した場合は最低限コンソールに出す
  console.warn(`[通知失敗 - コンソール出力] ${title}: ${message}`);
}
