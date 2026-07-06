#!/bin/bash
# librewolf-profile-launch.sh - Launch or focus LibreWolf with specific profile
# Usage: librewolf-profile-launch.sh <profile-name>

# Find kdotool - check PATH first, then common locations
if command -v kdotool >/dev/null 2>&1; then
    KDOTOOL="kdotool"
elif [ -x "$HOME/.local/bin/kdotool" ]; then
    KDOTOOL="$HOME/.local/bin/kdotool"
else
    echo "Error: kdotool not found. Install it for KDE Wayland window management." >&2
    exit 1
fi

PROFILE_NAME="$1"

if [ -z "$PROFILE_NAME" ]; then
    echo "Usage: librewolf-profile-launch.sh <profile-name>" >&2
    echo "Example: librewolf-profile-launch.sh well" >&2
    exit 1
fi

# Validate profile name
case "$PROFILE_NAME" in
    well|work|games|contabilidad)
        # Valid profile
        ;;
    *)
        echo "Error: Unknown profile '$PROFILE_NAME'" >&2
        echo "Valid profiles: well, work, games, contabilidad" >&2
        exit 1
        ;;
esac

PID_FILE="$HOME/.cache/librewolf-profile-${PROFILE_NAME}.pid"

# Try to find existing window by stored PID
if [ -f "$PID_FILE" ]; then
    STORED_PID=$(cat "$PID_FILE")
    
    # Check if process is still running
    if kill -0 "$STORED_PID" 2>/dev/null; then
        # Try to find windows by PID
        WIDS=$("$KDOTOOL" search --pid "$STORED_PID" 2>/dev/null)
        
        if [ -n "$WIDS" ]; then
            # Window found - activate first one
            FIRST_WID=$(echo "$WIDS" | head -n1)
            echo "Focusing existing LibreWolf window for profile: $PROFILE_NAME (PID: $STORED_PID)"
            "$KDOTOOL" windowactivate "$FIRST_WID"
            exit 0
        else
            echo "Process $STORED_PID exists but no window found, launching new instance..."
        fi
    else
        echo "Stale PID file found, removing..."
        rm -f "$PID_FILE"
    fi
fi

# No existing window found - launch new instance
echo "Launching LibreWolf with profile: $PROFILE_NAME"
librewolf -P "$PROFILE_NAME" >/dev/null 2>&1 &
NEW_PID=$!

# Store PID for future lookups
mkdir -p "$(dirname "$PID_FILE")"
echo "$NEW_PID" > "$PID_FILE"
echo "Stored PID: $NEW_PID in $PID_FILE"

# Wait for window to appear
echo "Waiting for window to appear..."
for i in {1..10}; do
    sleep 0.3
    WIDS=$("$KDOTOOL" search --pid "$NEW_PID" 2>/dev/null)
    if [ -n "$WIDS" ]; then
        FIRST_WID=$(echo "$WIDS" | head -n1)
        echo "Window appeared, focusing..."
        "$KDOTOOL" windowactivate "$FIRST_WID"
        exit 0
    fi
done

echo "⚠️  Window didn't appear within 3 seconds. It may still be loading."
