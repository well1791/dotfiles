# github.com/well1791/dotfiles

Well's dotfiles, managed with [`chezmoi`](https://github.com/twpayne/chezmoi).

## What Gets Installed

During the initial setup, the following tools are automatically installed:

### 0. **[age](https://github.com/FiloSottile/age)** - Simple, modern encryption tool
- Required for chezmoi to decrypt encrypted secrets (API keys, etc.)
- Installed via system package manager (pacman/apt/dnf)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 1. **[Nix](https://nixos.org/)** - Reproducible package manager
- Installed via [Determinate Systems installer](https://github.com/DeterminateSystems/nix-installer)
- Enables declarative, reproducible development environments
- Required for devenv
- Update: `sudo nix-channel --update && nix-env -u`

### 2. **[mise](https://mise.jdx.dev)** - Polyglot runtime manager
- Manages multiple language runtimes (Python, Node, Go, Rust, etc.)
- Installed to `~/.local/bin/mise`
- Update: `mise self-update`

### 3. **[devenv](https://devenv.sh)** - Declarative developer environments
- Built on Nix for reproducible project setups
- Includes LSPs, formatters, linters out of the box
- Update: `devenv update`

### 4. **[uv](https://github.com/astral-sh/uv)** - Fast Python package manager
- 10-100x faster than pip, replaces pip/pipx/poetry/pyenv
- Installed to `~/.local/bin/uv` and `~/.local/bin/uvx`
- Update: `uv self update`

### 5. **[Rust](https://www.rust-lang.org/)** - Systems programming language
- Installed via [rustup](https://rustup.rs) (official Rust toolchain installer)
- Includes: rustc (compiler), cargo (package manager), rustup (toolchain manager)
- Installed to `~/.cargo/bin/`
- Update: `rustup update`

### 6. **[Podman](https://podman.io)** - Daemonless container engine
- Docker-compatible, rootless container support
- Installed via system package manager (pacman/apt/dnf)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 7. **[Bun](https://bun.sh)** - Fast all-in-one JavaScript runtime
- Drop-in replacement for Node.js, with built-in bundler, test runner, package manager
- Installed to `~/.bun/bin/bun`
- Update: `bun upgrade`

### 8. **[engram](https://github.com/Gentleman-Programming/engram)** - AI task and workflow manager
- CLI tool for managing AI-powered tasks and workflows
- Installed to `~/.local/bin/engram` (via GitHub binary)
- Update: Run installation script again or use `update-all`

### 9. **[atuin](https://atuin.sh/)** - Magical shell history
- Replaces default shell history with searchable, syncable database
- Installed via system package manager (pacman/apt/dnf) or shell script
- Fish shell integration: `atuin init fish | source`
- Update: `atuin update` or `sudo pacman -Syu`

### 10. **[pi](https://pi.dev)** - Terminal coding agent
- Minimal terminal coding harness with AI-powered assistance
- Installed via bun: `~/.bun/bin/pi`
- Package: `@earendil-works/pi-coding-agent`
- Update: `bun install -g @earendil-works/pi-coding-agent`

### 11. **Essential CLI Tools** - Modern command-line utilities
Installed via system package manager (pacman/apt/dnf):
- **[Helix](https://helix-editor.com/)** - Modern modal text editor
- **[ripgrep](https://github.com/BurntSushi/ripgrep)** - Fast grep alternative (`rg`)
- **[Yazi](https://yazi-rs.github.io/)** - Terminal file manager
- **[bat](https://github.com/sharkdp/bat)** - Cat with syntax highlighting
- **[duf](https://github.com/muesli/duf)** - Modern disk usage tool
- **[eza](https://eza.rocks/)** - Modern ls replacement
- **[glow](https://github.com/charmbracelet/glow)** - Terminal markdown reader with TUI
- **[serpl](https://github.com/yassinebridi/serpl)** - TUI search and replace tool
- **[just](https://github.com/casey/just)** - Command runner (like make, but better)
- **[tealdeer](https://tealdeer-rs.github.io/tealdeer/)** - Fast tldr client in Rust (`tldr`)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 12. **[television](https://github.com/alexpasmantier/television)** - Fast, hackable fuzzy finder TUI
- Replaces skim/fzf for shell integration (Ctrl-T smart autocomplete, Ctrl-R history)
- Context-aware: detects current command and picks appropriate channel (files, dirs, git branches, etc.)
- Built-in channels: files, dirs, git-branch, git-log, git-diff, env, procs, docker-images, and many more
- Installed via system package manager
- Config: `~/.config/television/config.toml`
- Update: `sudo pacman -Syu` (or your distro's update command)

### 13. **[navi](https://github.com/denisidoro/navi)** - Interactive cheatsheet tool
- Browse and execute cheatsheets from the command line
- **Dependency:** Requires `fzf` (system package) as its interactive finder backend
  - navi uses fzf as a unix pipe filter (stdin → fuzzy select → stdout)
  - This CANNOT be replaced by television (tv is a TUI, not a pipe filter)
- Installed via AUR (paru/yay)
- Config: `~/.config/navi/config.yaml`
- Cheats: `~/.local/share/navi/cheats/` and `~/.config/navi/custom-cheats/`
- Fish widget: Ctrl+G
- Update: `paru -Syu navi` or `yay -Syu navi`

**Note:** After installation, restart your shell to ensure all tools are in your PATH.

## Updating All Packages

To update all installed tools at once, run:

```bash
update-all
```

This single command updates:
- ✅ System packages (age, podman, helix, ripgrep, yazi, bat, duf, eza, glow, serpl, just, tealdeer)
- ✅ mise and mise-managed runtimes (go, node, etc.)
- ✅ uv (Python package manager)
- ✅ Rust (rustup update)
- ✅ Nix channels and packages
- ✅ devenv
- ✅ Bun (if installed)
- ✅ engram (if installed)
- ✅ atuin (shell history)
- ✅ pi coding agent (if installed via bun)

The script automatically detects your package manager and updates everything accordingly.

## API Keys Setup

API keys are encrypted using [age](https://github.com/FiloSottile/age) and stored securely in the dotfiles repository.

### On your current machine:

Your API keys are already configured and encrypted in `~/.config/fish/api-keys.fish` (decrypted automatically by chezmoi).

### On a new machine:

1. **Copy your age encryption key** (one-time setup):
   ```bash
   # Copy from your current machine
   scp ~/.config/chezmoi/key.txt new-machine:~/.config/chezmoi/key.txt
   
   # Or regenerate (will need to re-encrypt all secrets)
   chezmoi age decrypt --output ~/.config/chezmoi/key.txt
   ```

2. **Bootstrap dotfiles** (this will decrypt API keys automatically):
   ```bash
   chezmoi init --apply well1791
   ```

3. **Verify keys are loaded**:
   ```bash
   fish -c 'echo $BRAVE_API_KEY'
   ```

### Adding or updating API keys:

1. Edit the decrypted file:
   ```bash
   chezmoi edit --watch ~/.config/fish/api-keys.fish
   ```

3. Commit the encrypted file:
   ```bash
   cd ~/.local/share/chezmoi
   git add home/dot_config/fish/encrypted_api-keys.fish.age
   git commit -m "chore(api-keys): update api keys"
   ```

### Available API integrations:

- **Brave Search API** - Used by the `brave-search` skill for web search
  - Get your key at: https://api-dashboard.search.brave.com/register
  - Already configured: `BRAVE_API_KEY`

**⚠️ Important:** Back up `~/.config/chezmoi/key.txt` securely! Without it, you cannot decrypt your API keys.

## System Configuration (CachyOS Post-Install)

Additional system-level configurations aligned with [CachyOS post-install recommendations](https://wiki.cachyos.org/configuration/post_install_setup/):

### Security

#### Firewall (UFW)

Enabled with default deny incoming, allow outgoing policy.

**What's Protected:**
- ✅ localhost/127.0.0.1 is unaffected (local dev servers work normally)
- ✅ All outgoing connections allowed (API calls, downloads, git, npm, cargo, etc.)
- ✅ Docker/Podman container networking unaffected
- ❌ Incoming connections from external network/internet are blocked

**Common Commands:**

```bash
# Check firewall status
sudo ufw status verbose
sudo ufw status numbered  # Show rule numbers for deletion

# Allow specific ports
sudo ufw allow 22         # SSH
sudo ufw allow 80         # HTTP
sudo ufw allow 443        # HTTPS
sudo ufw allow 8080       # Custom port

# Allow port range
sudo ufw allow 3000:9000/tcp

# Allow from specific network (for dev servers accessed from phone/tablet)
sudo ufw allow from 192.168.0.0/16 to any port 3000:9999 proto tcp

# Delete a rule
sudo ufw status numbered  # Find rule number
sudo ufw delete <number>  # Delete by number

# Disable/Enable firewall
sudo ufw disable          # Stop firewall (temporary until reboot)
sudo ufw enable           # Start firewall

# Disable on boot (permanent)
sudo systemctl disable ufw.service

# Enable on boot
sudo systemctl enable ufw.service

# Reset all rules (nuclear option)
sudo ufw reset

# Completely remove UFW
sudo ufw disable
sudo systemctl disable ufw.service
sudo pacman -Rs ufw
```

**Quick Reference:**

| Action | Command |
|--------|--------|
| Check status | `sudo ufw status verbose` |
| Stop firewall now | `sudo ufw disable` |
| Start firewall now | `sudo ufw enable` |
| Disable on boot | `sudo systemctl disable ufw.service` |
| Enable on boot | `sudo systemctl enable ufw.service` |
| Allow port | `sudo ufw allow <port>` |
| Delete rule | `sudo ufw delete <rule-number>` |
| Reset all rules | `sudo ufw reset` |

### Desktop Integration
- **Global Menu Support**: Installed for GTK applications
  - Packages: `appmenu-gtk-module`, `libdbusmenu-glib`
  - Enables KDE Plasma global menu for GTK apps
  - Restart affected applications after installation

### Network Optimization
- **Wi-Fi Regulatory Domain**: Spain (ES)
  - ⚠️ Manual configuration required (country-specific)
  - See: `run_once_after_85-configure-wifi-regdom.sh` output for instructions
  - Benefits: Unlock all Wi-Fi channels, enable full 5GHz/6GHz spectrum, optimize transmit power
  - Verify: `iw reg get` (should show `country ES: DFS-ETSI`)

### Documentation
See `cachyos-postinstall-audit.md` for the complete audit comparing this setup with CachyOS recommendations.
