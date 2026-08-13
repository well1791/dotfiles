#!/bin/bash
# librewolf-profile-launch.sh - Launch or focus a LibreWolf profile window.
#
# KDE Wayland (kdotool) aware. Each LibreWolf profile runs as its own
# top-level process ("<binary> -P <profile>"); that process owns the profile
# window (_NET_WM_PID). We locate the LIVE main process for the requested
# profile and focus its window if present, otherwise launch a new instance.
#
# Why not a stored PID file: LibreWolf (Firefox-based) re-execs, so the PID
# captured from `librewolf ... &` dies quickly and the focus path never hits.
# Why not `kdotool search --pid`: kdotool v0.2.1 ignores the pid filter and
# returns unrelated windows, so we scan --class librewolf and match each
# window's own PID via getwindowpid instead.
#
# Usage: librewolf-profile-launch.sh <profile-name>

set -u

KDOTOOL=""
if command -v kdotool >/dev/null 2>&1; then
    KDOTOOL="$(command -v kdotool)"
elif [ -x "$HOME/.local/bin/kdotool" ]; then
    KDOTOOL="$HOME/.local/bin/kdotool"
else
    echo "Error: kdotool not found. Install it for KDE Wayland window management." >&2
    exit 1
fi

PROFILE_NAME="${1:-}"
if [ -z "$PROFILE_NAME" ]; then
    echo "Usage: librewolf-profile-launch.sh <profile-name>" >&2
    echo "Profiles: well, work, games, contabilidad" >&2
    exit 1
fi

case "$PROFILE_NAME" in
    well|work|games|contabilidad) ;;
    *)
        echo "Error: Unknown profile '$PROFILE_NAME'." >&2
        echo "Valid profiles: well, work, games, contabilidad" >&2
        exit 1
        ;;
esac

# Print the PID of the live top-level librewolf process running profile $1.
# Uses /proc cmdline (not `pgrep -f`) to avoid matching this script or shells.
find_main_pid() {
    local profile="$1" pid cmd
    for pid in $(pgrep -x librewolf 2>/dev/null); do
        cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
        # Match " -P <profile> " as a distinct argv pair; the trailing space
        # comes from tr converting the cmdline's final NUL to a space.
        case "$cmd" in
            *" -P $profile "*) printf '%s\n' "$pid"; return 0 ;;
        esac
    done
    return 1
}

# Given a librewolf main PID, print the window id owned by that process.
find_window_for_pid() {
    local target="$1" wid wpid
    for wid in $("$KDOTOOL" search --class librewolf 2>/dev/null); do
        wpid="$("$KDOTOOL" getwindowpid "$wid" 2>/dev/null || true)"
        if [ "$wpid" = "$target" ]; then
            printf '%s\n' "$wid"
            return 0
        fi
    done
    return 1
}

focus_window() { "$KDOTOOL" windowactivate "$1" >/dev/null 2>&1 || true; }

# 1. Existing instance for this profile -> focus its window.
MAIN_PID="$(find_main_pid "$PROFILE_NAME" || true)"
if [ -n "$MAIN_PID" ]; then
    WID="$(find_window_for_pid "$MAIN_PID" || true)"
    if [ -n "$WID" ]; then
        focus_window "$WID"
        exit 0
    fi
fi

# 2. No (focusable) window -> launch and wait for the window to appear.
librewolf -P "$PROFILE_NAME" >/dev/null 2>&1 &
disown 2>/dev/null || true

for _ in $(seq 1 20); do
    sleep 0.5
    MAIN_PID="$(find_main_pid "$PROFILE_NAME" || true)"
    [ -n "$MAIN_PID" ] || continue
    WID="$(find_window_for_pid "$MAIN_PID" || true)"
    if [ -n "$WID" ]; then
        focus_window "$WID"
        exit 0
    fi
done

echo "LibreWolf '$PROFILE_NAME' launched; window focus could not be confirmed." >&2
exit 0
