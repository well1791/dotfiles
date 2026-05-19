# Fix Zellij Plugin Permission Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the annoying permission prompt that appears every time zellij starts, asking to allow ReadApplicationState, ChangeApplicationState, and RunCommands for the zjstatus plugin.

**Architecture:** The issue is caused by main.kdl loading zjstatus from a remote URL. Zellij requests permissions for remote plugins on every load. The fix is to install zjstatus locally via the existing plugins.toml manifest and update main.kdl to use the local file path. Optionally add automatic permission grants in config.kdl.

**Tech Stack:** Zellij 0.44.3, chezmoi dotfiles manager, shell scripts

---

## Root Cause Analysis

**Current State:**
- `main.kdl` loads zjstatus from remote URL: `https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm`
- `plugins.toml` declares zjstatus v0.21.0 but the plugin was never installed locally
- `plugins/` directory only contains `zjframes.wasm` and `zellij-vertical-tabs.wasm`
- Zellij asks for permissions on every remote plugin load (security feature)

**Why this happens:**
- Remote plugins are untrusted by default
- Local plugins with explicit permission grants don't prompt
- The install-plugins.sh script exists but zjstatus was never run through it

---

### Task 1: Install zjstatus Plugin Locally

**Files:**
- Execute: `home/dot_config/zellij/scripts/executable_install-plugins.sh`
- Verify: `~/.config/zellij/plugins/zjstatus.wasm`

- [ ] **Step 1: Check current plugin directory**

Run:
```bash
ls -lh ~/.config/zellij/plugins/
```

Expected output:
```
zjframes.wasm
zellij-vertical-tabs.wasm
```

Note: zjstatus.wasm is missing

- [ ] **Step 2: Run install-plugins script**

Run:
```bash
cd ~/.config/zellij/scripts
./install-plugins.sh
```

Expected output:
```
Installing zellij plugins from: ~/.config/zellij/plugins.toml
Target directory: ~/.config/zellij/plugins

✓ zellij-vertical-tabs (v0.1.0) already installed
✓ zjframes (v0.21.0) already installed
  → Downloading zjstatus (v0.21.0)...
    Fetching from: https://github.com/dj95/zjstatus/releases/download/v0.21.0/zjstatus.wasm
    ✓ Downloaded successfully
    ✓ Valid WASM binary
    ✓ Checksum verified
    ✓ Installed to ~/.config/zellij/plugins/zjstatus.wasm

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Installed: 1 plugin(s)
✓ Skipped: 2 plugin(s) (already installed)

✓ All plugins ready!
```

- [ ] **Step 3: Verify zjstatus.wasm exists**

Run:
```bash
ls -lh ~/.config/zellij/plugins/zjstatus.wasm
file ~/.config/zellij/plugins/zjstatus.wasm
```

Expected:
```
-rw-r--r-- 1 well well 1.1M may 19 16:30 ~/.config/zellij/plugins/zjstatus.wasm
~/.config/zellij/plugins/zjstatus.wasm: WebAssembly (wasm) binary module version 0x1 (MVP)
```

- [ ] **Step 4: Note file size for verification**

The downloaded zjstatus.wasm should be approximately 1.1-1.2 MB in size. If it's significantly different, the download may have failed.

---

### Task 2: Update main.kdl to Use Local Plugin

**Files:**
- Modify: `home/dot_config/zellij/layouts/main.kdl:97`

- [ ] **Step 1: Locate the remote plugin reference**

Run:
```bash
cd ~/.local/share/chezmoi
grep -n "zjstatus" home/dot_config/zellij/layouts/main.kdl
```

Expected output:
```
97:            plugin location="https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm" {
```

- [ ] **Step 2: Change remote URL to local file path**

Open `home/dot_config/zellij/layouts/main.kdl` and find line 97:

```kdl
plugin location="https://github.com/dj95/zjstatus/releases/latest/download/zjstatus.wasm" {
```

Change to:

```kdl
plugin location="file:~/.config/zellij/plugins/zjstatus.wasm" {
```

Note: Use `file:` prefix and tilde `~` for home directory expansion.

- [ ] **Step 3: Verify KDL syntax**

Run:
```bash
cd ~/.local/share/chezmoi
grep -A 2 "plugin location.*zjstatus" home/dot_config/zellij/layouts/main.kdl
```

