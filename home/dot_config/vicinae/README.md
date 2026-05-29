# Vicinae Configuration

Vicinae is a keyboard-driven application launcher for Linux (Raycast-like).

## Features

- 🚀 Fast application launcher
- 📋 Clipboard history manager
- 🔍 File search
- 🧮 Calculator (Qalculate!)
- 🔧 Extensible with TypeScript extensions
- 🎨 Themeable

## Configuration

### Files
- **Main config**: `~/.config/vicinae/settings.json`
- **Data directory**: `~/.local/share/vicinae/`
- **Extensions**: `~/.local/share/vicinae/extensions/`

### Editing Configuration

**Recommended: Use GUI**
```bash
vicinae settings
# Or press Ctrl+' when vicinae is open
```

**Manual editing**: Edit `settings.json` directly
- Note: GUI changes will overwrite formatting/comments
- For persistent custom configs, create separate files and use `imports` array

### Default Configuration
View complete default config:
```bash
vicinae config default
```

## Setup Keybind

### KDE Plasma
1. Open **System Settings** → **Shortcuts** → **Custom Shortcuts**
2. Click **Edit** → **New** → **Global Shortcut** → **Command/URL**
3. Name: `Vicinae Toggle`
4. **Trigger** tab: Set to `Super+Space` (or your preferred key)
5. **Action** tab: Command: `vicinae toggle`
6. Click **Apply**

### Other Desktop Environments
Bind your preferred key to: `vicinae toggle`

## Key Features in Config

### Telemetry
Disabled by default in this dotfiles config for privacy.
```json
"telemetry": {
  "system_info": false
}
```

### Window Appearance
- **Opacity**: Adjustable (default: 1.0)
- **Blur**: Enabled (requires compositor support)
- **Client-side decorations**: Rounded corners, borders, shadows
- **Compact mode**: Available (shows only search bar when empty)

### Keybindings
- `Ctrl+,` - Open settings
- `Ctrl+P` - Search filter
- `Ctrl+B` - Toggle action panel
- `Ctrl+E` - Edit action
- `Ctrl+Shift+C` - Copy action

### Layer Shell (Wayland)
Enabled for KDE Plasma, Hyprland, Sway, etc.
- **Keyboard interactivity**: `exclusive` (or `on_demand` if mouse issues occur)
- **Layer**: `top` (recommended over `overlay` for IME compatibility)

## Usage

### Basic Commands
```bash
vicinae toggle      # Open/close launcher
vicinae settings    # Open settings GUI
vicinae server      # Start server manually
vicinae --help      # Show all commands
```

### Clipboard History
Vicinae includes built-in clipboard history:
- Set as favorite by default
- Shows in root search when no query is active
- Access directly: `vicinae toggle` then start typing

### File Search
Fast async file search:
- Included in fallbacks (shows when no results match)
- Use dedicated command for rich preview: search "Files" in vicinae

### Calculator
Built-in Qalculate! support:
- Type calculations directly in search bar
- Supports unit conversions, currency, etc.

## Customization Tips

### Import Separate Configs
Keep clean, version-controlled configs:
```json
"imports": [
  "./keybinds.json",
  "./providers.json",
  "./theme.json"
]
```

### Themes
Switch themes via GUI or config:
- Built-in: `vicinae-light`, `vicinae-dark`
- Custom themes: Place in `~/.local/share/vicinae/themes/`
- Auto-switches based on system appearance

### Extensions
Install extensions via GUI:
1. Open settings (`Ctrl+,`)
2. Go to **Extensions** tab
3. Browse and install from extension hub

## Troubleshooting

### Vicinae doesn't open
**Note:** Vicinae auto-starts its server when you run `vicinae toggle`.
You typically **don't need** to manually start the server.

```bash
# Check if server is running
pgrep -a vicinae

# If keybind doesn't work, try from terminal:
vicinae toggle

# Clean up stale socket/PID files if connection refused:
rm -rf /run/user/$(id -u)/vicinae/
vicinae toggle

# Clear failed systemd units:
systemctl --user reset-failed
```

### Keybind not working
- Check for conflicts in System Settings → Shortcuts
- Try different key combination
- Ensure `vicinae toggle` command works from terminal first

## Clipboard Management

### Replace Klipper with Vicinae

Vicinae includes a powerful built-in clipboard manager. To use it instead of Klipper:

**1. Disable Klipper:**
```bash
# Stop Klipper if running
kquitapp5 klipper

# Disable from KDE session startup
kwriteconfig5 --file ksmserverrc --group General --key excludeApps "klipper"
```

**2. Access Vicinae Clipboard:**
- Open vicinae and type "clipboard" or "clip"
- Or set it as a favorite in settings

### Filtering Espanso Clipboard Noise

**The Problem:**
Espanso uses clipboard for text expansion, creating many short entries (single characters) that clutter clipboard history.

**Current Limitation:**
Vicinae doesn't have built-in filtering by:
- Application name (source field is empty)
- Content length
- Custom patterns

**Solution 1: Manual Cleanup**
```bash
# Run cleanup script (removes entries ≤3 characters)
vicinae-cleanup
```

**Solution 2: Automatic Cleanup (Recommended)**
```bash
# Enable hourly cleanup
systemctl --user enable --now vicinae-cleanup.timer

# Check status
systemctl --user status vicinae-cleanup.timer

# Run manually
systemctl --user start vicinae-cleanup.service
```

**Solution 3: Adjust Cleanup Threshold**
Edit `~/.local/bin/vicinae-cleanup` and change:
```bash
WHERE d.size <= 3  # Change 3 to your preferred threshold
```

### Clipboard History Details

- **Storage**: `~/.local/share/vicinae/clipboard.db` (SQLite)
- **Display limit**: 1,000 entries (when no search)
- **Auto-exclude**: Password manager content (KDE hints)
- **Encryption**: Optional AES256-GCM (enable in settings)

### Manual Database Operations

```bash
# Count total entries
sqlite3 ~/.local/share/vicinae/clipboard.db "SELECT COUNT(*) FROM selection;"

# Count short entries
sqlite3 ~/.local/share/vicinae/clipboard.db "SELECT COUNT(*) FROM selection s JOIN data_offer d ON s.id = d.selection_id WHERE d.size <= 3;"

# Clear all history
vicinae toggle  # Then use "Remove all" action in clipboard history

# Or via database
sqlite3 ~/.local/share/vicinae/clipboard.db "DELETE FROM selection; VACUUM;"
```

## Resources

- **Documentation**: https://docs.vicinae.com
- **GitHub**: https://github.com/vicinaehq/vicinae
- **Extensions Hub**: Browse in GUI settings
