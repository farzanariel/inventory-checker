#!/usr/bin/env bash
# Poll origin/main and run the normal health-gated deploy when a new commit lands.

set -euo pipefail

cd "$(dirname "$0")/.."

REMOTE="${DEPLOY_REMOTE:-origin}"
BRANCH="${DEPLOY_BRANCH:-main}"
INTERVAL_SECS="${DEPLOY_POLL_INTERVAL_SECS:-30}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/inventory-checker-deploy.lock}"

mkdir -p logs

echo "[auto-deploy] watching ${REMOTE}/${BRANCH} every ${INTERVAL_SECS}s"

while :; do
  remote_sha=""
  if remote_sha="$(git ls-remote --heads "$REMOTE" "$BRANCH" | awk '{print $1}')"; then
    local_sha="$(git rev-parse HEAD)"

    if [[ -n "$remote_sha" && "$remote_sha" != "$local_sha" ]]; then
      echo "[auto-deploy] new commit detected: ${local_sha} -> ${remote_sha}"
      if (
        flock -n 9 || exit 75
        ./scripts/deploy.sh
      ) 9>"$LOCK_FILE"; then
        echo "[auto-deploy] deploy complete"
      else
        status=$?
        if [[ "$status" -eq 75 ]]; then
          echo "[auto-deploy] deploy already running; skipping this tick"
        else
          echo "[auto-deploy] deploy failed with exit ${status}" >&2
        fi
      fi
    fi
  else
    echo "[auto-deploy] unable to read ${REMOTE}/${BRANCH}" >&2
  fi

  sleep "$INTERVAL_SECS"
done
