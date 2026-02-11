#!/bin/sh
echo "=== Running Prisma migrations ==="
npx prisma migrate deploy || echo "WARNING: Prisma migrate failed, continuing..."
echo "=== Starting Next.js server on 0.0.0.0:${PORT:-3000} ==="
export HOSTNAME="0.0.0.0"
export PORT="${PORT:-3000}"
exec node server.js
