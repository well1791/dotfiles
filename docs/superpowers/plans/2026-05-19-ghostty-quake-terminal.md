# Ghostty Quake Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Ghostty behave like a quake-style dropdown terminal toggled via Super+O, always appearing maximized.

**Architecture:** KWin JavaScript script manages window lifecycle (hide/show toggle), stores window ID persistently, and registers global shortcut. Chezmoi deploys script files and automates KDE configuration via run_once script.

**Tech Stack:** KWin scripting API (JavaScript), chezmoi, kwriteconfig6, qdbus

**NOTE:** Implementation differs from original plan:
- ✅ Window toggle (hide/show) works perfectly
- ✅ Uses `internalId` (UUID) for Wayland compatibility instead of `windowId`
- ⚠️ Auto-launch removed: KWin scripting API lacks reliable process launching
- ✅ Shows notification when Ghostty not found (user launches manually at login)
- ✅ Design matches Yakuake/Guake: persistent daemon + hotkey toggle

---

## File Structure

**New files to create:**
- `home/dot_local/share/kwin/scripts/ghostty-quake-toggle/metadata.json` - KWin package descriptor
- `home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js` - Core script logic
- `home/dot_local/share/chezmoi/run_once_after_install-kwin-ghostty-quake.sh.tmpl` - Automated setup script

---

## Task 1: Create KWin Script Metadata

**Files:**
- Create: `home/dot_local/share/kwin/scripts/ghostty-quake-toggle/metadata.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code
```

- [ ] **Step 2: Write metadata.json**

Create the file with this exact content:

```json
{
    "KPackageStructure": "KWin/Script",
    "KPlugin": {
        "Authors": [
            {
                "Name": "well"
            }
        ],
        "Description": "Toggle Ghostty terminal with Super+O like a quake-style dropdown",
        "Id": "ghostty-quake-toggle",
        "Name": "Ghostty Quake Terminal Toggle",
        "Version": "1.0.0"
    },
    "X-KDE-ServiceTypes": [
        "KWin/Script"
    ],
    "X-Plasma-API": "javascript",
    "X-Plasma-MainScript": "code/main.js"
}
```

- [ ] **Step 3: Verify JSON syntax**

```bash
cd home/dot_local/share/kwin/scripts/ghostty-quake-toggle
cat metadata.json | jq . > /dev/null && echo "✓ Valid JSON" || echo "✗ Invalid JSON"
```

Expected output: `✓ Valid JSON`

- [ ] **Step 4: Commit metadata**

```bash
git add home/dot_local/share/kwin/scripts/ghostty-quake-toggle/metadata.json
git commit -m "feat(kwin): add ghostty-quake-toggle script metadata"
```

---

## Task 2: Implement Core Script Logic

**Files:**
- Create: `home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js`

- [ ] **Step 1: Write script initialization and state management**

Create `main.js` with this content:

