#!/bin/sh
set -eu
cd /app/apps/backend
export PATH="/app/node_modules/.bin:${PATH}"
prisma migrate deploy
exec node dist/index.js
