#!/bin/bash
# Install (or remove with --uninstall) a launchd job that runs refresh-showtimes.sh every morning.
#   npm run showtimes:install-mac
#   npm run showtimes:install-mac -- --uninstall
set -euo pipefail

LABEL="vn.moithuy.showtimes"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/moi-thuy-showtimes.log"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/refresh-showtimes.sh"
HOUR="${SHOWTIMES_HOUR:-6}"
MINUTE="${SHOWTIMES_MINUTE:-7}"

[ "$(uname)" = "Darwin" ] || { echo "This installer is for macOS."; exit 1; }

# macOS privacy protection (TCC) blocks background jobs from reading Desktop, Documents and Downloads,
# so the job would fail with "Operation not permitted". Ask to move the repo instead of granting bash Full Disk Access.
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
case "$REPO" in
  "$HOME/Desktop"* | "$HOME/Documents"* | "$HOME/Downloads"*)
    if [ "${1:-}" != "--uninstall" ]; then
      echo "The repo is in $REPO."
      echo "macOS doesn't let background jobs read Desktop/Documents/Downloads. Move it first, e.g.:"
      echo "  mkdir -p ~/Projects && mv \"$REPO\" ~/Projects/ && cd ~/Projects/$(basename "$REPO") && npm run showtimes:install-mac"
      exit 1
    fi
    ;;
esac

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST"
  echo "Removed $LABEL."
  exit 0
fi

chmod +x "$SCRIPT"
mkdir -p "$(dirname "$PLIST")" "$(dirname "$LOG")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SCRIPT</string></array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>$HOUR</integer><key>Minute</key><integer>$MINUTE</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL: runs every day at $(printf '%02d:%02d' "$HOUR" "$MINUTE") (or when the Mac wakes up after that)."
echo "Log:      $LOG"
echo "Run now:  launchctl kickstart gui/$(id -u)/$LABEL"
echo "Remove:   npm run showtimes:install-mac -- --uninstall"