Expected output:
```kdl
plugin location="file:~/.config/zellij/plugins/zjstatus.wasm" {
    format_left   "{mode}#[bg=#181926] {tabs}"
    format_center ""
```

- [ ] **Step 4: Apply changes via chezmoi**

Run:
```bash
cd ~/.local/share/chezmoi
chezmoi apply ~/.config/zellij/layouts/main.kdl
```

Expected: No errors, file updated

- [ ] **Step 5: Commit the change**

```bash
git add home/dot_config/zellij/layouts/main.kdl
git commit -m "fix(zellij): use local zjstatus plugin to avoid permission prompts"
```

---

### Task 3: Add Automatic Permission Grants (Optional but Recommended)

**Files:**
- Modify: `home/dot_config/zellij/config.kdl` (after plugins section)

- [ ] **Step 1: Find the plugins section in config.kdl**

Run:
```bash
cd ~/.local/share/chezmoi
grep -n "^plugins {" home/dot_config/zellij/config.kdl
```

Expected output:
```
269:plugins {
```

- [ ] **Step 2: Locate end of plugins block**

Run:
```bash
cd ~/.local/share/chezmoi
sed -n '269,290p' home/dot_config/zellij/config.kdl
```

This will show the plugins section. Find where it ends (the closing `}` bracket).

- [ ] **Step 3: Add auto-grant permission configuration**

Add this block after the `plugins {` section closes (around line 293):

```kdl
// Auto-grant permissions for trusted local plugins
// Eliminates permission prompts on every session start
auto_grant_permissions {
    // zjstatus needs state access to display tabs, mode, session info
    "file:~/.config/zellij/plugins/zjstatus.wasm" {
        ReadApplicationState = true
        ChangeApplicationState = false
        RunCommands = false
    }
    
    // zjframes needs state access to manage pane frames
    "file:~/.config/zellij/plugins/zjframes.wasm" {
        ReadApplicationState = true
        ChangeApplicationState = false
        RunCommands = false
    }
    
    // Vertical tabs plugin
    "file:~/.config/zellij/plugins/zellij-vertical-tabs.wasm" {
        ReadApplicationState = true
        ChangeApplicationState = false
        RunCommands = false
    }
}
```

Note: We grant only ReadApplicationState, not the more dangerous ChangeApplicationState or RunCommands unless actually needed.

- [ ] **Step 4: Apply via chezmoi**

Run:
```bash
cd ~/.local/share/chezmoi
chezmoi apply ~/.config/zellij/config.kdl
```

Expected: No errors

- [ ] **Step 5: Commit the permission grants**

```bash
git add home/dot_config/zellij/config.kdl
git commit -m "config(zellij): auto-grant read permissions for local plugins"
```

---

### Task 4: Test Permission Fix

**Files:**
- Test: All zellij functionality

- [ ] **Step 1: Kill all existing zellij sessions**

Run:
```bash
zellij kill-all-sessions -y
```

Expected: All sessions terminated

- [ ] **Step 2: Start fresh zellij session**

Run:
```bash
zellij
```

Expected:
- Zellij starts immediately
- **NO permission prompt appears**
- Status bar displays correctly at top
- No errors in the display

- [ ] **Step 3: Verify status bar functionality**

Check that the status bar shows:
- Current mode (NOR = normal mode)
- Tab list with current tab highlighted
- Swap layout indicator
- Session name on the right

- [ ] **Step 4: Test creating new tabs and panes**

Execute these commands:
- `Alt+f` - Create new tab
- `Alt+d` - Split pane down
- `Alt+r` - Split pane right

Expected: 
- No permission prompts on any action
- Status bar updates correctly
- All actions work smoothly

- [ ] **Step 5: Detach and reattach to verify persistence**

Press: `Alt+Ctrl+o` then `d` (detach)

Then run:
```bash
zellij attach
```

Expected:
- Attaches to existing session
- **NO permission prompt**
- Status bar visible and working

- [ ] **Step 6: Test new session (complete restart)**

Run:
```bash
zellij kill-all-sessions -y
zellij
```

Expected:
- Fresh session starts
- **NO permission prompt**
- Everything works

---

### Task 5: Document Plugin Permission System

**Files:**
- Update: `home/dot_config/zellij/README.md`

- [ ] **Step 1: Add permission documentation section**

Append to `home/dot_config/zellij/README.md`:

