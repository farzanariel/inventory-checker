#!/usr/bin/env bash
# Cron-driven auto-deploy. Fetches origin, runs deploy.sh only if main has
# advanced. Wrapped in flock so overlapping cron ticks can't double-deploy.
# All output goes to logs/auto-deploy.log; cron stays quiet on no-op runs.
#
# Install:  (crontab -l 2>/dev/null; echo '* * * * * /root/inventory-checker/scripts/auto-deploy.sh') | crontab -

set -euo pipefail

cd "$(dirname "$0")/.."

LOG=logs/auto-deploy.log
LOCK=logs/auto-deploy.lock

exec >>"$LOG" 2>&1

# Drop overlapping ticks rather than queue them.
exec 9>"$LOCK"
if ! flock -n 9; then
  exit 0
fi

ts() { date -Is; }

git fetch --quiet origin main

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

if [[ "$LOCAL" == "$REMOTE" ]]; then
  exit 0
fi

echo "[$(ts)] new commits on origin/main: $LOCAL -> $REMOTE; deploying"

if scripts/deploy.sh; then
  echo "[$(ts)] deploy ok ($(git rev-parse --short HEAD))"
else
  echo "[$(ts)] deploy FAILED (exit $?)" >&2
  exit 1
fi
