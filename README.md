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

### 5. **[Podman](https://podman.io)** - Daemonless container engine
- Docker-compatible, rootless container support
- Installed via system package manager (pacman/apt/dnf)
- Update: `sudo pacman -Syu` (or your distro's update command)

### 6. **[Bun](https://bun.sh)** - Fast all-in-one JavaScript runtime
- Drop-in replacement for Node.js, with built-in bundler, test runner, package manager
- Installed to `~/.bun/bin/bun`
- Update: `bun upgrade`

### 7. **Essential CLI Tools** - Modern command-line utilities
Installed via system package manager (pacman/apt/dnf):
- **[Helix](https://helix-editor.com/)** - Modern modal text editor
- **[ripgrep](https://github.com/BurntSushi/ripgrep)** - Fast grep alternative (`rg`)
- **[Yazi](https://yazi-rs.github.io/)** - Terminal file manager
- **[bat](https://github.com/sharkdp/bat)** - Cat with syntax highlighting
- **[duf](https://github.com/muesli/duf)** - Modern disk usage tool
- **[eza](https://eza.rocks/)** - Modern ls replacement
- Update: `sudo pacman -Syu` (or your distro's update command)

**Note:** After installation, restart your shell to ensure all tools are in your PATH.

## Updating All Packages

To update all installed tools at once, run:

```bash
update-all
```

This single command updates:
- ✅ System packages (age, podman, helix, ripgrep, yazi, bat, duf, eza)
- ✅ mise and mise-managed runtimes (go, node, etc.)
- ✅ uv (Python package manager)
- ✅ Nix channels and packages
- ✅ devenv
- ✅ Bun (if installed)

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
   git commit -m "chore: Update API keys"
   ```

### Available API integrations:

- **Brave Search API** - Used by the `brave-search` skill for web search
  - Get your key at: https://api-dashboard.search.brave.com/register
  - Already configured: `BRAVE_API_KEY`

**⚠️ Important:** Back up `~/.config/chezmoi/key.txt` securely! Without it, you cannot decrypt your API keys.