```bash
cd ~/.local/share/chezmoi/home/dot_config/zellij
cat >> README.md << 'EOF'

## Plugin Permissions

Zellij plugins can request three types of permissions:
- **ReadApplicationState** - Read session, tab, pane information
- **ChangeApplicationState** - Modify zellij state (create tabs, etc.)
- **RunCommands** - Execute shell commands

### Auto-Granted Permissions

Local plugins in `~/.config/zellij/plugins/` have auto-granted permissions configured in `config.kdl`:

| Plugin | Read | Change | Run |
|--------|------|--------|-----|
| zjstatus.wasm | ✓ | ✗ | ✗ |
| zjframes.wasm | ✓ | ✗ | ✗ |
| zellij-vertical-tabs.wasm | ✓ | ✗ | ✗ |

### Why Auto-Grant?

- **Remote plugins** (loaded via HTTP URL) always prompt for security
- **Local plugins** (loaded via `file:` path) can be auto-granted
- Prevents annoying permission prompts on every session start
- Only grants minimum required permissions (read-only where possible)

### Adding New Plugins

When adding a new plugin to `plugins.toml`:

1. Run `./scripts/install-plugins.sh` to download it
2. Update layout files to use `file:~/.config/zellij/plugins/<name>.wasm`
3. Add auto-grant entry in `config.kdl` if it needs permissions
4. Test that no permission prompts appear

### Troubleshooting

**Q: Still seeing permission prompts?**
- Check that the plugin uses `file:` path, not HTTP URL
- Verify auto_grant_permissions block exists in config.kdl
- Confirm plugin file exists: `ls ~/.config/zellij/plugins/`

**Q: Plugin not working after switching to local file?**
- Verify plugin downloaded correctly: `file ~/.config/zellij/plugins/<name>.wasm`
- Check file permissions: `chmod 644 ~/.config/zellij/plugins/*.wasm`
- Kill sessions and restart: `zellij kill-all-sessions -y && zellij`
EOF
```

- [ ] **Step 2: Apply documentation**

Run:
```bash
cd ~/.local/share/chezmoi
chezmoi apply ~/.config/zellij/README.md
```

- [ ] **Step 3: Commit documentation**

```bash
git add home/dot_config/zellij/README.md
git commit -m "docs(zellij): add plugin permission system guide"
```

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `zjstatus.wasm` exists in `~/.config/zellij/plugins/`
- [ ] `main.kdl` uses `file:~/.config/zellij/plugins/zjstatus.wasm`
- [ ] `auto_grant_permissions` block exists in `config.kdl`
- [ ] Starting zellij shows NO permission prompt
- [ ] Status bar displays and functions correctly
- [ ] Creating tabs/panes shows NO permission prompt
- [ ] Detaching and reattaching shows NO permission prompt
- [ ] All changes committed to git

---

## Expected Behavior After Fix

**Before:**
```
$ zellij
this plugin asks permission to: ReadApplicationState, ChangeApplicationState, RunCommands
Allow? (y/n) _
```

**After:**
```
$ zellij
[zellij starts immediately with status bar visible, no prompts]
```

---

## Technical Notes

### Why Remote Plugins Prompt

Zellij treats plugins loaded via HTTP/HTTPS as untrusted because:
- They could be modified at the source
- No integrity verification (unless you pin versions)
- Potential security risk for state access or command execution

### Why Local Plugins Don't Prompt (with auto-grant)

Local plugins with `file:` prefix can be:
- Verified with checksums (via plugins.toml manifest)
- Controlled by the user
- Auto-granted specific permissions in config.kdl
- Considered "trusted" since they're on your filesystem

### Minimal Permission Principle

The auto-grant configuration only grants `ReadApplicationState` because:
- Status bars only need to READ state (tabs, mode, session info)
- They don't need to CHANGE state or RUN commands
- Granting only necessary permissions follows security best practices
- If a plugin actually needs more, we'll know because it won't work

---

## Rollback Plan

If issues occur after changes:

```bash
cd ~/.local/share/chezmoi

# Revert main.kdl to remote URL
git checkout home/dot_config/zellij/layouts/main.kdl

# Remove auto-grant permissions
git checkout home/dot_config/zellij/config.kdl

# Apply reverted config
chezmoi apply

# Restart zellij
zellij kill-all-sessions -y
zellij
```

You'll see permission prompts again, but the status bar will work.
