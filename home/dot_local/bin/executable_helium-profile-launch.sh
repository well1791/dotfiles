#!/bin/bash
# helium-profile-launch.sh - Launch or focus a Helium browser profile instance.
#
# Each profile runs as its own Chromium instance with a private user-data-dir
# and a distinct --class (Wayland app_id). Chromium normally runs all profiles
# in one process with a single window class, which makes per-profile window
# focus impossible; the split user-data-dir + --class combo restores it.
#
# KDE Wayland (kdotool) aware. With existing windows we cycle through them
# (same behaviour as run-or-cycle.sh); otherwise we launch the instance.
#
# Usage: helium-profile-launch.sh <work|mine>

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
    echo "Usage: helium-profile-launch.sh <profile-name>" >&2
    echo "Profiles: work, mine" >&2
    exit 1
fi

case "$PROFILE_NAME" in
    work)
        DATA_DIR="$HOME/.config/helium-work"
        WM_CLASS="helium-work"
        ;;
    mine)
        DATA_DIR="$HOME/.config/helium-mine"
        WM_CLASS="helium-mine"
        ;;
    *)
        echo "Error: Unknown profile '$PROFILE_NAME'." >&2
        echo "Valid profiles: work, mine" >&2
        exit 1
        ;;
esac

# Find all windows matching the profile's class.
WIDS=$("$KDOTOOL" search --class "$WM_CLASS" 2>/dev/null)

# No windows found -> launch the instance.
if [ -z "$WIDS" ]; then
    setsid helium-browser --user-data-dir="$DATA_DIR" --class="$WM_CLASS" >/dev/null 2>&1 &
    exit 0
fi

# Windows exist -> focus the one after the currently active window (cycle).
ACTIVE=$("$KDOTOOL" getactivewindow 2>/dev/null || true)

NEXT_WID=""
FOUND_ACTIVE=false
for id in $WIDS; do
    if [ "$FOUND_ACTIVE" = true ]; then
        NEXT_WID=$id
        break
    fi
    if [ "$id" = "$ACTIVE" ]; then
        FOUND_ACTIVE=true
    fi
done

# Wrap around: active was the last match (or not one of this profile's windows).
if [ -z "$NEXT_WID" ]; then
    NEXT_WID=$(printf '%s\n' "$WIDS" | head -n 1)
fi

"$KDOTOOL" windowactivate "$NEXT_WID" >/dev/null 2>&1 || true