```javascript
// Ghostty Quake Terminal Toggle Script for KWin
// Toggles Ghostty visibility with Super+O like Yakuake/Guake

const GHOSTTY_CLASS = "com.mitchellh.ghostty";
const LAUNCH_COMMAND = "ghostty";
const POLL_INTERVAL = 100; // ms
const POLL_TIMEOUT = 3000; // ms

// Persistent state
let ghosttyWindowId = null;

// Load stored window ID on script initialization
function loadState() {
    ghosttyWindowId = readConfig("ghosttyWindowId", null);
    console.log("[ghostty-quake] Loaded window ID:", ghosttyWindowId);
    
    // Validate that stored window still exists
    if (ghosttyWindowId !== null) {
        const window = findWindowById(ghosttyWindowId);
        if (!window) {
            console.log("[ghostty-quake] Stored window ID is stale, clearing");
            ghosttyWindowId = null;
            saveState();
        }
    }
}

// Save window ID to persistent storage
function saveState() {
    writeConfig("ghosttyWindowId", ghosttyWindowId);
    console.log("[ghostty-quake] Saved window ID:", ghosttyWindowId);
}

// Find window by ID
function findWindowById(windowId) {
    const windows = workspace.windowList();
    for (let i = 0; i < windows.length; i++) {
        if (windows[i].windowId === windowId) {
            return windows[i];
        }
    }
    return null;
}

// Find Ghostty window by resource class
function findGhosttyWindow() {
    const windows = workspace.windowList();
    for (let i = 0; i < windows.length; i++) {
        if (windows[i].resourceClass === GHOSTTY_CLASS) {
            return windows[i];
        }
    }
    return null;
}

// Launch Ghostty and wait for window to appear
function launchGhostty(callback) {
    console.log("[ghostty-quake] Launching Ghostty...");
    
    // Start the process
    callDBus("org.kde.kglobalaccel", "/component/krunner",
             "org.kde.kglobalaccel.Component", "invokeShortcut",
             LAUNCH_COMMAND);
    
    // Alternative: use KWin's built-in command execution
    const success = workspace.launchApplication(LAUNCH_COMMAND);
    if (!success) {
        console.error("[ghostty-quake] Failed to launch Ghostty");
        return;
    }
    
    // Poll for new window
    let elapsed = 0;
    const pollTimer = Qt.createQmlObject(
        'import QtQuick 2.0; Timer {}',
        workspace
    );
    
    pollTimer.interval = POLL_INTERVAL;
    pollTimer.repeat = true;
    pollTimer.triggered.connect(function() {
        elapsed += POLL_INTERVAL;
        
        const window = findGhosttyWindow();
        if (window) {
            console.log("[ghostty-quake] Found new Ghostty window:", window.windowId);
            pollTimer.stop();
            ghosttyWindowId = window.windowId;
            saveState();
            callback(window);
        } else if (elapsed >= POLL_TIMEOUT) {
            console.error("[ghostty-quake] Timeout waiting for Ghostty window");
            pollTimer.stop();
        }
    });
    
    pollTimer.start();
}

// Hide window (minimize + skip taskbar/pager/switcher)
function hideWindow(window) {
    console.log("[ghostty-quake] Hiding window");
    window.minimized = true;
    window.skipTaskbar = true;
    window.skipPager = true;
    window.skipSwitcher = true;
}

// Show window (restore + maximize + focus)
function showWindow(window) {
    console.log("[ghostty-quake] Showing window");
    window.minimized = false;
    window.skipTaskbar = false;
    window.skipPager = false;
    window.skipSwitcher = false;
    window.setMaximize(true, true); // vertical, horizontal
    workspace.activeWindow = window;
}

// Check if window is currently visible
function isWindowVisible(window) {
    return !window.minimized;
}

// Main toggle function
function toggleGhosttyQuake() {
    console.log("[ghostty-quake] Toggle triggered");
    
    // Try to find existing window
    let window = null;
    if (ghosttyWindowId !== null) {
        window = findWindowById(ghosttyWindowId);
    }
    
    // If stored window doesn't exist, search for any Ghostty window
    if (!window) {
        console.log("[ghostty-quake] Searching for Ghostty window...");
        window = findGhosttyWindow();
        if (window) {
            console.log("[ghostty-quake] Found existing Ghostty window:", window.windowId);
            ghosttyWindowId = window.windowId;
            saveState();
        }
    }
    
    // If no window exists, launch Ghostty
    if (!window) {
        console.log("[ghostty-quake] No Ghostty window found, launching...");
        launchGhostty(function(newWindow) {
            showWindow(newWindow);
        });
        return;
    }
    
    // Toggle visibility
    if (isWindowVisible(window)) {
        hideWindow(window);
    } else {
        showWindow(window);
    }
}

// Register global shortcut
registerShortcut(
    "toggleGhosttyQuake",
    "Toggle Ghostty Quake Terminal",
    "Meta+O",
    toggleGhosttyQuake
);

// Initialize
loadState();
console.log("[ghostty-quake] Script initialized");
```

- [ ] **Step 2: Verify file was created**

```bash
ls -lh home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js
wc -l home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js
```

Expected: File exists, ~160 lines

- [ ] **Step 3: Commit script**

```bash
git add home/dot_local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js
git commit -m "feat(kwin): implement ghostty quake toggle logic"
```

---

## Task 3: Create Chezmoi Installation Script

**Files:**
- Create: `home/dot_local/share/chezmoi/run_once_after_install-kwin-ghostty-quake.sh.tmpl`

- [ ] **Step 1: Create the run_once script**

```bash
#!/bin/bash
# Installs KWin Ghostty quake terminal script and configures global shortcut
# Runs once after chezmoi apply

set -e

SCRIPT_NAME="ghostty-quake-toggle"
SCRIPT_PATH="$HOME/.local/share/kwin/scripts/$SCRIPT_NAME"

echo "==> Installing Ghostty Quake Terminal for KWin"

# Check prerequisites
if ! command -v kwriteconfig6 &> /dev/null; then
    echo "ERROR: kwriteconfig6 not found. KDE Plasma 6 is required." >&2
    exit 1
fi

if ! command -v qdbus &> /dev/null; then
    echo "ERROR: qdbus not found. Install qdbus-qt6." >&2
    exit 1
fi

if ! command -v ghostty &> /dev/null; then
    echo "WARNING: ghostty not found in PATH. Install Ghostty before using this feature." >&2
fi

# Verify script files exist
if [ ! -f "$SCRIPT_PATH/metadata.json" ]; then
    echo "ERROR: Script metadata not found at $SCRIPT_PATH/metadata.json" >&2
    exit 1
fi

if [ ! -f "$SCRIPT_PATH/contents/code/main.js" ]; then
    echo "ERROR: Script code not found at $SCRIPT_PATH/contents/code/main.js" >&2
    exit 1
fi

echo "==> Enabling KWin script"
kwriteconfig6 --file kwinrc --group Plugins --key "${SCRIPT_NAME}Enabled" true

echo "==> Configuring global shortcut (Meta+O)"
kwriteconfig6 --file kglobalshortcutsrc \
    --group "$SCRIPT_NAME" \
    --key "toggleGhosttyQuake" \
    "Meta+O,none,Toggle Ghostty Quake Terminal"

echo "==> Reloading KWin configuration"
if ! qdbus org.kde.KWin /KWin reconfigure 2>/dev/null; then
    echo "WARNING: Failed to reload KWin via DBus. You may need to log out and back in." >&2
fi

echo "==> ✓ Ghostty Quake Terminal installed successfully"
echo "    Press Super+O (Meta+O) to toggle the terminal"
```

