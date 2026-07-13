<#
.SYNOPSIS
  あすけんセッション監視 (scripts/asken/session-guard.ts) を Windows タスクスケジューラに
  定期実行タスクとして登録する。

.DESCRIPTION
  タスク名  : AskenSessionGuard
  実行間隔  : 3時間ごと（1日8回）。当日00:00を起点に登録し、以後3時間おきに実行される。
  実行内容  : このプロジェクトのディレクトリで `npx tsx scripts/asken/session-guard.ts` を実行する。
              セッションが有効なら直近3日分を自動同期し、無効ならWindows通知を出す。

  このスクリプトは「タスクを登録するだけ」で、登録後の実行はタスクスケジューラに任される。
  このファイル自体を実行しても session-guard.ts はその場では走らない（登録のみ）。

.NOTES
  - 一度だけ実行すればよい（再実行すると同名タスクを上書き登録し直す）。
  - タスクを削除する場合: Unregister-ScheduledTask -TaskName "AskenSessionGuard" -Confirm:$false
  - タスクを手動で今すぐ動かして確認する場合: Start-ScheduledTask -TaskName "AskenSessionGuard"
  - ログを見る場合: タスクスケジューラのGUI、または
      Get-ScheduledTaskInfo -TaskName "AskenSessionGuard"
  - npx のフルパスは `Get-Command npx` で解決する（PATHが通っていないSYSTEM権限実行等でも動くように）。
#>

$ErrorActionPreference = "Stop"

$TaskName = "AskenSessionGuard"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)  # scripts/asken -> scripts -> プロジェクトルート

# npx のフルパスを解決（PATH未通の実行コンテキストでも動作させるため）
$NpxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $NpxCommand) {
    $NpxCommand = Get-Command npx -ErrorAction SilentlyContinue
}
if (-not $NpxCommand) {
    Write-Error "npx が見つかりません。Node.js がインストールされ、PATHに含まれていることを確認してください。"
    exit 1
}
$NpxPath = $NpxCommand.Source

Write-Host "プロジェクトルート: $ProjectRoot"
Write-Host "npx フルパス       : $NpxPath"

# タスクの実行内容: プロジェクトルートで `npx tsx scripts/asken/session-guard.ts` を実行
$Action = New-ScheduledTaskAction `
    -Execute $NpxPath `
    -Argument "tsx scripts/asken/session-guard.ts" `
    -WorkingDirectory $ProjectRoot

# トリガー: 今日の00:00を起点に、3時間ごとに無期限で繰り返す
$StartTime = (Get-Date -Hour 0 -Minute 0 -Second 0)
# RepetitionDuration に [TimeSpan]::MaxValue を渡すとタスクXMLが範囲外エラーになるため、
# 実質無期限として十分に長い期間（10年）を指定する
$Trigger = New-ScheduledTaskTrigger -Once -At $StartTime `
    -RepetitionInterval (New-TimeSpan -Hours 3) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew

# 現在ログオン中のユーザーとして実行（デスクトップ通知を表示するため、ログオン中のみ実行される設定にする）
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Principal $Principal `
    -Description "あすけんセッションの有効性を3時間ごとに確認し、有効なら直近3日分を同期、無効なら通知する (session-guard.ts)" `
    -Force

Write-Host ""
Write-Host "✓ タスク '$TaskName' を登録しました（3時間ごとに実行）"
Write-Host "  今すぐ試す場合  : Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  状態を見る場合  : Get-ScheduledTaskInfo -TaskName '$TaskName'"
Write-Host "  削除する場合    : Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
