# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## コマンド早見表

```bash
npm run dev          # 開発サーバー起動 (localhost:3000)
npm run build        # Next.js ビルド
npm test             # Jest テスト（--runInBand で直列実行）
npm run test:watch   # ウォッチモード
npm run lint         # ESLint
npm run db           # Prisma Studio 起動
npx prisma migrate dev --name <name>    # マイグレーション作成
npx prisma migrate deploy               # マイグレーション適用（本番用）
npx prisma generate                     # Prisma Client 再生成

# あすけんスクレイピングを手動実行（PowerShell）
$env:HEADLESS="true"; npx tsx scripts/asken/run.ts YYYY-MM-DD
```

## アーキテクチャ概要

### スタック
- **Next.js 16** (Pages Router) + **TypeScript** + **Tailwind CSS v4**
- **Prisma 7** + **PostgreSQL**（接続設定は `prisma.config.cjs` で `DATABASE_URL` を参照）
- **Railway** でホスティング。`start.sh` が起動時に `prisma migrate deploy` → Next.js サーバー → cron スケジューラーの順で起動する

### データフロー

```
あすけん (Web scraping)
  └─ scripts/asken/run.ts          ← Playwright で食事データをスクレイピング
       ├─ login.ts                  ← セッション管理 (secrets/asken-state.json)
       ├─ scrapeDay.ts              ← カロリー・食材取得
       └─ scrapeAdvice.ts          ← 栄養素詳細取得

src/lib/sources/asken.ts           ← 上記を子プロセス(spawn)で実行し結果を返す
src/lib/syncData.ts                ← あすけん + Strong を統合して DailyData に upsert
src/pages/api/sync/index.ts        ← POST /api/sync （手動同期）
scripts/cron-sync.ts               ← 定期実行（デフォルト: 9,11,13,16,19,21,22,23時）
```

Strong (筋トレ) データは Google Drive 経由でTXTをパースして取り込む（`src/lib/sources/strong.ts`）。

### DB スキーマの要点（prisma/schema.prisma）

| テーブル | 役割 |
|---|---|
| `DailyData` | 1日1レコード。あすけん食事・栄養素・歩数・Strong筋トレ・登山フラグをまとめて保存 |
| `ScrapingLog` | スクレイピング実行ログ（成否・エラー詳細）。`/api/sync/logs` で取得可能 |
| `SyncLog` | 最終同期時刻と集計結果（id=1 の単一レコード） |
| `AiEvaluation` | Gemini によるAI食事評価の履歴 |
| `UserConfig` | ユーザーごとの目標値・パーソナル情報・AIプロンプト |
| `MealLog` / `MealItem` | 手動入力の食事ログ（あすけん連携とは別） |

### セキュリティ：Row Level Security (RLS)

`public` スキーマの全テーブルは **RLS 有効化済み**（migration `20260528000000_enable_rls`）。
Prisma は `postgres` ロール（BYPASSRLS）で接続するためアプリ動作には影響しないが、
Supabase PostgREST API（anon / authenticated キー）からのアクセスは全拒否される。

**新規テーブルを追加する際の必須手順:**

`prisma migrate dev --name <name>` で生成された `migration.sql` の末尾に、
作成した各テーブルへの RLS 有効化文を必ず追記する：

```sql
-- CreateTable（Prisma が自動生成）
CREATE TABLE "NewTable" ( ... );

-- 手動追記（必須）
ALTER TABLE "NewTable" ENABLE ROW LEVEL SECURITY;
```

追記を忘れると Supabase Security Advisor から週次で
「Action required: security vulnerabilities detected」メールが届く。
クライアント側で `supabase-js` を使い始める時は、別途 `CREATE POLICY ...` を
追加すること（現状は使っていないので不要）。

### Playwright (あすけんスクレイピング) の注意点

- **Bot検出回避のため** `--disable-blink-features=AutomationControlled` + カスタム UserAgent + `navigator.webdriver` 非表示を設定済み（`login.ts` / `run.ts`）
- `.env.local` は `dotenv({ quiet: true })` で明示的にロード（`npx tsx` は自動ロードしない）。`quiet: true` は必須 — 省くと stdout に dotenv のログが混入し、親プロセス（`asken.ts`）の JSON パースが壊れる
- **本番環境 (Railway)**: `secrets/asken-state.json`（セッションファイル）は揮発FSのため毎デプロイで消える → 同期のたびに自動ログインが走る仕様
- ブラウザバイナリは **builderステージでインストール → runnerステージにコピー** する構成（`PLAYWRIGHT_BROWSERS_PATH=/app/playwright-browsers`）。runner で `npm install` するとバージョンがずれるため、runner で playwright install を実行してはいけない
- ログイン成否のデバッグ: `secrets/login-success.png` / `secrets/login-failed.png` を確認する
- **2026-07 以降、新規の自動ログイン（`autoLogin()`）はあすけん側のBot対策によりほぼ確実に拒否される**（下記「あすけんBot対策」を参照）。`secrets/asken-state.json` が生きている間はスクレイピングは正常に動くが、期限切れ後は手動でのCookie再配置が必要になる場合がある。