- [ ] **Step 2: Make script executable**

```bash
chmod +x home/dot_local/share/chezmoi/run_once_after_install-kwin-ghostty-quake.sh.tmpl
```

- [ ] **Step 3: Verify script syntax**

```bash
bash -n home/dot_local/share/chezmoi/run_once_after_install-kwin-ghostty-quake.sh.tmpl && echo "✓ Valid bash" || echo "✗ Syntax error"
```

Expected: `✓ Valid bash`

- [ ] **Step 4: Commit installation script**

```bash
git add home/dot_local/share/chezmoi/run_once_after_install-kwin-ghostty-quake.sh.tmpl
git commit -m "feat(chezmoi): add automated kwin ghostty quake setup"
```

---

## Task 4: Apply and Test Installation

**Files:**
- Test: All created files via chezmoi apply

- [ ] **Step 1: Run chezmoi apply (dry run first)**

```bash
chezmoi apply --dry-run --verbose
```

Expected: Shows files being copied to `~/.local/share/kwin/scripts/ghostty-quake-toggle/` and run_once script execution

- [ ] **Step 2: Apply for real**

```bash
chezmoi apply
```

Expected output includes:
```
==> Installing Ghostty Quake Terminal for KWin
==> Enabling KWin script
==> Configuring global shortcut (Meta+O)
==> Reloading KWin configuration
==> ✓ Ghostty Quake Terminal installed successfully
```

- [ ] **Step 3: Verify files were installed**

```bash
ls -la ~/.local/share/kwin/scripts/ghostty-quake-toggle/
cat ~/.local/share/kwin/scripts/ghostty-quake-toggle/metadata.json
wc -l ~/.local/share/kwin/scripts/ghostty-quake-toggle/contents/code/main.js
```

Expected:
- Directory exists
- metadata.json is valid JSON
- main.js has ~160 lines

- [ ] **Step 4: Check KWin configuration**

```bash
kreadconfig6 --file kwinrc --group Plugins --key ghostty-quake-toggleEnabled
kreadconfig6 --file kglobalshortcutsrc --group ghostty-quake-toggle --key toggleGhosttyQuake
```

Expected:
- First command outputs: `true`
- Second command outputs: `Meta+O,none,Toggle Ghostty Quake Terminal`

- [ ] **Step 5: Verify KWin loaded the script**

```bash
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.scripts | grep -i ghostty
```

Expected: Shows `ghostty-quake-toggle` in the list

---

## Task 5: Manual Testing

**Files:**
- Test: Live system interaction

- [ ] **Step 1: Test initial launch**

1. Ensure no Ghostty windows are open: `killall ghostty` (if any running)
2. Press `Super+O`
3. Verify: Ghostty window appears maximized (fills entire screen)

- [ ] **Step 2: Test hide**

1. With Ghostty visible, press `Super+O`
2. Verify:
   - Window disappears
   - Not in taskbar
   - Open Alt+Tab → Ghostty not shown
   - Check Activities/Overview → Ghostty not visible

- [ ] **Step 3: Test show (same window)**

1. With Ghostty hidden, press `Super+O`
2. Verify:
   - Same window reappears (check by looking at tabs/content from step 1)
   - Window is maximized
   - Window has focus

- [ ] **Step 4: Test session persistence**

1. Show Ghostty, create a few tabs, run some commands
2. Hide with `Super+O`
3. Show with `Super+O`
4. Verify: All tabs and session state preserved

- [ ] **Step 5: Test multiple windows**

1. Show quake terminal with `Super+O`
2. Open a second Ghostty window from application launcher
3. Press `Super+O` several times
4. Verify: Only the quake terminal toggles; second window stays visible

- [ ] **Step 6: Test crash recovery**

