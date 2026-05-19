# Zellij Plugin Management

This directory uses a **manifest-based approach** for managing zellij plugins.

## Philosophy

Plugins are **dependencies**, not configuration. They are:
- Declared in `plugins.toml` (version-pinned with checksums)
- Downloaded on-demand by install script
- Not committed to git (binaries are excluded via `.gitignore`)
- Cached locally for faster reinstalls

This follows the same pattern as:
- `package.json` + `npm install` (Node.js)
- `Cargo.toml` + `cargo build` (Rust)
- `Brewfile` + `brew bundle` (Homebrew)
- `requirements.txt` + `pip install` (Python)

## Files

```
~/.config/zellij/
├── plugins.toml                  # Plugin manifest (tracked in git)
├── scripts/
│   ├── install-plugins.sh        # Install plugins from manifest
│   └── update-plugins.sh         # Check for and update to latest versions
├── plugins/                      # Installed plugins (not tracked in git)
│   ├── zellij-vertical-tabs.wasm
│   ├── zjstatus.wasm
│   └── zjframes.wasm
└── layouts/                      # Zellij layouts
    ├── main.kdl
    └── vertical-tabs.kdl
```

## Quick Start

### Install Plugins

```bash
cd ~/.config/zellij
./scripts/install-plugins.sh
```

Plugins are installed to `~/.config/zellij/plugins/` and cached in `~/.cache/zellij/plugins/`.

### Update Plugins

Check for updates:
```bash
./scripts/update-plugins.sh --check-only
```

Update to latest versions:
```bash
./scripts/update-plugins.sh
```

This checks GitHub for latest releases and updates `plugins.toml` with new versions and checksums.

After updating the manifest:
```bash
./scripts/install-plugins.sh --force  # Download new versions
git diff plugins.toml                 # Review changes
git add plugins.toml && git commit -m "chore: update zellij plugins"
```

### Force Reinstall

```bash
./scripts/install-plugins.sh --force
```

## Usage Examples

### Install a specific plugin

```bash
# Edit plugins.toml to add new plugin
./scripts/install-plugins.sh
```

### Update only one plugin

```bash
./scripts/update-plugins.sh --plugin zjstatus
```

### Check updates without downloading

```bash
./scripts/update-plugins.sh --dry-run
```

## Adding a New Plugin

1. Edit `plugins.toml` and add a new entry:
   ```toml
   [[plugin]]
   name = "my-plugin"
   repo = "user/repo"
   version = "v1.0.0"
   url = "https://github.com/user/repo/releases/download/v1.0.0/my-plugin.wasm"
   sha256 = ""  # Optional: leave empty, update script will calculate
   ```

2. Install the plugin:
   ```bash
   ./scripts/install-plugins.sh
   ```

3. If you didn't provide a SHA256, run:
   ```bash
   ./scripts/update-plugins.sh --plugin my-plugin
   ```

4. Configure in zellij layout or config:
   ```kdl
   plugin location="file:~/.config/zellij/plugins/my-plugin.wasm" {
       // plugin configuration
   }
   ```

## Automatic Installation (Chezmoi)

When you run `chezmoi apply`, plugins are automatically installed if `plugins.toml` has changed.

This uses the `run_onchange_before_install-zellij-plugins.sh.tmpl` hook, which:
- Detects manifest changes via hash
- Runs install script automatically
- Ensures plugins are always in sync with manifest

## Plugin Locations

| Location | Purpose |
|----------|---------|
| `~/.config/zellij/plugins.toml` | Manifest (tracked in git) |
| `~/.config/zellij/plugins/*.wasm` | Installed plugins (not tracked) |
| `~/.cache/zellij/plugins/` | Download cache (for faster reinstalls) |
| `~/.zellij/plugins/` | Symlinks (backward compatibility) |

## Installed Plugins

### zellij-vertical-tabs

Vertical tab bar plugin for zellij.

**Repository**: https://github.com/cfal/zellij-vertical-tabs

**Usage**:
```bash
zellij --layout vertical-tabs
```

**Features**:
- 18-column vertical tab bar on the **right** side
- Mouse clickable tabs
- Status indicators: `*` (active), `Z` (fullscreen), `S` (sync)
- Tab format: `1:shell`, `2:editor`, etc.
- **Automatic**: New tabs (Ctrl+Shift+t) and pane splits preserve the vertical tab bar

**Permissions**: Requires `ReadApplicationState` and `ChangeApplicationState` (press `y` to grant on first use)

**Behavior**:
- ✅ All new tabs automatically have vertical tabs on the right
- ✅ Pane splits (Alt+d, Alt+r) preserve tab bar position
- ✅ Consistent layout across all tabs in the session

**Applying to running sessions**:
```bash
# Override layout in current tab (and future tabs in this session)
zellij action override-layout vertical-tabs

# Or start a new session with vertical tabs
zellij --layout vertical-tabs
```

### zjstatus

Status bar plugin with customizable formatting.

**Repository**: https://github.com/dj95/zjstatus

**Usage**: Configured in layouts (see `layouts/main.kdl` and `layouts/vertical-tabs.kdl`)

**Features**:
- Customizable status bar with mode indicators
- Tab formatting with icons
- Date/time display
- Git branch integration

### zjframes

Frame management plugin for zellij.

**Repository**: https://github.com/dj95/zjstatus

