# Set Main Layout as Zellij Default Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change zellij's default layout from "vertical-tabs" to "main" so all new zellij sessions use the main.kdl layout without requiring explicit `--layout` flag.

**Architecture:** Simple configuration change in `config.kdl` to point `default_layout` directive to "main" instead of "vertical-tabs". Verify the change works and document the difference between layouts.

**Tech Stack:** Zellij 0.44.3, chezmoi dotfiles manager

---

## Current State

- **Current default_layout:** `"vertical-tabs"` (line 370 in config.kdl)
- **Available layouts:**
  - `main.kdl` (155 lines) - Horizontal zjstatus bar, swap layouts for tiling
  - `vertical-tabs.kdl` (174 lines) - Vertical tabs on right side via plugin
- **Location:** `~/.local/share/chezmoi/home/dot_config/zellij/`

---

### Task 1: Update default_layout in config.kdl

**Files:**
- Modify: `home/dot_config/zellij/config.kdl:370`

- [ ] **Step 1: Change default_layout value**

Open `home/dot_config/zellij/config.kdl` and locate line 370:

```kdl
default_layout "vertical-tabs"
```

Change it to:

```kdl
default_layout "main"
```

- [ ] **Step 2: Verify syntax**

Run: 
```bash
cd ~/.local/share/chezmoi
grep -n "default_layout" home/dot_config/zellij/config.kdl
```

Expected output:
```
370:default_layout "main"
```

- [ ] **Step 3: Apply via chezmoi**

Run:
```bash
cd ~/.local/share/chezmoi
chezmoi apply ~/.config/zellij/config.kdl
```

Expected: No errors, config file updated in home directory

- [ ] **Step 4: Commit the change**

```bash
git add home/dot_config/zellij/config.kdl
git commit -m "config(zellij): set main layout as default"
```

---

### Task 2: Test Default Layout

**Files:**
- Verify: `~/.config/zellij/config.kdl`
- Verify: `~/.config/zellij/layouts/main.kdl`

- [ ] **Step 1: Kill existing zellij sessions**

Run:
```bash
zellij kill-all-sessions -y
```

Expected: All sessions terminated (or "no sessions to kill")

- [ ] **Step 2: Start zellij without layout flag**

Run:
```bash
zellij
```

Expected: 
- Zellij starts
- Horizontal status bar at top (zjstatus)
- Tab bar showing current tab
- No vertical tabs on right side

- [ ] **Step 3: Verify keybindings work**

Test these key combinations:
- `Alt+f` - Create new tab
- `Alt+d` - Split pane down
- `Alt+r` - Split pane right
- `Alt+[` / `Alt+]` - Cycle through swap layouts

Expected: All actions work as configured in main.kdl

- [ ] **Step 4: Detach from session**

Press: `Alt+Ctrl+o` then `d`

Expected: Return to shell

---

### Task 3: Document Layout Differences

**Files:**
- Create: `home/dot_config/zellij/layouts/README.md`

- [ ] **Step 1: Create layout documentation**

```bash
cd ~/.local/share/chezmoi/home/dot_config/zellij/layouts
cat > README.md << 'EOF'
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
EOF
```

- [ ] **Step 2: Apply via chezmoi**

Run:
```bash
cd ~/.local/share/chezmoi
chezmoi add home/dot_config/zellij/layouts/README.md
chezmoi apply
```

Expected: README.md created in layouts directory

- [ ] **Step 3: Commit documentation**

```bash
git add home/dot_config/zellij/layouts/README.md
git commit -m "docs(zellij): add layout comparison guide"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `default_layout "main"` is set in config.kdl
- [ ] `zellij` (no args) starts with horizontal status bar
- [ ] New tabs inherit the main layout structure
- [ ] All keybindings work (Alt+f, Alt+d, Alt+r, etc.)
- [ ] Changes are committed to git
- [ ] Documentation exists in layouts/README.md

---

## Rollback Plan

If main.kdl has issues, revert to vertical-tabs:

```bash
cd ~/.local/share/chezmoi
# Edit config.kdl, change line 370 back to:
# default_layout "vertical-tabs"
chezmoi apply
git checkout home/dot_config/zellij/config.kdl
```

---

## Notes

- **main.kdl** uses swap layouts for different tiling patterns (vertical/horizontal/stacked)
- **vertical-tabs.kdl** requires the zellij-vertical-tabs plugin (managed via plugins.toml manifest)
- Both layouts coexist - you can switch between them with `--layout` flag even after changing default
- The default only affects what loads when no `--layout` is specified
