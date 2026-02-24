This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

### API: `/api/meals`

- **GET** `/api/meals?date=YYYY-MM-DD` — List meal logs for the date (default: today). Require `Authorization: Bearer <JWT>`.
- **POST** `/api/meals` — Create a meal log with items. Body: `{ mealLog: { loggedAt, mealType, ... }, items: [ { name, cal, ... } ] }`.
- **DELETE** `/api/meals/:id` — Delete a meal log (ownership checked via JWT).

### 環境変数

プロジェクトルートに `.env` を作成し、以下を設定してください。`.env.example` をコピーして編集すると便利です。

- **DATABASE_URL**（必須）— Prisma / DB 接続用。例: `postgresql://USER:PASSWORD@localhost:5432/nutrition?schema=public`  
  - 未設定だと `npm run db`（Prisma Studio）やマイグレーションが失敗します。
- **SUPABASE_JWT_SECRET** — JWT 検証用（Supabase → Project Settings → API → JWT Secret）。`.env.local` でも可。

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

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

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
