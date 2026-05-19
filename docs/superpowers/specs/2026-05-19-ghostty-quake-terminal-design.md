# Ghostty Quake Terminal Design

**Date:** 2026-05-19  
**Status:** Approved  
**Owner:** well

## Overview

Implement a KDE/KWin integration that makes Ghostty behave like a quake-style dropdown terminal (similar to Yakuake/Guake), toggled via `Super+O` global shortcut, with the window always appearing maximized.

## Goals

- Press `Super+O` to toggle Ghostty visibility
- First invocation auto-launches Ghostty if not running
- Window always appears maximized (full screen)
- When hidden, window is completely invisible (no taskbar, no Alt+Tab, no pager)
- Session state preserved between toggles (same window, same tabs/content)
- Fully managed via chezmoi for reproducibility across KDE environments

## Non-Goals

- Using Ghostty's native `quick-terminal` feature (not accessible via global shortcut on KDE Wayland)
- Supporting multiple quake terminal instances
- Window positioning/sizing options (always maximized)
- Integration with other terminal emulators

## Architecture

### Components

1. **KWin Script** (`ghostty-quake-toggle`)
   - JavaScript running in KWin's scripting engine
   - Manages window lifecycle, visibility, and state
   - Registers global shortcut action

2. **Metadata** (`metadata.json`)
   - KWin package descriptor
   - Script name, version, description, author

3. **Chezmoi Integration**
   - Script files in `~/.local/share/kwin/scripts/ghostty-quake-toggle/`
   - Automated installation via `run_once` script
   - Global shortcut configuration via `kwriteconfig6`

### Data Flow

```
User presses Super+O
  ↓
KWin global shortcut triggers script action
  ↓
Script checks: Does tracked window exist and is valid?
  ↓
  NO → Launch Ghostty process
     → Poll for new window (match by resourceClass)
     → Store window ID in script state
     → Maximize and show window
  ↓
  YES → Is window currently visible?
     ↓
     VISIBLE → Hide window:
        - Set minimized = true
        - Set skipTaskbar = true
        - Set skipPager = true
        - Set skipSwitcher = true
     ↓
     HIDDEN → Show window:
        - Set minimized = false
        - Set skipTaskbar = false
        - Set skipPager = false
        - Set skipSwitcher = false
        - Maximize (vertical + horizontal)
        - Raise to front and focus
```

## Implementation Details

### Window Identification

**Launch Command:**
```bash
ghostty
```

**Detection Criteria:**
- Poll KWin's `workspace.windowList()` every 100ms for up to 3 seconds
- Match: `window.resourceClass === 'com.mitchellh.ghostty'`
- Store `window.windowId` in script's persistent state (KWin config storage)

**State Persistence:**
- Window ID stored via KWin's script storage API
- Survives KWin restarts
- Re-validates on script initialization (check if window still exists)

### Hiding Implementation

```javascript
function hideWindow(window) {
    window.minimized = true;
    window.skipTaskbar = true;
    window.skipPager = true;
    window.skipSwitcher = true;
}
```

**Result:** Window completely disappears from:
- Taskbar
- Alt+Tab switcher
- Virtual desktop pager
- All window management UIs

### Showing Implementation

```javascript
function showWindow(window) {
    window.minimized = false;
    window.skipTaskbar = false;
    window.skipPager = false;
    window.skipSwitcher = false;
    window.setMaximize(true, true);  // vertical, horizontal
    workspace.activeWindow = window;
}
```

**Result:** Window appears maximized and receives focus.

### File Structure

```
home/
  dot_local/
    share/
      kwin/
        scripts/
          ghostty-quake-toggle/
            contents/
              code/
                main.js              # Core script logic
            metadata.json            # KWin package metadata
  dot_local/
    share/
      chezmoi/
        run_once_after_install-kwin-ghostty-quake.sh.tmpl
```

### Automated Installation

**Script:** `run_once_after_install-kwin-ghostty-quake.sh.tmpl`

```bash
#!/bin/bash
set -e

SCRIPT_NAME="ghostty-quake-toggle"

# Check prerequisites
if ! command -v kwriteconfig6 &> /dev/null; then
    echo "Error: kwriteconfig6 not found. KDE Plasma 6 required." >&2
    exit 1
fi

if ! command -v ghostty &> /dev/null; then
    echo "Warning: ghostty not found in PATH. Install Ghostty first." >&2
fi

# Enable the KWin script
kwriteconfig6 --file kwinrc --group Plugins --key "${SCRIPT_NAME}Enabled" true

# Reload KWin configuration
qdbus org.kde.KWin /KWin reconfigure 2>/dev/null || true

# Set global shortcut (Meta+O)
kwriteconfig6 --file kglobalshortcutsrc \
    --group "$SCRIPT_NAME" \
    --key "toggleGhosttyQuake" \
    "Meta+O,none,Toggle Ghostty Quake Terminal"

echo "Ghostty quake terminal installed. Press Super+O to toggle."
```

