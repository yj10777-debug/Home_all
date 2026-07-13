---
name: asken-cookie-refresh
description: あすけんのセッション切れ時に、通常ブラウザから取得したCookieを secrets/asken-state.json に手動配置して復旧する手順。スクレイピングが「セッション無効」「ログイン失敗」で落ちたとき、autoLogin() が拒否されたときに使う。
---

# あすけんセッションの手動Cookie配置

2026-07 のあすけんサイト刷新以降、Playwright/Puppeteer 経由の新規ログインは自動化検出で拒否される（詳細は CLAUDE.md「あすけんBot対策」参照）。既存の有効なセッションCookieの再利用は問題なく通るため、セッション切れ時は以下の手順で復旧する。

## 完全自動にできない理由

- **新規ログインの自動化が不可**: あすけんのBot対策により、Playwright/Puppeteer からの自動ログインPOSTは
  ほぼ確実に拒否される（stealthプラグイン・実Chromeバイナリ・人間らしい操作の模倣を組み合わせても不可）。
  CDP（DevTools Protocol）経由の自動操作そのものを検知している可能性が高い。
- **OS の暗号化Cookieストアを直接復号する方式は不可**: Chrome等のローカル暗号化Cookieストアを直接読む
  実装は、認証情報ストアへのアクセスを禁じる安全ガードの対象のため実装しない（今後も実装しない）。

そのため「唯一動く方法」は、**通常ブラウザで人間が手動ログインし、そのセッションCookieを
Playwrightへ持ち込んで閲覧のみ行う**運用に限られる。以下はこの制約の中で、手動作業を
「Cookieヘッダをコピー → 1コマンド実行」まで削ぎ落とし、失効検知と本番反映を自動化したものである。

## 現実的な運用（このプロジェクトでの自動化範囲）

1. **Chromeにログイン状態を保つ**（「次回から自動的にログイン」推奨。手動操作はここだけ）
2. **失効時に通知**: `scripts/asken/session-guard.ts` を Windows タスクスケジューラで定期実行
   （`scripts/asken/setup-schedule.ps1` で3時間ごとに登録）。セッションが有効なら直近3日分を自動同期し、
   無効ならWindowsデスクトップ通知（またはフォールバックのポップアップ）を出す
3. **ワンコマンドで更新**: 通知が来たら、あすけんに再ログイン → Cookieヘッダをコピー →
   `npx tsx scripts/asken/import-cookies.ts --clipboard`（クリップボードから直接読み取るため、
   ファイル保存の手間と0バイト事故が無くなる）
4. **自動でRailwayへ反映**: `npx tsx scripts/asken/push-session.ts` でローカルの
   `secrets/asken-state.json` を本番の `POST /api/asken/session` へ送信する。
   本番の揮発FSでも再デプロイ無しでセッションを更新できる

## クリップボード直接取り込み（推奨・最速）

```bash
# 1. あすけんに手動ログイン → F12 → Network → document リクエストの Cookie ヘッダをコピー
# 2. コピーした直後に実行（ファイル保存不要）
npx tsx scripts/asken/import-cookies.ts --clipboard

# 3. 検証
npx tsx scripts/asken/check-login.ts

# 4. Railway本番へ反映（.env.local に CRON_SECRET / APP_BASE_URL が必要）
npx tsx scripts/asken/push-session.ts
```

`--clipboard` は Windows (`Get-Clipboard`) / macOS (`pbpaste`) / Linux (`xclip`/`xsel`) に対応する
クロスプラットフォーム実装。従来のファイルパス指定（`import-cookies.ts <path>`）も引き続き使える。

## 失効の定期監視（Windows タスクスケジューラ）

初回のみ、以下を1回実行してタスクを登録する（登録するだけで、実行はスケジューラに任される）:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/asken/setup-schedule.ps1
```

タスク名 `AskenSessionGuard` が3時間ごとに `npx tsx scripts/asken/session-guard.ts` を実行し、
セッション有効なら直近3日分を同期、無効ならデスクトップ通知（BurntToast → MessageBox → `msg` コマンドの順に
フォールバック）を出す。通知文言・ログ・APIレスポンスのいずれにもCookie値やパスワードは一切含めない。

## （参考・任意）上級者向け: CDP接続による全自動化の雛形

以下は実装必須ではなく、興味があれば試せる参考手順。専用のChromeプロファイルに人間が一度だけ手動ログインし、
以降はそのプロファイルへ CDP 接続してCookieを読み出すことで、ブラウザ再起動さえ挟めば
「手動ログイン」の頻度をさらに減らせる可能性がある（Bot対策が閲覧セッションの継続自体は妨げないため）。

```bash
# 1. 専用プロファイルでリモートデバッグ有効化したChromeを起動（初回のみ手動ログイン）
"C:\Program Files\Google\Chrome\Application\chrome.exe" ^
  --user-data-dir="C:\dev\projects\nutrition-app\.chrome-asken-profile" ^
  --remote-debugging-port=9222