**Usage**: Loaded via `load_plugins` in config:
```kdl
load_plugins {
    "zjframes" {
        hide_frame_for_single_pane       "true"
        hide_frame_except_for_search     "true"
        hide_frame_except_for_scroll     "false"
        hide_frame_except_for_fullscreen "false"
    }
}
```

**Features**:
- Conditionally hides pane frames
- Improves visual clarity
- Configurable per-mode visibility

## Troubleshooting

### Plugin not loading

**Check if installed**:
```bash
ls ~/.config/zellij/plugins/
```

**Verify path in layout/config**:
Ensure `location="file:~/.config/zellij/plugins/plugin-name.wasm"` matches the installed file.

**Check zellij logs**:
```bash
tail -f ~/.cache/zellij/zellij-log/*
```

### Download fails

**Check internet connection**:
```bash
curl -I https://github.com
```

**Verify URL in manifest**:
Open `plugins.toml` and check the `url` field is correct.

**Try manual download**:
```bash
curl -L <url> -o /tmp/test-plugin.wasm
file /tmp/test-plugin.wasm  # Should say "WebAssembly"
```

**Check if GitHub release exists**:
Visit the repo and check the releases page.

### Checksum mismatch

**Plugin binary may have been updated** without version bump on GitHub.

**Solutions**:
1. Update manifest to latest: `./scripts/update-plugins.sh --plugin <name>`
2. Remove SHA256 from manifest (skip verification): edit `plugins.toml` and set `sha256 = ""`
3. Recalculate manually:
   ```bash
   curl -L <url> | sha256sum
   ```

### Script not executable

```bash
chmod +x ~/.config/zellij/scripts/*.sh
```

### Missing dependencies

**Required**:
- `curl` - Download plugins
- `sha256sum` - Verify checksums
- `file` - Validate WASM binaries

**For update script**:
- `jq` - Parse GitHub API responses

**Install on CachyOS/Arch**:
```bash
sudo pacman -S curl coreutils file jq
```

## Why This Approach?

### Advantages Over Committing Binaries

✅ **Small git repository**
- Manifest: ~1KB (text file)
- Binaries: ~7MB (not tracked)
- Git history stays clean

✅ **Clear version tracking**
- Text diffs show version changes
- Easy code review: `git diff plugins.toml`
- See exactly what changed and when

✅ **Easy updates**
- Run script, review diff, commit
- No manual binary downloads
- Automated with CI/CD if desired

✅ **Industry standard pattern**
- Matches Node.js, Rust, Python, Homebrew workflows
- Familiar to developers
- Best practice for dotfiles

✅ **Integrity checks**
- SHA256 verification prevents corruption/tampering
- Trust but verify downloads

✅ **Cache for offline use**
- Downloaded plugins cached in `~/.cache/`
- Reinstalls use cache (no redownload)
- Fallback if download fails

✅ **No git history bloat**
- Binaries not in history
- Fast clone/pull operations
- GitHub repo stays under limits

### Trade-offs

⚠ **Requires internet on first install**
- Cached thereafter
- Same as any package manager

⚠ **One extra step vs "just works"**
- Run install script once
- Then automatic via chezmoi hooks

⚠ **Trust GitHub releases**
- Same as npm, cargo, pip, etc.
- SHA256 verification mitigates risk

### Comparison with Binary-in-Git Approach

| Aspect | Binaries in Git | Manifest + Scripts |
|--------|----------------|-------------------|
| **Repo Size** | ~7MB + history | ~1KB manifest |
| **Readability** | Binary blob, opaque | Text file, readable |
| **Diffing** | Useless | Shows version/URL changes |
| **Update Process** | Manual download + commit | Run update script |
| **Traceability** | None | URL + version in manifest |
| **Security** | No integrity checks | SHA256 checksums |
| **Git Best Practice** | ❌ Anti-pattern | ✅ Standard |
| **Collaboration** | Merge conflicts painful | Text merge |

## Advanced Usage

### Custom Plugin Directory

```bash
ZELLIJ_PLUGIN_DIR=/path/to/plugins ./scripts/install-plugins.sh
```

### Custom Cache Directory

```bash
ZELLIJ_CACHE_DIR=/path/to/cache ./scripts/install-plugins.sh
```

### Automation with Cron

Check for plugin updates daily:
```cron
0 9 * * * cd ~/.config/zellij && ./scripts/update-plugins.sh --check-only
```

### CI/CD Integration

Automatically update plugins in CI:
```yaml
- name: Check for plugin updates
  run: |
    cd ~/.config/zellij
    ./scripts/update-plugins.sh
    if git diff --quiet plugins.toml; then
      echo "No updates"
    else
      git config user.name "Bot"
      git config user.email "bot@example.com"
      git add plugins.toml
      git commit -m "chore: update zellij plugins"
      git push
    fi
```

## Related Documentation

- [Zellij Plugin System](https://zellij.dev/documentation/plugins)
- [Zellij Configuration](https://zellij.dev/documentation/configuration)
- [Chezmoi Hooks](https://www.chezmoi.io/user-guide/use-scripts-to-perform-actions/)

## Credits

- **zellij-vertical-tabs**: [cfal/zellij-vertical-tabs](https://github.com/cfal/zellij-vertical-tabs)
- **zjstatus**: [dj95/zjstatus](https://github.com/dj95/zjstatus)
- **zjframes**: [dj95/zjstatus](https://github.com/dj95/zjstatus)
