#!/usr/bin/env bash
#
# Install customfan as a launchd LaunchAgent so the daemon starts at login.
#
# Deliberately user-level, not system-level:
#   * ~/Library/LaunchAgents, not /Library/LaunchAgents
#   * runs as you, never as root
#   * needs no sudo at any point
#
# A background process that can kill other processes has no business running
# with elevated privileges. Uninstall with ./install.sh --uninstall
#
set -euo pipefail

LABEL="com.customfan.daemon"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAEMON_DIR="$ROOT/daemon"
LOG_DIR="$ROOT/daemon/data"

if [[ "${1:-}" == "--uninstall" ]]; then
  echo "Removing $LABEL..."
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Done. customfan will no longer start at login."
  exit 0
fi

# Resolve the real node binary. launchd starts with a minimal PATH that does
# not include nvm/homebrew shims, so a bare "node" would fail at login with a
# confusing "command not found" and no obvious cause.
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then
  echo "error: node not found on PATH. Install Node, then re-run." >&2
  exit 1
fi

if [[ ! -d "$DAEMON_DIR/node_modules" ]]; then
  echo "Installing daemon dependencies..."
  (cd "$DAEMON_DIR" && npm install)
fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

echo "Writing $PLIST"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>

    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>$DAEMON_DIR/node_modules/.bin/tsx</string>
        <string>$DAEMON_DIR/src/index.ts</string>
    </array>

    <key>WorkingDirectory</key>
    <string>$DAEMON_DIR</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <!-- Never let a monitoring tool become the thing that slows the machine. -->
    <key>ProcessType</key>
    <string>Background</string>
    <key>Nice</key>
    <integer>5</integer>

    <key>StandardOutPath</key>
    <string>$LOG_DIR/daemon.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/daemon.error.log</string>
</dict>
</plist>
PLIST_EOF

# bootout first so re-running install.sh cleanly replaces an older version.
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo
echo "customfan installed and running."
echo
echo "  status:     launchctl print gui/$(id -u)/$LABEL | head -20"
echo "  logs:       tail -f $LOG_DIR/daemon.log"
echo "  health:     curl -s localhost:4310/health"
echo "  dashboard:  cd dashboard && npm run dev   →  localhost:4311"
echo "  uninstall:  ./install.sh --uninstall"
echo
echo "The watchdog is in observe-only mode. It will not kill anything until"
echo "you set killEnabled + disable dryRun in daemon/customfan.config.json."
