/**
 * Prisma 7 以降: 接続 URL はスキーマではなくこのファイルで指定する。
 * ビルド・マイグレーション・Studio で使用される。
 */
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
