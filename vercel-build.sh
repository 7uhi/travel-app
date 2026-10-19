#!/bin/sh
# Vercel's build command (see vercel.json). Production builds apply pending
# migrations first, so a deployment never goes live ahead of its schema. They
# use a direct connection: Prisma Migrate doesn't work through a
# transaction-mode pooler. Preview builds leave the database alone.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  DATABASE_URL="${DIRECT_DATABASE_URL:?Set DIRECT_DATABASE_URL to the database's direct (non-pooled) connection string}" \
    npx prisma migrate deploy
fi

npm run build
