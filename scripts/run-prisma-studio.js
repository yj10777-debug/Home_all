/**
 * .env / .env.local を読み込んでから Prisma Studio を起動する。
 * Prisma CLI は .env しか読まないため、.env.local の DATABASE_URL を使うためのラッパー。
 * URL を --url で明示渡しし、子プロセスへの env 継承に依存しない。
 */
const path = require("path");
const { spawn } = require("child_process");

const root = path.resolve(__dirname, "..");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(root, ".env") });
dotenv.config({ path: path.join(root, ".env.local") });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Error: DATABASE_URL is not set. Set it in .env or .env.local");
  process.exit(1);
}

// 子プロセスに確実に渡す（Windows で env 継承が効かない場合の対策）
const childEnv = { ...process.env, DATABASE_URL: url };

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const child = spawn(process.execPath, [prismaCli, "studio", "--url", url], {
  stdio: "inherit",
  cwd: root,
  env: childEnv,
});

child.on("exit", (code) => process.exit(code ?? 0));