**Chezmoi execution:** Runs once after `chezmoi apply` (via `run_once_after_` prefix).

## Error Handling

### Scenario: Ghostty Not Installed
- **Detection:** `ghostty` command not in PATH when script tries to launch
- **Behavior:** Script logs error, does nothing on shortcut press
- **Recovery:** Install Ghostty, press shortcut again

### Scenario: Ghostty Crashes
- **Detection:** Stored window ID no longer valid (window doesn't exist)
- **Behavior:** Script clears stored ID, relaunches Ghostty on next toggle
- **Recovery:** Automatic on next `Super+O` press

### Scenario: Window ID Becomes Invalid
- **Detection:** Window exists in list but ID doesn't match stored value
- **Behavior:** Script re-scans for Ghostty window by `resourceClass`
- **Recovery:** Automatic re-detection and ID update

### Scenario: Multiple Ghostty Windows
- **Detection:** Multiple windows with `resourceClass = 'com.mitchellh.ghostty'`
- **Behavior:** Script uses the stored window ID exclusively; ignores others
- **Recovery:** If stored ID is invalid, picks first matching window

### Scenario: KWin Restart
- **Detection:** Script reloads, checks if stored window ID is valid
- **Behavior:** If valid, continues using it; if not, clears and relaunches
- **Recovery:** Automatic state restoration or fresh launch

## Testing Plan

### Manual Verification

1. **Initial Launch**
   - Fresh login (no Ghostty running)
   - Press `Super+O` → Ghostty launches maximized
   - Verify window fills entire screen

2. **Toggle Hide**
   - With Ghostty visible, press `Super+O`
   - Verify window disappears from taskbar
   - Open Alt+Tab → Ghostty not in list
   - Check virtual desktop switcher → Ghostty not shown

3. **Toggle Show**
   - With Ghostty hidden, press `Super+O`
   - Verify same window reappears maximized
   - Check session state (tabs, content) preserved

4. **Multiple Windows**
   - Open second Ghostty window via launcher
   - Press `Super+O` → Only quake instance toggles
   - Second window unaffected

5. **Process Recovery**
   - `Super+O` to show quake terminal
   - Kill Ghostty process manually: `killall ghostty`
   - Press `Super+O` → New Ghostty launches

### Edge Cases

- **Screen resolution change:** Window still maximizes correctly
- **KWin restart:** `kwin_x11 --replace` or relog → Script state persists
- **Shortcut conflict:** If `Meta+O` already bound, setup script should fail gracefully

## Acceptance Criteria

- [ ] Pressing `Super+O` on fresh boot launches Ghostty maximized
- [ ] Pressing `Super+O` with Ghostty visible hides it (no taskbar/Alt+Tab)
- [ ] Pressing `Super+O` with Ghostty hidden shows same window maximized
- [ ] Session state (tabs, shell history, running processes) preserved across toggles
- [ ] Killing Ghostty process and pressing `Super+O` relaunches it
- [ ] Opening additional Ghostty windows doesn't interfere with quake instance
- [ ] `chezmoi apply` on fresh KDE install fully configures the feature
- [ ] Script survives KWin restart/crash without manual reconfiguration

## Deployment

### Prerequisites
- KDE Plasma 6 (uses `kwriteconfig6`)
- Ghostty installed and in PATH
- Wayland or X11 session (script works on both)

### Installation
1. Run `chezmoi apply`
2. Automated script enables KWin script and sets global shortcut
3. Press `Super+O` to verify

### Uninstallation
1. Remove script directory: `rm -rf ~/.local/share/kwin/scripts/ghostty-quake-toggle/`
2. Disable in System Settings → Window Management → KWin Scripts
3. Remove shortcut in System Settings → Shortcuts → KWin

## Future Enhancements (Out of Scope)

- Configurable window size/position (currently hardcoded to maximized)
- Multiple quake terminals with different shortcuts
- Integration with Ghostty's native `quick-terminal` when D-Bus API is added
- Support for KDE Plasma 5 (`kwriteconfig5` fallback)
