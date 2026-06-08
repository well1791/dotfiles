# AGENTS.md

Personal dotfiles repository managed with [chezmoi](https://chezmoi.io). Source files live in `home/`; chezmoi renders them to `~`.

## Environment

- **Shell:** fish
- **Terminal:** ghostty
- **Editors:** helix (primary), doom-emacs (secondary)
- **Key-remapper:** kanata
- **AI Agent:** pi (terminal coding agent)
- **Fuzzy finder:** television (replaces fzf/skim for shell integration)

## Commands

```sh
chezmoi apply          # apply source → target
chezmoi diff           # preview changes without applying
chezmoi edit <file>    # edit a target's source file
chezmoi add <file>     # add a new file to chezmoi management
```

No automated tests — verify changes manually (start a new shell, reload the tool, etc).

## Critical Rule: All Config Through Chezmoi

**NEVER create or edit config files directly in `~` or `~/.config/`.** All configuration for every CLI tool, shell, editor, or service MUST be managed through chezmoi source files in this repository. When adding, modifying, or troubleshooting any tool's config:

1. Locate or create the source file under `home/` (e.g., `home/dot_config/<tool>/`)
2. Edit the chezmoi source, not the target
3. Run `chezmoi apply` to deploy
4. If a config file already exists in `~` but not in chezmoi, run `chezmoi add <file>` first

This applies to dotfiles, shell configs, editor settings, tool configs — everything.

## Chezmoi Naming Conventions

| Prefix/Suffix | Effect |
|---|---|
| `dot_` | → `.` in target path |
| `executable_` | sets `+x` permission |
| `.tmpl` | processed as Go template |
| `private_` | sets `0600` permission |
| `run_once_before_` | install script, runs once before apply |
| `run_once_after_` | post-install script, runs once after apply |

## Code Style

- **Shell scripts:** POSIX `sh` with `set -e`. Use `snake_case` for variables.
- **Chezmoi templates:** follow existing Go template patterns in `.tmpl` files.
- **Config files:** follow the tool's documented format. Check docs before guessing syntax.
- Guard against missing commands before using them (see `install.sh` for patterns).

## Adding CLI Tools

### 1. Installation Script

Create `home/run_once_before_<NN>-install-<tool>.sh.tmpl`:

**Numbering ranges** (lower runs first):
- `00-09` System prerequisites — `10-29` Language/runtime managers — `30-49` Language toolchains
- `50-59` Container tools — `60-69` Runtime tools — `70-79` CLI tools/utilities
- `80-89` Desktop/system integration — `90-99` Tools with dependencies on earlier installs

**Template:**
```sh
{{ template "install-header.sh.tmpl" . }}
# Install <tool> (<short description>)
# <upstream URL>

if log_version <cmd>; then exit 0; fi

log_info "Installing <tool>..."
install_packages <package-name>

if ! check_command <cmd>; then die "<tool> installation failed"; fi
log_success "<tool> installed" "$(get_version <cmd>)"
```

**Available helpers** (`install-lib.sh`): `check_command`, `require_command`, `check_any_command`, `install_packages` (auto-detects pacman/apt/dnf), `log_success`, `log_info`, `log_warn`, `log_error`, `die`, `log_version`, `is_dry_run`, `get_version`.

### 2. Configuration

Place config in `home/dot_config/<tool>/` using chezmoi naming conventions above.

### 3. Fish Shell Integration

If the tool needs shell init, create `home/dot_config/fish/conf.d/<tool>.fish`:
```fish
if not command -v <cmd> >/dev/null 2>&1; exit; end
<cmd> init fish | source
```

### 4. Documentation and Updates

After adding, removing, or modifying any CLI tool installation, **all** of these must be updated in the same change:

- Add to `README.md` under "What Gets Installed"
- If the tool has self-update capability, add a section to `home/dot_local/bin/executable_update-all`
- If the tool is updated via system packages only, verify it's covered by the system package step in `update-all`
- Update the header comment in `executable_update-all` to list all managed tools
- Document dependencies in the table below
- Update this `AGENTS.md` file if the change affects conventions, dependencies, or integration patterns

## Tool Dependencies

| Tool | Depends On | Reason |
|---|---|---|
| navi | fzf (system) | Uses fzf as pipe filter backend. Cannot use television (TUI, not a unix filter). |
| devenv | nix | Built on Nix |
| pi | bun | Installed via bun global packages |
| distrobox | podman | Container manager that uses podman as backend |
| television | — | Standalone. Replaces fzf for shell integration (Ctrl-T, Ctrl-R) only. |

Do NOT replace fzf with television for tools that pipe through fzf. Television is a full-screen TUI requiring `--source-command`, not stdin piping.
