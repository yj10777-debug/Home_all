# ─── Stage 1: 依存関係インストール ─────────────────
FROM node:20-slim AS deps

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: ビルド ──────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y \
    openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Prisma Client 生成
RUN npx prisma generate

# Next.js ビルド
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ─── Stage 3: 本番実行 ─────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

# Playwright Chromium + 実行に必要なシステムライブラリ
RUN apt-get update && apt-get install -y \
    openssl \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    wget \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

# 本番用ファイルのコピー
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# スクレイピングスクリプト + Playwright
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder /app/node_modules/playwright-core ./node_modules/playwright-core
COPY --from=builder /app/package.json ./package.json

# tsx (TypeScriptランタイム) を本番用にインストール
RUN npm install --no-save tsx

# Playwright ブラウザをインストール（chromium のみ）
RUN npx playwright install chromium

# secrets ディレクトリ作成（セッションファイル用）
RUN mkdir -p /app/secrets

# 起動スクリプト
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 3000

CMD ["sh", "/app/start.sh"]
