#!/usr/bin/env bash
# Production Radar 2026-09-01 rank recovery — loads Vercel Production env then executes.
# Never prints secret values.
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v vercel >/dev/null 2>&1; then
  VERCEL_BIN=(vercel)
else
  VERCEL_BIN=(npx vercel@latest)
fi

if [[ -n "${RADAR_CRON_SECRET:-}" || -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  exec npx tsx scripts/exec-prod-radar-rank-rebuild-0901.ts
fi

echo '{"mode":"vercel_env_run","environment":"production"}' >&2
exec "${VERCEL_BIN[@]}" env run -e production -- npx tsx scripts/exec-prod-radar-rank-rebuild-0901.ts