1. Show quake terminal with `Super+O`
2. Kill the process: `killall ghostty`
3. Press `Super+O`
4. Verify: New Ghostty instance launches maximized

- [ ] **Step 7: Check KWin logs for errors**

```bash
journalctl --user -u plasma-kwin_wayland.service --since "5 minutes ago" | grep -i ghostty
```

Expected: Script initialization messages, no errors

---

## Task 6: Update Documentation

**Files:**
- Modify: `home/README.md` (if exists) or create usage doc

- [ ] **Step 1: Document the feature**

Add to your dotfiles README or create a new doc at `home/dot_config/kwin/ghostty-quake-README.md`:

```markdown
# Ghostty Quake Terminal

Press `Super+O` to toggle a Yakuake-style dropdown terminal using Ghostty.

## Features

- First press: Auto-launches Ghostty maximized
- Second press: Hides terminal (no taskbar/Alt+Tab visibility)
- Third press: Shows same window with all session state preserved
- Crash recovery: Automatically relaunches if Ghostty dies

## Requirements

- KDE Plasma 6
- Ghostty installed and in PATH
- Wayland or X11 session

## Installation

Automatically installed via `chezmoi apply`.

## Uninstallation

```bash
rm -rf ~/.local/share/kwin/scripts/ghostty-quake-toggle/
kwriteconfig6 --file kwinrc --group Plugins --key ghostty-quake-toggleEnabled false
qdbus org.kde.KWin /KWin reconfigure
```

## Troubleshooting

**Shortcut doesn't work:**
- Check: `kreadconfig6 --file kglobalshortcutsrc --group ghostty-quake-toggle --key toggleGhosttyQuake`
- Relog or reload KWin: `qdbus org.kde.KWin /KWin reconfigure`

**Window doesn't hide properly:**
- Check KWin logs: `journalctl --user -u plasma-kwin_wayland.service | grep ghostty`

**Multiple Ghostty windows interfere:**
- This is expected behavior; script tracks one designated quake instance
```

- [ ] **Step 2: Commit documentation**

```bash
git add home/dot_config/kwin/ghostty-quake-README.md
git commit -m "docs(kwin): add ghostty quake terminal usage guide"
```

---

## Task 7: Final Verification and Cleanup

**Files:**
- Review: All created files

- [ ] **Step 1: Verify all acceptance criteria**

From the spec, check each item:

- [ ] Pressing Super+O on fresh boot launches Ghostty maximized
- [ ] Pressing Super+O with Ghostty visible hides it (no taskbar/Alt+Tab)
- [ ] Pressing Super+O with Ghostty hidden shows same window maximized
- [ ] Session state (tabs, shell history, running processes) preserved across toggles
- [ ] Killing Ghostty process and pressing Super+O relaunches it
- [ ] Opening additional Ghostty windows doesn't interfere with quake instance
- [ ] chezmoi apply on fresh KDE install fully configures the feature
- [ ] Script survives KWin restart/crash without manual reconfiguration

- [ ] **Step 2: Test KWin restart**

```bash
qdbus org.kde.KWin /KWin reconfigure
```

Wait 5 seconds, then press `Super+O` to verify it still works.

- [ ] **Step 3: Review file structure**

```bash
tree home/dot_local/share/kwin/scripts/ghostty-quake-toggle/
```

Expected structure:
```
ghostty-quake-toggle/
├── contents
│   └── code
│       └── main.js
└── metadata.json
```

- [ ] **Step 4: Final commit**

```bash
git status
git log --oneline -7
```

Expected: All files committed, clean working tree

- [ ] **Step 5: Tag the implementation**

```bash
git tag -a ghostty-quake-v1.0.0 -m "Ghostty quake terminal implementation complete"
git push origin main --tags
```

---

## Rollback Plan

If anything goes wrong:

```bash
# Disable the script
kwriteconfig6 --file kwinrc --group Plugins --key ghostty-quake-toggleEnabled false
qdbus org.kde.KWin /KWin reconfigure

# Remove files
rm -rf ~/.local/share/kwin/scripts/ghostty-quake-toggle/

# Remove shortcut
kwriteconfig6 --file kglobalshortcutsrc --group ghostty-quake-toggle --key toggleGhosttyQuake --delete

# Revert chezmoi
cd ~/.local/share/chezmoi
git revert <commit-hash>
chezmoi apply
```

---

## Post-Implementation Notes

**Known Limitations:**
- Script tracks a single quake instance; multiple instances not supported
- Window always appears maximized (no size/position configuration)
- Requires KDE Plasma 6 (no Plasma 5 fallback)

**Future Enhancements:**
- Add configuration for window size/position
- Support multiple quake terminals with different shortcuts
- Integrate with Ghostty's native `quick-terminal` when D-Bus API is available
