#!/bin/bash
# Loads the packed extension in a headless GNOME Shell and checks that it
# enables, writes saved-state on disable, and clears it on re-enable. It does
# not check the restored countdown or any menu behavior.
#
# Every directory, including dconf's, points into a temporary home. The
# variables are exported before dbus-run-session starts so that D-Bus-activated
# services such as dconf inherit them and never touch your real settings.
set -euo pipefail

zip=$1
uuid=movement-breaks@codebymarshall.github.io
schema=org.gnome.shell.extensions.movement-breaks

if [[ ${MB_INSIDE:-} != 1 ]]; then
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/movement-breaks-check.XXXXXX")
  mkdir -p "$tmp"/{home,data,config,cache}
  export HOME=$tmp/home XDG_DATA_HOME=$tmp/data XDG_CONFIG_HOME=$tmp/config XDG_CACHE_HOME=$tmp/cache
  export MB_INSIDE=1 MB_TMP=$tmp
  status=0
  timeout 120 dbus-run-session -- "$0" "$(realpath "$zip")" >"$tmp/session.log" 2>&1 || status=$?
  grep '^check:' "$tmp/session.log" || true
  # A JS error's stack trace names this extension's files on the lines after it.
  if cat "$tmp/shell.log" "$tmp/session.log" | grep -A4 -E 'JS (ERROR|WARNING)' | grep -F "$uuid"; then
    echo "check: FAIL, JavaScript errors. Logs are in $tmp"
    exit 1
  fi
  if [[ $status -ne 0 ]]; then
    echo "check: FAIL (exit $status). Logs are in $tmp"
    exit "$status"
  fi
  rm -rf "$tmp"
  exit 0
fi

fail() { echo "check: FAIL, $*"; exit 1; }
state() { gnome-extensions info "$uuid" | sed -n 's/^ *State: //p'; }
key() { gsettings --schemadir "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/schemas" "$@"; }

dconf write /movement-breaks-check/probe true
[[ -f $XDG_CONFIG_HOME/dconf/user ]] \
  || fail "dconf is not writing to $XDG_CONFIG_HOME; refusing to continue"

gnome-extensions install --force "$1"
gsettings set org.gnome.shell enabled-extensions "['$uuid']"

gnome-shell --headless --wayland --no-x11 --wayland-display "movement-breaks-check-$$" \
  --virtual-monitor 1280x800 >"$MB_TMP/shell.log" 2>&1 &
shell=$!
trap 'kill $shell 2>/dev/null; wait $shell 2>/dev/null || true' EXIT

for _ in $(seq 1 40); do
  sleep 1
  [[ $(state 2>/dev/null) == ACTIVE ]] && break
done
[[ $(state) == ACTIVE ]] || fail "extension state is $(state), expected ACTIVE"
echo "check: ok, extension is ACTIVE"

key set $schema preset focus-50
sleep 2
gnome-extensions disable "$uuid"
sleep 1
saved=$(key get $schema saved-state)
[[ $saved == *'"preset":"focus-50"'* && $saved == *'"phase":"work"'* ]] \
  || fail "saved-state after disable was $saved"
echo "check: ok, disable saved $saved"

gnome-extensions enable "$uuid"
sleep 2
[[ $(state) == ACTIVE ]] || fail "extension state after re-enable is $(state)"
echo "check: ok, re-enabled"
saved=$(key get $schema saved-state)
[[ $saved == "''" ]] || fail "saved-state after re-enable was $saved, expected it cleared"
echo "check: ok, enable cleared saved-state"
