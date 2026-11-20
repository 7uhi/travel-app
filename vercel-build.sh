#!/bin/sh
# Vercel's build command (see vercel.json). Production builds apply pending
# migrations first, so a deployment never goes live ahead of its schema. They
# use a direct connection: Prisma Migrate doesn't work through a
# transaction-mode pooler. Preview builds leave the database alone.
set -e

if [ "$VERCEL_ENV" = "production" ]; then
  # The privacy policy and terms name this address for data requests.
  : "${CONTACT_EMAIL:?Set CONTACT_EMAIL to the public address for privacy and terms questions}"
  DATABASE_URL="${DIRECT_DATABASE_URL:?Set DIRECT_DATABASE_URL to the direct (non-pooled) database connection string}" \
    npx prisma migrate deploy
fi

npm run build
