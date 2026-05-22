#!/bin/bash
# Fix ghostty window properties to show in taskbar and Alt+Tab

echo "==> Fixing Ghostty window properties"

# Check if ghostty is running
if ! pgrep -x ghostty >/dev/null; then
    echo "⚠️  Ghostty is not running. Launch ghostty and run this script again."
    exit 0
fi

# Find ghostty window
GHOSTTY_WID=$(kdotool search --class com.mitchellh.ghostty 2>/dev/null | head -1)

if [ -z "$GHOSTTY_WID" ]; then
    echo "⚠️  Could not find ghostty window. Make sure ghostty is visible."
    exit 0
fi

echo "Found ghostty window: $GHOSTTY_WID"

# Remove skip properties to make it visible in taskbar and Alt+Tab
echo "Removing SKIP_TASKBAR property..."
kdotool windowstate --remove SKIP_TASKBAR "$GHOSTTY_WID" 2>/dev/null || echo "  (property not set or already removed)"

echo "Removing SKIP_PAGER property..."
kdotool windowstate --remove SKIP_PAGER "$GHOSTTY_WID" 2>/dev/null || echo "  (property not set or already removed)"

echo "Removing SKIP_SWITCHER property (if supported)..."
kdotool windowstate --remove SKIP_SWITCHER "$GHOSTTY_WID" 2>/dev/null || echo "  (not supported or already removed)"

echo ""
echo "✅ Ghostty window properties updated"
echo "📝 If ghostty still hides, restart ghostty completely:"
echo "   pkill ghostty"
echo "   ghostty &"
echo ""
echo "   Then press Ctrl+Alt+Shift+O to test the shortcut"
