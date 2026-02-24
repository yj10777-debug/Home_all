/**
 * Prisma 7: 接続 URL の指定（Docker 等で .ts が読めない環境用の CommonJS 版）
 * ビルド時は DATABASE_URL を環境変数で渡すこと。
 */
require("dotenv").config();

module.exports = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
