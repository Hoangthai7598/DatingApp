#!/bin/bash
# Fetch showtimes from this Mac (Vietnamese IP; CGV/Lotte block GitHub's servers) and push them,
# which triggers a deploy. Run by launchd every morning (see install.sh), or by hand:
#   scripts/mac/refresh-showtimes.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
FILE="public/showtimes.json"
echo "=== $(date '+%Y-%m-%d %H:%M:%S') refresh showtimes in $REPO"

# launchd starts with a bare PATH: add Homebrew and nvm's Node.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null
  nvm use >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi
command -v node >/dev/null || { echo "node not found on PATH"; exit 1; }

# Don't touch a working tree with other changes in progress.
if ! git diff --quiet -- . ":(exclude)$FILE" || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes besides $FILE; skipping (commit or stash them first)."
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
  echo "On branch $BRANCH, not main; skipping."
  exit 0
fi

git pull --rebase --autostash --quiet origin main
[ -d node_modules ] || npm ci --silent

# --strict: exit non-zero if nothing could be fetched, so we never commit an empty file over good data.
if ! ${SHOWTIMES_CMD:-npm run -s showtimes -- --strict}; then
  echo "Fetching showtimes failed; leaving $FILE as it was."
  git checkout -- "$FILE" 2>/dev/null || true
  exit 1
fi

if git diff --quiet -- "$FILE" && git ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
  echo "No changes in $FILE."
  exit 0
fi

git add "$FILE"
git commit --quiet -m "chore: refresh showtimes"
git push --quiet origin main
echo "Pushed new showtimes."
