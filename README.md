あすけん・Strong・ヘルスケアデータを統合する個人向け栄養管理アプリです。

## Getting Started

開発サーバーを起動:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開いて確認できます。

### API: `/api/meals`

- **GET** `/api/meals?date=YYYY-MM-DD` — List meal logs for the date (default: today). Require `Authorization: Bearer <JWT>`.
- **POST** `/api/meals` — Create a meal log with items. Body: `{ mealLog: { loggedAt, mealType, ... }, items: [ { name, cal, ... } ] }`.
- **DELETE** `/api/meals/:id` — Delete a meal log (ownership checked via JWT).

### 環境変数

プロジェクトルートに `.env` を作成し、以下を設定してください。`.env.example` をコピーして編集すると便利です。

- **DATABASE_URL**（必須）— Prisma / DB 接続用。例: `postgresql://USER:PASSWORD@localhost:5432/nutrition?schema=public`  
  - 未設定だと `npm run db`（Prisma Studio）やマイグレーションが失敗します。
- **SUPABASE_JWT_SECRET** — JWT 検証用（Supabase → Project Settings → API → JWT Secret）。`.env.local` でも可。**本番では必須**（未設定の場合、認証は常に失敗する）。

**Tests:** `npm test` (Jest; Prisma/auth mocked in `tests/api/meals.test.ts`).

## Repository setup (Git)

リポジトリを 1 から作って管理する手順です。

### 1. GitHub で新規リポジトリを作成

1. [GitHub](https://github.com/new) で **New repository**
2. 名前例: `nutrition-app`、**README 等は追加しない**（空のリポジトリ）
3. 作成後に表示される URL をコピー（HTTPS または SSH）

### 2. ローカルでコミットしてからリモートに push

プロジェクト直下で実行してください。

```powershell
cd c:\dev\projects\nutrition-app

# 未コミットの変更をすべてコミット
git add .
git commit -m "feat: meals API, UI, stats, Asken scripts"

# リモートを追加して push（<リポジトリURL> を 1. の URL に置き換え）
git remote add origin <リポジトリURL>
git push -u origin master
```

ブランチが `main` の場合は `git push -u origin main` にしてください。

**スクリプトで実行する場合:**

```powershell
.\scripts\setup-remote.ps1 -RepoUrl "https://github.com/<ユーザー名>/nutrition-app.git"
```

（リモート追加後にそのまま push まで実行します。事前に `git add .` と `git commit` は済ませてください。）

## Asken Automation

Scripts for automating Asken interaction are located in `scripts/asken/`.

### Setup

1.  **Build Scripts**:
    Since these scripts are not part of the main Next.js app, they are built separately if you wish to run them with Node.js directly.
    ```bash
    npx tsc -p scripts/asken/tsconfig.json
    ```
    This outputs compiled JavaScript to `scripts/asken/dist/`.

2.  **Initial Login**:
    You must log in once manually to save your session state.
    ```bash
    node scripts/asken/dist/login.js
    # Follow the on-screen instructions (browser will open)
    ```
    This creates `secrets/asken-state.json`.

### Scraping

To scrape data for today:
```bash
node scripts/asken/dist/run.js
```
The script will log the target URL and the result items (or errors) to the console.
Failed runs will save `secrets/asken-error.png` and `secrets/asken-error.html` for debugging.

## Google Drive（Strong 同期）

Strong の筋トレデータを Google Drive のフォルダから取得するために OAuth 2.0 を使用しています。

### 環境変数

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — [Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアント ID を作成し、クライアント ID とシークレットを取得して設定
- `GOOGLE_REFRESH_TOKEN` — 下記「再認証」で取得するリフレッシュトークン
- `GOOGLE_DRIVE_STRONG_FOLDER_ID` — Strong の .txt を置いている Drive フォルダの ID
- **Google Calendar（任意）** — AI 評価時に「出社/在宅/休日」を入力に含めます。カレンダーに「出社」と入れた予定がある日を出社日、それ以外の平日を在宅とみなします。同じ `GOOGLE_*` を使用します。`npx tsx scripts/google-auth.ts` はすでに Calendar スコープを含むため、再認証済みトークンでそのまま利用できます。未設定の場合は勤務形態は「データなし」になります。

### トークン期限切れ（invalid_grant）になったとき

`Token has been expired or revoked` や `invalid_grant` が出たら、リフレッシュトークンを再発行する必要があります。

**注意:** 再認証スクリプトを実行するたびに**新しいリフレッシュトークン**が発行され、**古いトークンは無効になる**ことがあります。取得した新しいトークンは**必ずすべての環境**（`.env.local` と本番の Variables）に同じ値で反映してください。片方だけ更新すると、もう片方が古いトークンを使い続けてすぐに invalid_grant になります。

1. `.env.local` に `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を設定する（既に設定済みならそのまま）
2. プロジェクト直下で実行:
   ```bash
   npx tsx scripts/google-auth.ts
   ```
3. 表示された URL をブラウザで開き、Google アカウントで認証する
4. ターミナルに表示された **`GOOGLE_REFRESH_TOKEN=...`** をコピーし、**.env.local と本番（Railway 等）の両方**に設定・更新する
5. 同期（「今すぐ取得」または cron）を再度実行する
