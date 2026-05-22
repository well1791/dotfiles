#!/bin/bash

# run-or-cycle: Launch an app, focus its window, or cycle between its windows.
# Designed for KDE Plasma (Wayland) using kdotool.
#
# Usage: run-or-cycle.sh <window-class> <command>
#   window-class  The window class to search for (e.g. brave-browser, konsole, dolphin)
#   command       The command to launch the app if no window is found

CLASS=$1
CMD=$2

if [ -z "$CLASS" ] || [ -z "$CMD" ]; then
    echo "Usage: run-or-cycle.sh <window-class> <command>" >&2
    exit 1
fi

# Find all windows matching the class
WIDS=$(kdotool search --class "$CLASS" 2>/dev/null)

# No windows found — launch the app
if [ -z "$WIDS" ]; then
    setsid "$CMD" >/dev/null 2>&1 &
    exit 0
fi

# Get the currently active window
ACTIVE=$(kdotool getactivewindow)

# Build an array and find the next window in the cycle
WIDS_ARRAY=($WIDS)
NEXT_WID=""
FOUND_ACTIVE=false

for id in "${WIDS_ARRAY[@]}"; do
    if [ "$FOUND_ACTIVE" = true ]; then
        NEXT_WID=$id
        break
    fi
    if [ "$id" = "$ACTIVE" ]; then
        FOUND_ACTIVE=true
    fi
done

# Wrap around: if active was the last (or not in the list), pick the first
if [ -z "$NEXT_WID" ]; then
    NEXT_WID=${WIDS_ARRAY[0]}
fi

kdotool windowactivate "$NEXT_WID"
