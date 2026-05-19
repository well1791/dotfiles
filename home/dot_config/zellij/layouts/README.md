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

## vertical-tabs.kdl

**Features:**
- Vertical tab bar on RIGHT side (18 columns)
- Uses zellij-vertical-tabs plugin
- Requires plugin installation via manifest

**Usage:**
```bash
zellij --layout vertical-tabs
```

## Switching Defaults

Edit `~/.config/zellij/config.kdl`:
```kdl
default_layout "main"              # Horizontal layout
# default_layout "vertical-tabs"   # Vertical tabs
```
