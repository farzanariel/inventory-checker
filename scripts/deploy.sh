#!/usr/bin/env bash
# Health-gated deploy for inventory-checker.
# Usage: scripts/deploy.sh [--skip-build]
#
# Pulls, installs, builds, reloads pm2, and waits for /api/health to return 200
# before declaring success. If the app does not come up healthy within the
# timeout, the script exits non-zero so the operator notices.
#
# Note on user-visible 502s: with pm2 fork mode the reload window is ~1-3s.
# The Traefik/Cloudflare Tunnel layer in front retries briefly; this script
# does not eliminate that window, but it guarantees we don't walk away from a
# crash-looping deploy.

set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

HEALTH_URL="http://127.0.0.1:3002/api/health"
TIMEOUT_SECS=60

echo "[deploy] git pull"
git pull --ff-only

echo "[deploy] npm install"
npm install --no-audit --no-fund

echo "[deploy] db migrate"
npm run db:migrate

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "[deploy] next build"
  npm run build
fi

echo "[deploy] reload app + worker"
pm2 startOrReload ecosystem.config.cjs --only inventory-app --update-env
pm2 startOrReload ecosystem.config.cjs --only inventory-worker --update-env

echo "[deploy] waiting for ${HEALTH_URL} (timeout ${TIMEOUT_SECS}s)"
deadline=$(( $(date +%s) + TIMEOUT_SECS ))
while :; do
  if curl -fsS --max-time 3 -o /dev/null "$HEALTH_URL"; then
    echo "[deploy] healthy"
    break
  fi
  if (( $(date +%s) >= deadline )); then
    echo "[deploy] FAILED: health check did not pass within ${TIMEOUT_SECS}s" >&2
    pm2 list >&2 || true
    tail -n 60 logs/app.err.log >&2 || true
    exit 1
  fi
  sleep 2
done

# Read pm2 restart count after a 10s soak; if it climbs we're in a crash loop.
sleep 10
pm2 jlist | node -e '
const apps = JSON.parse(require("fs").readFileSync(0, "utf8"));
const app = apps.find(a => a.name === "inventory-app");
if (!app) { console.error("[deploy] inventory-app not in pm2 list"); process.exit(1); }
const restarts = app.pm2_env.restart_time;
const uptimeMs = Date.now() - app.pm2_env.pm_uptime;
console.log(`[deploy] post-soak: restarts=${restarts} uptime=${Math.round(uptimeMs/1000)}s`);
if (uptimeMs < 8000) {
  console.error("[deploy] FAILED: process restarted during 10s soak — crash loop suspected");
  process.exit(1);
}
'

echo "[deploy] done"
