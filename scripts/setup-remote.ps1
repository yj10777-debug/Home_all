# リモートを追加して初回 push するスクリプト
# 使い方: .\scripts\setup-remote.ps1 -RepoUrl "https://github.com/<ユーザー名>/nutrition-app.git"
# または: .\scripts\setup-remote.ps1 -RepoUrl "git@github.com:<ユーザー名>/nutrition-app.git"

param(
    [Parameter(Mandatory = $true)]
    [string]$RepoUrl
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (git remote get-url origin 2>$null) {
    Write-Host "リモート origin は既に登録されています。"
    git remote -v
    exit 1
}

git remote add origin $RepoUrl
Write-Host "origin を追加しました: $RepoUrl"
git remote -v
Write-Host ""
Write-Host "初回 push しますか? ブランチは master です。"
$branch = (git branch --show-current)
git push -u origin $branch
Write-Host "完了しました。"
