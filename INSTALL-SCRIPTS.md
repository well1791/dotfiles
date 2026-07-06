# Installation Scripts System

A refactored, DRY installation system for chezmoi-managed dotfiles. All scripts share a common POSIX sh library, reducing duplication by ~67% and adding consistent error handling, logging, and dry-run support.

## Architecture

```
chezmoi apply
    │
    ├── .chezmoi.toml.tmpl               ← Feature flags (distro, ephemeral, headless, work, personal)
    │
    ├── .chezmoidata/tools.yaml          ← Declarative tool configs (25 tools)
    │
    ├── .chezmoiexternal.toml.tmpl       ← Declarative external deps (GitHub releases, fonts)
    │
    ├── .chezmoiignore.tmpl              ← Distro + feature-flag exclusions
    │
    ├── .chezmoiremove.tmpl              ← Files to actively remove from target
    │
    ├── .chezmoitemplates/
    │   ├── install-lib.sh               ← Shared function library (23 functions)
    │   ├── install-header.sh.tmpl       ← Script header snippet
    │   ├── install-check.sh.tmpl        ← Tool check snippet
    │   ├── install-download.sh.tmpl     ← Download installer snippet
    │   ├── install-package.sh.tmpl      ← Package install snippet
    │   └── install-verify.sh.tmpl       ← Verification snippet
    │
    └── .chezmoiscripts/
        ├── run_onchange_before_*-install-*.sh.tmpl  ← Generic installs (distro-agnostic)
        ├── run_once_after_*-configure-*.sh.tmpl    ← One-shot configure scripts
        ├── arch/                                   ← Arch/CachyOS-specific (paru/AUR)
        │   └── run_onchange_before_*-install-*.sh.tmpl
        ├── debian/                                 ← Debian/Ubuntu-specific (future)
        └── fedora/                                 ← Fedora/RHEL-specific (future)
```

### Script Naming Convention

- **`run_onchange_before_`** — Install scripts. Re-run automatically when script content changes.
- **`run_onchange_after_`** — Post-install scripts that should re-run on content change.
- **`run_once_before_`** — One-shot scripts that run exactly once ever (rare).
- **`run_once_after_`** — One-shot configure scripts (e.g., firewall setup, shell change).

### Distro Separation

Scripts that use distro-specific package managers directly (paru, AUR, apt-specific repos) go in a subdirectory:
- `arch/` — for Arch-family distros (arch, cachyos, manjaro, endeavouros)
- `debian/` — for Debian-family (ubuntu, debian, linuxmint, pop)
- `fedora/` — for RHEL-family (fedora, rhel, centos, rocky)

Scripts using `install_packages` (the abstraction layer) stay at the top level since the library handles distro detection automatically.

`.chezmoiignore.tmpl` excludes non-matching distro directories based on the `distro` feature flag.

### How It Works

1. **chezmoi renders** `.tmpl` scripts using Go templates, resolving `{{ .chezmoi.sourceDir }}` paths
2. **Each script sources** `install-lib.sh` at runtime via the `install-header.sh.tmpl` snippet
3. **The library auto-initializes** OS detection and caches the package manager
4. **Scripts call library functions** (`install_packages`, `download_and_run`, etc.) instead of duplicating logic
5. **DRY_RUN mode** is respected by all mutating operations when `DRY_RUN=1` is set

### Data Flow

```
tools.yaml (what to install)
    → Go templates (how to structure the script)
        → install-lib.sh (how to actually do it)
            → System (pacman/apt/dnf/apk/curl/wget)
```

---

## Library API Reference

The library lives at `home/.chezmoitemplates/install-lib.sh` (437 LOC, POSIX sh).

### Logging Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `log_success` | `log_success MSG [DETAIL]` | Print `✓ MSG (DETAIL)` |
| `log_warn` | `log_warn MSG` | Print `⚠ MSG` |
| `log_error` | `log_error MSG` | Print `✗ MSG` to stderr |
| `log_info` | `log_info MSG` | Print plain message |
| `log_version` | `log_version TOOL` | Print version if installed, return 0/1 |

**Examples:**

```sh
log_success "bun installed" "$(bun --version)"   # ✓ bun installed (1.0.0)
log_warn "not in PATH yet"                       # ⚠ not in PATH yet
log_error "installation failed"                  # ✗ installation failed (stderr)

# Combined check + version display:
if log_version uv; then
    exit 0  # Already installed, nothing to do
fi
```

