# Ghostty Quake Terminal for KWin

A KWin script that makes Ghostty behave like a quake-style dropdown terminal (similar to Yakuake, Guake, or Tilda), toggled via **Super+O**.

## Features

- **Global Hotkey:** Press `Super+O` (Meta+O) to show/hide Ghostty
- **Auto-Hide on Focus Loss:** Window automatically hides when you click elsewhere or switch to another window
- **Auto-Hide on Desktop/Activity Switch:** Window automatically hides when you switch virtual desktops or Activities
- **Always Maximized:** Window fills the entire screen when visible
- **Hidden When Not in Use:** Window is completely invisible (no taskbar, no Alt+Tab, no pager)
- **Persistent State:** Remembers your Ghostty window across KWin restarts
- **Single Window Management:** Only manages one Ghostty window (the first one launched)

## Installation

This script is automatically installed via chezmoi:

```bash
chezmoi apply
```

The installation script will:
1. Enable the KWin script
2. Configure the Super+O global shortcut
3. Reload KWin configuration

## Usage

### Setup (One-Time)

**Add Ghostty to autostart apps:**

1. Open **System Settings** → **System** → **Autostart**
2. Click **Add Application...**
3. Search for "Ghostty" and select it
4. Click **OK**

Alternatively, create an autostart entry manually:

```bash
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/ghostty.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Ghostty
Exec=ghostty
X-KDE-autostart-after=panel
EOF
```

### Daily Workflow

1. **Log in** → Ghostty starts automatically in the background
2. **Press `Super+O`** → Ghostty appears maximized
3. **Click anywhere else** (or press `Super+O` or switch desktops) → Window hides (but Ghostty keeps running)
4. **Press `Super+O`** anytime to bring it back

**Auto-hide behavior:**
- When you click outside Ghostty or switch to another window, it automatically hides
- When you switch virtual desktops (Ctrl+F1/F2/etc) or Activities, it automatically hides
- This keeps your workspace clean while keeping the terminal instantly accessible
- You can still manually toggle with `Super+O` at any time

### If Ghostty Is Not Running

If you press `Super+O` without Ghostty running, you'll see a notification:

> **Ghostty Not Running**  
> Please launch Ghostty manually, then press Super+O to toggle.

Simply launch Ghostty from the application menu, then use `Super+O` as normal.

## How It Works

### Window Management

The script:
- Finds Ghostty windows by resource class (`com.mitchellh.ghostty`)
- Stores the window's internal ID (UUID on Wayland) persistently
- Toggles visibility by setting `minimized`, `skipTaskbar`, `skipPager`, and `skipSwitcher` properties
- Maximizes the window both vertically and horizontally when showing
- Automatically hides the window when:
  - It loses focus (via `window.activeChanged` signal)
  - You switch virtual desktops (via `workspace.currentDesktopChanged` signal)
  - You switch Activities (via `workspace.currentActivityChanged` signal)

### Multiple Ghostty Windows

If you have multiple Ghostty windows open (e.g., one quake terminal + one regular window):
- The script manages the **first window** it finds
- Other windows remain independent and visible normally
- Press `Super+O` only toggles the quake terminal

## Keyboard Shortcut

The default shortcut is **Super+O** (also written as Meta+O).

To change it:
1. Open **System Settings** → **Keyboard** → **Shortcuts**
2. Search for "Ghostty Quake Terminal"
3. Click the shortcut and press your desired key combination

## Troubleshooting

### Shortcut doesn't work

Check if the script is enabled:

```bash
kreadconfig6 --file kwinrc --group Plugins --key ghostty-quake-toggleEnabled
```

Should output `true`. If not, re-run the installation:

```bash
chezmoi apply
```

### Window doesn't hide/show

Check KWin logs for errors:

```bash
journalctl --user -u plasma-kwin_wayland.service --since "5 minutes ago" | grep ghostty-quake
```

### Ghostty launches but window doesn't appear

The script requires Ghostty to create a visible window. If you have Ghostty configured with `initial-window = false`, remove that setting or launch with:

```bash
ghostty --initial-window=true
```

### Script isn't loading

Verify the script is loaded:

```bash
qdbus org.kde.KWin /Scripting org.kde.kwin.Scripting.isScriptLoaded ghostty-quake-toggle
```

Should output `true`. Reload KWin if needed:

```bash
qdbus org.kde.KWin /KWin reconfigure
```

## Uninstallation

To disable the script:

```bash
kwriteconfig6 --file kwinrc --group Plugins --key ghostty-quake-toggleEnabled false
qdbus org.kde.KWin /KWin reconfigure
```

To remove the global shortcut:

```bash
kwriteconfig6 --file kglobalshortcutsrc --group ghostty-quake-toggle --key toggleGhosttyQuake --delete
```

## Technical Details

- **Script Location:** `~/.local/share/kwin/scripts/ghostty-quake-toggle/`
- **Configuration:** Stored in KWin's config system via `readConfig`/`writeConfig`
- **Window ID Type:** UUID string (Wayland) or numeric ID (X11)
- **KWin API:** Uses `workspace.windowList()`, window properties, and signals:
  - `workspace.windowAdded` - Detects new windows
  - `window.activeChanged` - Auto-hide on focus loss
  - `workspace.currentDesktopChanged` - Auto-hide on desktop switch
  - `workspace.currentActivityChanged` - Auto-hide on activity switch

## License

Part of personal dotfiles. Use freely.

## See Also

- [Ghostty Terminal](https://mitchellh.com/ghostty)
- [KWin Scripting API](https://develop.kde.org/docs/plasma/kwin/)
- [Yakuake](https://apps.kde.org/yakuake/) - Similar dropdown terminal for KDE
