#!/usr/bin/env bash
set -euo pipefail

PORT="${CDP_PORT:-9333}"
PROFILE_DIR="${PROJECT_CHROME_PROFILE:-$PWD/.project-chrome-profile}"
CHROME_EXE="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
LOG_FILE="${PROJECT_CHROME_LOG:-$PROFILE_DIR/chrome.log}"
VERSION_URL="http://127.0.0.1:${PORT}/json/version"

if [[ ! -x "$CHROME_EXE" ]]; then
  echo "Chrome not found: $CHROME_EXE" >&2
  echo "Set CHROME_BIN to the Chrome executable path." >&2
  exit 1
fi

if curl -fsS --max-time 2 "$VERSION_URL" >/dev/null 2>&1; then
  echo "Project Chrome is already available at $VERSION_URL"
  exit 0
fi

mkdir -p "$PROFILE_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

nohup "$CHROME_EXE" \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$PORT" \
  --user-data-dir="$PROFILE_DIR" \
  --new-window \
  "https://www.tiktok.com/en/" \
  "https://x.com/" \
  "https://www.youtube.com/" \
  "https://www.reddit.com/" \
  >"$LOG_FILE" 2>&1 </dev/null &

CHROME_PID=$!
for _ in {1..20}; do
  if curl -fsS --max-time 1 "$VERSION_URL" >/dev/null 2>&1; then
    echo "Project Chrome is ready (pid $CHROME_PID)"
    echo "Playwright endpoint: $VERSION_URL"
    echo "Profile: $PROFILE_DIR"
    exit 0
  fi
  sleep 0.25
done

echo "Chrome started but CDP endpoint is not ready: $VERSION_URL" >&2
echo "See log: $LOG_FILE" >&2
exit 1