### あすけんBot対策（2026-07 サイト刷新以降）

2026-07 のサイト刷新で自動化検出が導入され、**Playwright/Puppeteer 経由の新規ログインは軒並み拒否される**ことを確認済み（`playwright-extra` + `puppeteer-extra-plugin-stealth`、実 Google Chrome バイナリ（`channel: 'chrome'`）、人間らしいマウス移動・タイピング速度を模したスクリプトのいずれを組み合わせても不可）。ログインPOST自体は 302 で「成功したように見える」Cookie（`PSID_0` 等）を発行するが、トップページはログイン前の匿名マーケティングページのまま返され、直後に `/wsp/` へアクセスすると `/login/?to=...` に弾かれる。CDP（DevTools Protocol）経由の自動操作そのものを検知している可能性が高い。

一方、**既存の有効なセッションCookieを Playwright に読み込ませて閲覧するだけ**（ログインPOSTを伴わない通常ページ遷移）は問題なく通る。2026年1〜5月の運用実績もこの方式（`storageState` 再利用）そのもの。したがって恒久対策ではなく、以下のフォールバック運用とする。

**セッション切れ時の対処**: 手動Cookie配置の手順は `asken-cookie-refresh` スキル（`.claude/skills/asken-cookie-refresh/SKILL.md`）を参照。

### APIエンドポイント構造

```
/api/sync/index    POST  手動同期（あすけん + Strong）
/api/sync/cron     POST  cron用同期（CRON_SECRET認証）
/api/sync/status   GET   最終同期状態・エラー確認
/api/sync/logs     GET   ScrapingLog一覧（?limit=50）← デバッグ用
/api/day/[date]    GET   1日の詳細データ
/api/ai/evaluate   POST  Gemini AI評価実行
/api/ai/daily      GET   日次AI評価取得
/api/ai/weekly     GET   週次AI評価取得
```

### 環境変数（.env.local）

必須: `DATABASE_URL`, `ASKEN_EMAIL`, `ASKEN_PASSWORD`  
AI機能: `GEMINI_API_KEY`  
Google連携: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_STRONG_FOLDER_ID`  
ヘルスケア連携 (任意・Google Fit API は 2026-06-30 終了済みのため drive を推奨):
- `HEALTH_SOURCE` = `drive` (推奨) | `fit` （終了済み。指定した場合も動作はするが警告ログが出る）
- `GOOGLE_DRIVE_HEALTH_FOLDER_ID`: Health Auto Export が JSON を保存する Drive フォルダ ID（HEALTH_SOURCE=drive のとき必須）

本番必須: `SUPABASE_JWT_SECRET`（JWT検証用。未設定だと認証が常に失敗するフェイルクローズ仕様）, `CRON_SECRET`（未設定だと `/api/sync/cron` が 500 を返す）  
本番: `CRON_SCHEDULE`  
本番推奨: `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` — 両方設定するとアプリ全体（ページ・API）にBasic認証がかかる（`src/proxy.ts`）。未設定なら無効。機械アクセス（session-guard / push-session 等）は `x-cron-secret` ヘッダが `CRON_SECRET` と一致すれば免除される。JWT保護は meals 系のみで、`/api/sync` や `/api/settings/system-prompt`・データ閲覧系は素の状態では無認証のため、本番URLを公開範囲に置く場合は必ず設定すること。

### ヘルスケアデータ取り込みの構成

```
syncData.ts
  └─ sources/appleHealth.ts          ← 抽象データソース（HEALTH_SOURCE で切替）
       ├─ googleFit.ts               ← Google Fitness REST API (2026-06-30 終了済み)
       └─ healthAutoExport.ts        ← Drive 上の Health Auto Export JSON (現行の取得元)
```

- Google Fit API は 2026-06-30 に完全終了済み。iOS「Health Auto Export」アプリで
  Apple Health データを Drive に定期エクスポートし、`HEALTH_SOURCE=drive`（推奨・既定運用）を使用する。
- `HEALTH_SOURCE` 未設定時は、Drive 側の設定（`GOOGLE_DRIVE_HEALTH_FOLDER_ID` 等）があれば
  自動的に drive を使用する（`selectSource()` の自動判定）。`HEALTH_SOURCE=fit` を明示指定、
  またはどちらも未設定で Drive 未設定の場合は fit にフォールバックするが、Fit API は既に
  終了済みのため `console.warn` で移行を促す警告が出る。fit 経路は互換のため残置しているのみで、
  新規セットアップでは必ず `HEALTH_SOURCE=drive` を設定すること。
- スコープ再取得スクリプト: `npx tsx scripts/google-auth.ts`（fitness.* スコープは Fit API 終了に伴い削除済み。
  drive.readonly と calendar 系のみ取得する）
- 過去日一括取得: `npx tsx scripts/backfill-fit.ts [from] [to]`

### スコアリング・AI評価

`src/lib/scoring.ts` が栄養バランスを数値化。`src/lib/aiEvaluator.ts` が Gemini に評価を依頼し `AiEvaluation` テーブルに保存する。食事・筋トレ・登山のいずれも記録がない日は「未記録日」として週平均計算から除外される。