### Checks Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `check_command` | `check_command CMD` | Silent check if command exists (0/1) |
| `require_command` | `require_command CMD [MSG]` | Check or die |
| `check_any_command` | `check_any_command CMD1 CMD2 ...` | Any one exists? (0/1) |
| `require_any_command` | `require_any_command MSG CMD1 CMD2 ...` | At least one or die |

**Examples:**

```sh
if check_command curl; then
    curl -O "$url"
fi

require_command git "git is required for this installation"

# Flexible downloader requirement:
require_any_command "curl or wget required" curl wget
```

### Errors Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `die` | `die MSG [CODE]` | Print error and exit (default code: 1) |
| `require` | `require COND MSG` | Assert condition or die |
| `fail_if` | `fail_if COND MSG` | Die if condition is true |

**Examples:**

```sh
die "Installation failed" 2

require "-f /etc/os-release" "Cannot detect OS"
fail_if "-z \"$HOME\"" "HOME is not set"
```

### Versions Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `get_version` | `get_version CMD [FLAG]` | Print first line of `CMD FLAG` output |

**Examples:**

```sh
version=$(get_version uv)            # Uses --version by default
version=$(get_version nix "-V")      # Custom flag
```

### OS Detection Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `detect_os` | `detect_os` | Load `/etc/os-release`, populate cache |
| `get_os_id` | `get_os_id` | Get distro ID (arch, ubuntu, fedora...) |
| `get_os_family` | `get_os_family` | Get family (arch, debian, rhel, alpine) |

**Supported families and their distros:**

| Family | Distros | Package Manager |
|--------|---------|-----------------|
| `arch` | arch, cachyos, manjaro, endeavouros | pacman |
| `debian` | ubuntu, debian, linuxmint, pop | apt |
| `rhel` | fedora, rhel, centos, rocky, almalinux | dnf |
| `alpine` | alpine | apk |

Unknown distros fall back to `ID_LIKE` from `/etc/os-release`.

**Examples:**

```sh
detect_os || die "Cannot detect OS"

case "$(get_os_family)" in
    arch)   echo "Arch-based" ;;
    debian) echo "Debian-based" ;;
esac
```

### Package Management Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `detect_pkg_manager` | `detect_pkg_manager` | Print package manager name |
| `install_packages` | `install_packages PKG1 [PKG2 ...]` | Install via system PM |
| `update_package_cache` | `update_package_cache` | Refresh package database |

**Examples:**

```sh
install_packages helix ripgrep bat eza

# For tools needing a cache refresh first:
update_package_cache
install_packages some-new-package
```

### Privileged Operations Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `run_privileged` | `run_privileged CMD [ARGS...]` | Run with sudo |

**Examples:**

```sh
run_privileged systemctl enable ufw.service
run_privileged pacman -S --noconfirm extra-package
```

### Download Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `fetch_url` | `fetch_url URL [OUTPUT]` | Download (stdout or file) |
| `download_and_run` | `download_and_run URL [MSG]` | Download and pipe to sh |

**Examples:**

```sh
# Save to file:
fetch_url "https://example.com/binary" /tmp/binary

# Pipe to stdout:
config=$(fetch_url "https://example.com/config")

# Download and execute installer:
download_and_run "https://astral.sh/uv/install.sh" "Installing uv..."
```

### Utility Module

| Function | Signature | Description |
|----------|-----------|-------------|
| `is_dry_run` | `is_dry_run` | Returns 0 if `DRY_RUN=1` |

**Examples:**

```sh
if is_dry_run; then
    echo "Would do something dangerous here"
else
    do_something_dangerous
fi
```

---

## How to Add a New Tool

### Step 1: Add to `tools.yaml`

Add an entry in `home/.chezmoidata/tools.yaml`:

```yaml
  - name: my-tool
    description: What my-tool does
    type: run_onchange_before
    priority: 55                    # Controls execution order (00-99)
    check:
      commands: [my-tool]           # Command(s) to verify it's installed
      version_flag: "--version"     # How to get version (default)
    install:
      method: download              # package | download | cargo | aur | custom
      url: "https://example.com/install.sh"
    dependencies: [curl]            # Tools that must exist first
    os_support: all                 # Or: [arch, debian, fedora]
    skip_if_exists: true
```

### Step 2: Create the script

For **distro-agnostic** installs (uses `install_packages`):

Create `home/.chezmoiscripts/run_onchange_before_55-install-my-tool.sh.tmpl`:

```sh
{{ template "install-header.sh.tmpl" . }}
# Install my-tool (what it does)
# https://example.com/my-tool

# Skip if already installed
if log_version my-tool; then
    exit 0
fi

# Install via official installer
require_any_command "curl or wget required" curl wget
download_and_run "https://example.com/install.sh" "Installing my-tool..."

# Verify
if check_command my-tool; then
    log_success "my-tool installed" "$(get_version my-tool)"
else
    log_warn "my-tool may not be in PATH. Restart your shell."
fi
```

