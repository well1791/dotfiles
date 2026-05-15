# github.com/well1791/dotfiles

Well's dotfiles, managed with [`chezmoi`](https://github.com/twpayne/chezmoi).

Install with:

```sh
sh -c "$(curl -fsLS get.chezmoi.io)" -- init --apply well1791
```

If `chezmoi` is already installed then

```sh
chezmoi init --apply well1791
```

## What Gets Installed

During the initial setup, the following tools are automatically installed:

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

**Note:** After installation, restart your shell to ensure all tools are in your PATH.
