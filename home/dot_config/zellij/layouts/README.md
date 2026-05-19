# Zellij Layouts

## main.kdl (Default)

**Features:**
- Horizontal status bar at top (zjstatus plugin)
- Swap layouts: vertical, horizontal, stacked
- Catppuccin-style colors
- Compact, frameless design

**Usage:**
```bash
zellij                    # Auto-loaded as default
zellij --layout main      # Explicit load
```

## Switching Defaults

Edit `~/.config/zellij/config.kdl`:
```kdl
default_layout "main"              # Horizontal layout
```