For **distro-specific** installs (e.g., AUR on Arch):

Create `home/.chezmoiscripts/arch/run_onchange_before_55-install-my-tool.sh.tmpl`:

### Step 3: Test with dry-run

```sh
DRY_RUN=1 chezmoi apply --include=scripts
```

### Common Patterns

**System package install (distro-agnostic, goes in `.chezmoiscripts/`):**

```sh
{{ template "install-header.sh.tmpl" . }}
if log_version my-pkg; then exit 0; fi
install_packages my-pkg
log_success "my-pkg installed" "$(get_version my-pkg)"
```

**AUR package (Arch only, goes in `.chezmoiscripts/arch/`):**

```sh
{{ template "install-header.sh.tmpl" . }}
if log_version my-aur-tool; then exit 0; fi

if ! check_command paru && ! check_command yay; then
    die "AUR helper (paru or yay) required"
fi

if is_dry_run; then
    log_info "[DRY RUN] Would install my-aur-tool from AUR"
    exit 0
fi

if check_command paru; then
    paru -S --noconfirm my-aur-tool
elif check_command yay; then
    yay -S --noconfirm my-aur-tool
fi
```

**Tool with dependencies:**

```sh
{{ template "install-header.sh.tmpl" . }}
if log_version my-tool; then exit 0; fi

# Ensure dependencies
if ! check_command unzip; then
    install_packages unzip
fi

require_any_command "curl or wget required" curl wget
download_and_run "https://example.com/install.sh" "Installing my-tool..."
```

**Configuration script (one-shot, goes in `.chezmoiscripts/`):**

```sh
{{ template "install-header.sh.tmpl" . }}
# Configure something after installation
require_command my-tool "my-tool must be installed first"

log_info "Configuring my-tool..."
run_privileged systemctl enable my-tool.service
log_success "my-tool configured"
```

---

## DRY_RUN Mode

All mutating operations respect `DRY_RUN=1`:

```sh
# Preview what would happen without making changes:
DRY_RUN=1 chezmoi apply --include=scripts

# Or run a single script:
DRY_RUN=1 sh /path/to/rendered-script.sh
```

### What gets logged (not executed) in dry-run:

| Operation | Dry-run output |
|-----------|----------------|
| `install_packages vim` | `[DRY RUN] Would install packages: vim` |
| `download_and_run URL` | `[DRY RUN] Would download and execute: URL` |
| `run_privileged systemctl ...` | `[DRY RUN] Would run: sudo systemctl ...` |
| `fetch_url URL file` | `[DRY RUN] Would fetch: URL` |
| `update_package_cache` | `[DRY RUN] Would update package cache (pacman)` |

### What still runs normally in dry-run:

- `check_command` / `require_command` (read-only checks)
- `detect_os` / `get_os_family` (read-only detection)
- `log_*` functions (output only)
- `get_version` (read-only)

---

## Troubleshooting

### Library not found

```
.: cannot open .chezmoitemplates/install-lib.sh: No such file or directory
```

**Cause**: Script was run directly instead of through chezmoi.
**Fix**: Run via `chezmoi apply` or ensure `CHEZMOI_SOURCE_DIR` is set:
```sh
CHEZMOI_SOURCE_DIR="$HOME/.local/share/chezmoi/home" sh script.sh
```

### Package manager not detected

```
✗ Cannot detect package manager for this system
```

**Cause**: Your distro isn't in the supported list and `ID_LIKE` doesn't match either.
**Fix**: Check `/etc/os-release` — if `ID` or `ID_LIKE` don't match arch/debian/rhel/alpine, add your distro to `detect_os()` in `install-lib.sh`.

### Script fails with "command not found" after installation

**Cause**: New binary isn't in the current `$PATH` yet.
**Fix**: Restart your shell or source the appropriate profile:
```sh
# For tools in ~/.local/bin:
export PATH="$HOME/.local/bin:$PATH"

# For bun:
export PATH="$HOME/.bun/bin:$PATH"

# For nix:
. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh
```

### Shellcheck warnings in templates

**Note**: Shellcheck doesn't understand Go template syntax (`{{ }}`). To validate:
```sh
# Render first, then check:
chezmoi execute-template < script.sh.tmpl | shellcheck --shell=sh -
```

### Double-sourcing warnings

The library has a guard (`_INSTALL_LIB_LOADED`) — sourcing it multiple times is safe and produces no output.

