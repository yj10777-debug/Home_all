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

Set `SUPABASE_JWT_SECRET` in `.env.local` (from Supabase → Project Settings → API → JWT Secret) for JWT verification.

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
