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

### 2. **[home-manager](https://github.com/nix-community/home-manager)** - Declarative user package management
- Manages global CLI tools via Nix (Node.js, Go, gopls)
- Config: `~/.config/home-manager/home.nix`
- Update: `nix flake update --flake ~/.config/home-manager && home-manager switch --flake ~/.config/home-manager`

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

### 6b. **[Distrobox](https://distrobox.it)** - Container manager on top of Podman
- Run any Linux distro in containers integrated with the host
- Uses Podman as backend (Docker also supported)
- Installed via system package manager (pacman/apt/dnf)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 7. **[Bun](https://bun.sh)** - Fast all-in-one JavaScript runtime
- Drop-in replacement for Node.js, with built-in bundler, test runner, package manager
- Installed to `~/.bun/bin/bun`
- Update: `bun upgrade`

### 8. **[atuin](https://atuin.sh/)** - Magical shell history
- Replaces default shell history with searchable, syncable database
- Installed via system package manager (pacman/apt/dnf) or shell script
- Fish shell integration: `atuin init fish | source`
- Update: `atuin update` or `sudo pacman -Syu`

### 9b. **[Herdr](https://herdr.dev)** - Terminal-native agent runtime
- tmux-style persistence with agent-aware panes, state rollups, and runtime API
- Installed via curl: `curl -fsSL https://herdr.dev/install.sh | sh`
- Supports local, SSH, and remote-attach workflows
- Update: `herdr update`

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
- **[dust](https://github.com/bootandy/dust)** - Intuitive disk usage (`du` replacement)
- **[duf](https://github.com/muesli/duf)** - Disk free utility (`df` replacement)
- **[eza](https://eza.rocks/)** - Modern ls replacement
- **[sd](https://github.com/chmln/sd)** - Intuitive find & replace (`sed` replacement)
- **[glow](https://github.com/charmbracelet/glow)** - Terminal markdown reader with TUI
- **[serpl](https://github.com/yassinebridi/serpl)** - TUI search and replace tool
- **[just](https://github.com/casey/just)** - Command runner (like make, but better)
- **[tealdeer](https://tealdeer-rs.github.io/tealdeer/)** - Fast tldr client in Rust (`tldr`)
- **[pass](https://www.passwordstore.org/)** - Standard Unix password manager (GPG-encrypted, git-tracked)
- **[gitu](https://github.com/altsem/gitu)** - TUI Git client inspired by Magit
- **[jujutsu](https://jj-vcs.dev)** - Git-compatible VCS that is both simple and powerful (`jj`)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 12. **[direnv](https://direnv.net)** - Auto-load environment on cd
- Automatically loads/unloads environment variables when entering/leaving directories
- Integrates with devenv for automatic shell activation in Nix-based projects
- Installed via system package manager
- Config: `~/.config/direnv/direnvrc`
- Usage: `direnv allow` in a project with `.envrc`
- Update: `sudo pacman -Syu` (or your distro's update command)

### 13. **[television](https://github.com/alexpasmantier/television)** - Fast, hackable fuzzy finder TUI
- Replaces skim/fzf for shell integration (Ctrl-T smart autocomplete, Ctrl-R history)
- Context-aware: detects current command and picks appropriate channel (files, dirs, git branches, etc.)
- Built-in channels: files, dirs, git-branch, git-log, git-diff, env, procs, docker-images, and many more
- Installed via system package manager
- Config: `~/.config/television/config.toml`
- Update: `sudo pacman -Syu` (or your distro's update command)

### 14. **[vortix](https://github.com/Harry-kp/vortix)** - Terminal UI for WireGuard and OpenVPN
- Unified TUI for managing VPN connections with real-time telemetry and leak detection
- Supports both WireGuard (`.conf`) and OpenVPN (`.ovpn`) profiles
- Features: kill switch, IPv6/DNS leak detection, multi-tunnel, geo-location
- Runtime deps: `openvpn` (installed automatically; add `wireguard-tools` if using WireGuard profiles)
- Installed via system package manager
- Config: `~/.config/vortix/`
- Update: `sudo pacman -Syu` or `vortix update` (self-update from crates.io)

### 15. **[aim](https://github.com/mihaigalos/aim)** - Download/upload tool with resume
- Simple CLI: parameter order determines download vs upload
- Protocols: http(s), ftp, sftp, ssh, s3
- Features: resume, interactive mode, SHA256 verification, folder sharing
- Installed via AUR (`aim-bin`)
- Update: `paru -Syu aim-bin` or `aim --update` (self-update)

### 16. **[sqlit](https://github.com/Maxteabag/sqlit)** - Terminal UI for SQL databases
- The lazygit of SQL databases — connect and query from your terminal
- Supports: PostgreSQL, MySQL, SQLite, SQL Server, DuckDB, and 20+ more
- Features: connection manager, vim-style editing, query history, Docker discovery, SSH tunnels
- Config: `~/.config/sqlit/`
- Installed via `uv tool install sqlit-tui --with mssql-python`
- Update: `uv tool upgrade sqlit-tui`

### 17. **[lazyjira](https://github.com/textfuel/lazyjira)** - Terminal UI for Jira
- Fast keyboard-driven TUI — browse issues, transition statuses, comment, and more
- Vim-style navigation with fully remappable keybindings
- JQL search with autocomplete, syntax highlighting, and persistent history
- 4-panel layout: issues, projects, detail, status
- Inline editing via `$EDITOR` (descriptions, comments)
- Git integration: create branches from issues
- Themes: Catppuccin (4 flavors) + ANSI default
- Installed via AUR (`lazyjira-bin`)
- Config: `~/.config/lazyjira/config.yml`
- Update: `sudo pacman -Syu` (system package)

### 18. **[slumber](https://github.com/LucasPickering/slumber)** - Terminal-based HTTP/REST client
- TUI and CLI HTTP client — define, execute, and share configurable requests
- Source-first: YAML collection files designed for version control
- In-app editing via `$EDITOR` (configured for Helix)
- Features: profiles/environments, dynamic templates, JSONPath response filtering, request chaining
- Installed via system package manager
- Config: `~/.config/slumber/config.yml`
- Update: `sudo pacman -Syu` (or your distro's update command)

### 19. **[hunk](https://github.com/modem-dev/hunk)** - Review-first terminal diff viewer
- Multi-file review stream with sidebar navigation
- Inline AI/agent annotations beside the code
- Split, stack, and responsive auto layouts
- Watch mode for auto-reloading as the working tree changes
- Installed via bun global: `bun install -g hunkdiff`
- Config: `~/.config/hunk/config.toml`
- Update: `bun install -g hunkdiff` (or `update-all`)

### 20. **[lean-ctx](https://github.com/yvgude/lean-ctx)** - Context intelligence layer for AI agents
- Reduces LLM token consumption by 60-90% via shell hook compression and MCP server
- 77 MCP tools, 95+ shell compression patterns, persistent session cache
- Pi integration via `pi-lean-ctx` package (embedded MCP bridge)
- Installed via AUR (`lean-ctx-bin`) or `curl -fsSL https://leanctx.com/install.sh | sh`
- Config: `~/.config/lean-ctx/config.toml`
- Fish hook: `lean-ctx init fish | source`
- Update: `lean-ctx update` (or `update-all`)

### 21. **[python-lsp-server](https://github.com/python-lsp/python-lsp-server)** - Python Language Server
- LSP implementation for Python editors (pylsp)
- Supports completions, diagnostics, formatting, refactoring
- Installed globally via `uv tool install python-lsp-server`
- Binary: `pylsp`
- Update: `uv tool upgrade python-lsp-server` (or `update-all`)

### 22. **[gopls](https://pkg.go.dev/golang.org/x/tools/gopls)** - Go Language Server
- Official LSP implementation for Go
- Supports completions, diagnostics, formatting, refactoring, code navigation
- Installed via home-manager (`home.nix`)
- Binary: `gopls`
- Update: `nix flake update --flake ~/.config/home-manager && home-manager switch --flake ~/.config/home-manager` (or `update-all`)

### 23. **[navi](https://github.com/denisidoro/navi)** - Interactive cheatsheet tool
- Browse and execute cheatsheets from the command line
- **Dependency:** Requires `fzf` (system package) as its interactive finder backend
  - navi uses fzf as a unix pipe filter (stdin → fuzzy select → stdout)
  - This CANNOT be replaced by television (tv is a TUI, not a pipe filter)
- Installed via AUR (paru/yay)
- Config: `~/.config/navi/config.yaml`
- Cheats: `~/.local/share/navi/cheats/` and `~/.config/navi/custom-cheats/`
- Fish widget: Ctrl+G
- Update: `paru -Syu navi` or `yay -Syu navi`

### 24. **[Avahi](https://avahi.org/)** - mDNS/DNS-SD for local network discovery
- Enables `.local` hostname resolution (e.g., `lenovo.local` from other devices)
- Packages: `avahi`, `nss-mdns`
- Config: `/etc/avahi/avahi-daemon.conf`
- Browse local services: `avahi-browse -at`
- Update: `sudo pacman -Syu` (system package)

### 25. **[rmux](https://rmux.io)** - High-performance session manager
- Session manager and multiplexer written in Rust
- Includes Rust SDK (`rmux-sdk`) for programmatic session control
- Installed via cargo: `cargo install rmux rmux-sdk`
- Update: `cargo install rmux rmux-sdk`

### 26. **[serena](https://github.com/oraios/serena)** - Semantic code retrieval and editing via LSP
- MCP server providing IDE-grade symbol operations: find, rename, refactor, diagnostics
- Supports 40+ languages via language server protocol
- Installed via `uv tool install -p 3.13 serena-agent`
- Update: `uv tool upgrade serena-agent`
- Config: `~/.serena/serena_config.yml`
- Pi context: `~/.serena/contexts/pi.yml` (semantic tools only, overlapping tools disabled)
- Connected to pi via MCP (`~/.pi/agent/mcp.json`)

**Note:** After installation, restart your shell to ensure all tools are in your PATH.

## Updating All Packages

To update all installed tools at once, run:

```bash
update-all
```

This single command updates:
- ✅ System packages (age, aim-bin, avahi, nss-mdns, podman, distrobox, direnv, helix, ripgrep, yazi, bat, dust, duf, eza, glow, sd, serpl, just, tealdeer, pass, jujutsu, slumber, vortix, openvpn, lazyjira-bin)
- ✅ hunk (review-first diff viewer, via bun)
- ✅ lean-ctx (context intelligence, self-update)
- ✅ home-manager packages (node, go, gopls)
- ✅ uv (Python package manager) and uv tools (sqlit, serena, etc.)
- ✅ Rust (rustup update) and cargo tools (rmux, rmux-sdk)
- ✅ Nix channels, packages, and flake installs
- ✅ devenv
- ✅ Bun (if installed)
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

**Allowed Services:**
- ✅ mDNS (port 5353/UDP) — local network discovery (`.local` hostnames)
- ✅ SSH (port 22/TCP) — remote shell access and SCP file transfer
- ✅ KDE Connect (ports 1714-1764 TCP+UDP)

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

### Remote Access (SSH from iPad/Tablet)

SSH configured for local network access to zellij sessions from mobile devices.

**Setup:**
- Port: 2022 (non-standard)
- Auth: password (temporary), key-based (planned)
- Auto-attach: SSH login → attaches to last used zellij session (falls back to creating "remote" if none exist)
- Idle timeout: 30 minutes
- Access: local network only (192.168.0.0/16 via UFW)

**Connect from iPad (WebSSH app):**
- Host: `legion.local`
- Port: `2022`
- Username: `well`

**What happens on connect:**
1. SSH authenticates on port 2022
2. Fish shell detects SSH session (`$SSH_CONNECTION` is set)
3. Auto-attaches to the most recently used zellij session (or creates "remote" if no sessions exist)
4. On disconnect, session persists — reconnect picks up where you left off

**Sleep inhibition:**

A systemd user service (`ssh-sleep-inhibit`) prevents the laptop from suspending while inbound SSH sessions are active. It polls every 30s via `ss` and holds a `systemd-inhibit` lock on `sleep:idle` when connections are detected. User lingering is enabled so the service persists even when the local graphical session is inactive.

- Service: `~/.config/systemd/user/ssh-sleep-inhibit.service`
- Script: `~/.local/bin/ssh-sleep-inhibit`
- Verify: `systemd-inhibit --list | grep ssh`

**Switching to key-based auth (future):**
```bash
# On iPad: generate key in WebSSH app, copy public key
# On laptop: add the public key
echo "<public-key>" >> ~/.ssh/authorized_keys

# Then disable password auth
sudo sed -i 's/^PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config.d/local.conf
sudo systemctl restart sshd
```

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
