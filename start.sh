#!/bin/sh
echo "=== Running Prisma migrations ==="
npx prisma migrate deploy || echo "WARNING: Prisma migrate failed, continuing..."

echo "=== Starting Next.js server on 0.0.0.0:${PORT:-3000} ==="
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-3000}"

# Next.js サーバーをバックグラウンドで起動
node server.js &
SERVER_PID=$!

# サーバーの起動を待つ（最大30秒）
echo "=== Waiting for server to be ready... ==="
for i in $(seq 1 30); do
  if wget -q --spider "http://localhost:${PORT}/api/sync/status" 2>/dev/null; then
    echo "=== Server is ready ==="
    break
  fi
  sleep 1
done

# cron スケジューラーをバックグラウンドで起動
echo "=== Starting cron scheduler ==="
npx tsx scripts/cron-sync.ts &
CRON_PID=$!

echo "=== All processes started (server: $SERVER_PID, cron: $CRON_PID) ==="

# メインプロセスとしてサーバーを待つ
wait $SERVER_PID