# 2. このプロファイルで https://www.asken.jp/login に手動ログインし、そのまま閉じずに常駐させる

# 3. 別プロセス（Node）からCDP経由でCookieを取得し asken-state.json に変換する雛形:
#    - playwright.chromium.connectOverCDP('http://localhost:9222') で接続
#    - context.cookies() で asken.jp のCookieを取得
#    - src/lib/askenCookies.ts の buildStorageState() / writeStorageState() で書き出す
```

**注意点（未実装・要検証）**: 9222番ポートを開けたままにするとローカルの他プロセスからも
CDP接続できてしまうため、共有PCや常時起動サーバーでは避けること。また、このプロファイルの
Chromeプロセスを起動しっぱなしにする運用コストと、Bot対策側が将来この経路も検知してくる
可能性の両方を踏まえ、現時点では手動Cookie貼り付け運用（上記）を正とする。

## 手順（推奨: import-cookies.ts を使う）

**重要**: Cookie は「認証が生きている状態」で取得すること。少しでも古いと弾かれる（あすけんは
セッションを更新するため、失効間際の値は再利用できない）。ログイン直後に手早く取得する。

1. **普段使いの通常ブラウザ**（自動化ツールを経由しないブラウザ）で `https://www.asken.jp/login` から
   **メール+パスワードで手動ログイン**する（「次回から自動的にログイン」にチェック推奨）
2. ログイン済みのまま `https://www.asken.jp/wsp/comment/YYYY-MM-DD` を開き、**食事記録が表示されること**を確認
   （表示される = 認証が生きている状態）
3. **F12 → Network → F5（再読込）→ 一覧最上部の `YYYY-MM-DD`（document）をクリック →
   Request Headers の `Cookie:` の値をコピー**
4. コピーした値をファイルに保存し（例: `secrets/asken-cookies-export.txt`）、変換スクリプトを実行:

   ```bash
   npx tsx scripts/asken/import-cookies.ts secrets/asken-cookies-export.txt
   ```

   - このスクリプトは **生の Cookie ヘッダ / 「Copy as cURL」の出力 / Cookie-Editor の JSON** のいずれも
     受け付け、`secrets/asken-state.json`（Playwright storageState 形式）へ自動変換・配置する
   - Cookie 値は標準出力に出さない（Cookie 名と件数のみ表示）。認証に必要な `PSID_0` /
     `ASKEN_PORTAL_AUTO` が含まれていれば OK
   - 取得後は **あすけんのタブを再読込しない**（セッションを新鮮なまま渡すため）
5. 検証: `npx tsx scripts/asken/check-login.ts [YYYY-MM-DD]`（成功なら `✓ セッション有効`）
6. 欠落データのバックフィル: `npx tsx scripts/sync-range.ts <from> <to>`（各日をスクレイプし DB へ upsert）
7. 本番 (Railway) へ反映: `npx tsx scripts/asken/push-session.ts`（推奨。再デプロイ不要）。
   揮発FSのため、手動で再デプロイした場合や push-session を使わない場合は同じ `secrets/asken-state.json` を
   都度配置し直す必要がある（Railway ボリュームで `secrets/` を永続化すれば回避可能）

## 手動変換（import-cookies.ts が使えない場合のみ）

`storageState` 形式（`{ "cookies": [ { name, value, domain, path, expires(UNIX秒),
httpOnly, secure, sameSite("Strict"/"Lax"/"None") }, ... ], "origins": [] }`）を直接書いて
`secrets/asken-state.json` に配置してもよい。

## トラブルシューティング

- **保存ファイルが 0 バイト**: 貼り付け前に保存した／別名で保存された可能性。`secrets/` 内の
  最近更新ファイルを確認する
- **有効な値なのに弾かれる**: 取得時点で既にセッションが古い。手動再ログイン直後にやり直す。
  素の HTTP でも Playwright でも同じ Cookie が弾かれる場合、原因は Cookie ではなくセッション失効
- セッションの有効期限判定は `login.ts` の `isSessionLikelyValid()`（30日）だが、実際の有効性は
  `run.ts` の `verifySession()` が実アクセスで検証する。連続実行（複数日スクレイプ）でも
  同一 `asken-state.json` のセッションは持続する
- ログイン成否のデバッグ: `secrets/login-success.png` / `secrets/login-failed.png` を確認
