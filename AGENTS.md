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
| `run_onchange_before_` | install script, re-runs when content changes |
| `run_onchange_after_` | post-install script, re-runs when content changes |
| `run_once_before_` | one-shot script, runs exactly once ever |
| `run_once_after_` | one-shot post-install script, runs exactly once ever |

## Repository Structure

```
.chezmoi.toml.tmpl              ← Config template with feature flags + distro detection
.chezmoiroot                    ← Points chezmoi source to home/
.chezmoiversion                 ← Minimum chezmoi version
home/
├── .chezmoidata/tools.yaml     ← Declarative tool metadata
├── .chezmoiexternal.toml.tmpl  ← Declarative external deps (GitHub releases, fonts)
├── .chezmoiignore.tmpl         ← Distro + feature-flag exclusions
├── .chezmoiremove.tmpl         ← Files chezmoi actively removes from target
├── .chezmoiscripts/            ← ALL install/configure scripts (not in home/ root)
│   ├── run_onchange_before_*   ← Generic install scripts (distro-agnostic)
│   ├── run_once_after_*        ← One-shot configure scripts
│   ├── arch/                   ← Arch/CachyOS-specific scripts (paru/AUR)
│   ├── debian/                 ← Debian/Ubuntu-specific (future)
│   └── fedora/                 ← Fedora/RHEL-specific (future)
├── .chezmoitemplates/          ← Shared library + script snippets
├── dot_config/                 ← Tool configurations
├── dot_local/                  ← User-local binaries and data
└── ...                         ← Other dotfiles
```

## Feature Flags

Defined in `.chezmoi.toml.tmpl`, auto-detected or prompted on first `chezmoi init`:

| Flag | Type | Purpose |
|---|---|---|
| `distro` | string | Linux distro ID from `/etc/os-release` (e.g., `cachyos`, `arch`, `ubuntu`) |
| `ephemeral` | bool | Cloud/VM/container instance — skip heavy installs |
| `headless` | bool | No screen/keyboard — skip GUI configs |
| `work` | bool | Work machine — include work-specific configs |
| `personal` | bool | Personal machine — include personal secrets |

Use in templates: `{{ if .headless }}`, `{{ if eq .distro "cachyos" }}`, etc.
Use in `.chezmoiignore.tmpl` to exclude entire config trees per machine type.

## Code Style

- **Shell scripts:** POSIX `sh` with `set -e`. Use `snake_case` for variables.
- **Chezmoi templates:** follow existing Go template patterns in `.tmpl` files.
- **Config files:** follow the tool's documented format. Check docs before guessing syntax.
- Guard against missing commands before using them (see `install.sh` for patterns).

## Adding CLI Tools

### 1. Installation Script

Create the script in `home/.chezmoiscripts/`:
- **Distro-agnostic** (uses `install_packages`): `home/.chezmoiscripts/run_onchange_before_<NN>-install-<tool>.sh.tmpl`
- **Distro-specific** (uses paru/AUR directly): `home/.chezmoiscripts/arch/run_onchange_before_<NN>-install-<tool>.sh.tmpl`

**Numbering ranges** (lower runs first):
- `00-09` System prerequisites — `10-29` Language/runtime managers — `30-49` Language toolchains
- `50-59` Container tools — `60-69` Runtime tools — `70-79` CLI tools/utilities
- `80-89` Desktop/system integration — `90-99` Tools with dependencies on earlier installs

**Use `run_onchange_` for installs** (re-runs when script content changes).
**Use `run_once_` only for one-shot configure** scripts that must never re-run.

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

**Available helpers** (`install-lib.sh`): `check_command`, `require_command`, `check_any_command`, `install_packages` (auto-detects paru/pacman/apt/dnf), `log_success`, `log_info`, `log_warn`, `log_error`, `die`, `log_version`, `is_dry_run`, `get_version`.

**Package manager preference (Arch):** Always use `paru` over `pacman`. Paru handles both official repos and AUR seamlessly. Use `pacman` only when `paru` is unavailable (e.g., bootstrap scripts before paru is installed) or when root-only operations explicitly require it.

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

### 5. Navi Cheatsheet

Every CLI tool added MUST have a corresponding navi cheatsheet at `home/dot_config/navi/custom-cheats/<tool>.cheat`.

**Format:**
```cheat
% <tool>, <tag1>, <tag2>

# <Description of command>
<command-with-placeholders>

# <Description of another command>
<another-command>

$ variable: <command that produces selectable options> | fzf
```

**Rules:**
- First line is `%` followed by tool name and comma-separated tags for discovery
- Each snippet starts with a `# comment` description, followed by the command on the next line
- Use `<placeholder>` for user-provided values
- Use `$ variable:` lines at the bottom to define interactive selectors (piped through fzf)
- Include the 3-5 most common operations — not an exhaustive reference
- Check the tool's `--help` or `tldr` output for the most useful commands
- Look at existing cheats in `home/dot_config/navi/custom-cheats/` for style reference

## Tool Dependencies

| Tool | Depends On | Reason |
|---|---|---|
| navi | fzf (system) | Uses fzf as pipe filter backend. Cannot use television (TUI, not a unix filter). |
| devenv | nix | Built on Nix |
| direnv | — | Auto-loads .envrc; integrates with devenv for automatic shell activation |
| pi | bun | Installed via bun global packages |
| distrobox | podman | Container manager that uses podman as backend |
| television | — | Standalone. Replaces fzf for shell integration (Ctrl-T, Ctrl-R) only. |
| avahi | nss-mdns | mDNS responder for .local hostname resolution on local network |
| herdr | — | Terminal-native agent runtime, installed via curl |
| vortix | openvpn | VPN TUI that manages tunnels via system openvpn binary |
| sqlit | uv | Installed via uv tool with mssql-python driver |
| lazyjira | — | Standalone Go binary; uses Jira REST API directly |
| hunk | bun | Review-first terminal diff viewer, installed via bun global (npm: hunkdiff) |
| lean-ctx | — | Context intelligence layer for AI agents; self-updates via `lean-ctx update` |
| pi-lean-ctx | lean-ctx, bun | Pi extension that routes built-in tools through lean-ctx CLI |
| rmux | rust (cargo) | Installed via cargo install |
| serena | uv, python 3.13 | Semantic code tools via LSP; MCP server connected to pi |
| python-lsp-server | uv | Python LSP; installed via `uv tool install python-lsp-server` |
| gopls | nix, home-manager | Go LSP; declared in `~/.config/home-manager/home.nix` |

Do NOT replace fzf with television for tools that pipe through fzf. Television is a full-screen TUI requiring `--source-command`, not stdin piping.

## Critical Rule: No PII in Source Files

**This repository is PUBLIC.** Never commit personally identifiable information (PII) directly into source files. This includes:

- Email addresses (personal, work, or third-party)
- Full names
- Employer names or work domains
- Hardcoded home directory paths (e.g., `/home/well`)
- API keys, tokens, or secrets (use `age` encryption via chezmoi)

### How to Handle PII

All personal data is stored in `~/.config/chezmoi/chezmoi.toml` under `[data]` and referenced via Go template variables in `.tmpl` files:

| Variable | Purpose |
|---|---|
| `{{ .name }}` | Full name |
| `{{ .email }}` | Personal email |
| `{{ .work_email }}` | Work email |
| `{{ .partner_email }}` | Partner's email |
| `{{ .chezmoi.homeDir }}` | Home directory path (built-in) |

New data fields are added via `promptStringOnce` in `.chezmoi.toml.tmpl`.

### When Adding Config That Contains PII

1. Name the file with `.tmpl` suffix (e.g., `dot_gitconfig.tmpl`)
2. Replace literal PII with the appropriate template variable
3. If the config uses `{{` for its own syntax (e.g., espanso), escape with `{{ "{{" }}`
4. Verify with `chezmoi cat <target-path>` that output is correct
5. Verify with `chezmoi diff` that no unintended changes occur

### Secrets and API Keys

Secrets MUST use chezmoi's age encryption:

```sh
chezmoi add --encrypt ~/.config/fish/api-keys.fish
```

This produces an `.age` file (e.g., `encrypted_api-keys.fish.age`) that is safe to commit. The encryption key and recipient are configured in `~/.config/chezmoi/chezmoi.toml`.

### Before Committing — PII Checklist

Run this scan before any commit:

```sh
rg -n '(wellsaint91|lilyzam1993|wmendoza@inscyth|Wellington Mendoza)' --glob '!.git' --glob '!.chezmoi*'
rg -n '/home/well[^a-z]' --glob '!.git' --glob '!*.md'
```

Both commands must return empty. If not, convert the file to a `.tmpl` and replace literals with template variables.

## lean-ctx Integration

| Tool | Depends On | Reason |
|---|---|---|
| lean-ctx | — | Standalone Rust binary; self-updates via `lean-ctx update` |
| pi-lean-ctx | lean-ctx, bun | Pi extension installed via `pi install npm:pi-lean-ctx` |

<!-- lean-ctx -->
Prefer lean-ctx MCP tools over native equivalents for token savings:
`ctx_read` > Read/cat, `ctx_search` > Grep/rg, `ctx_shell` > bash, `ctx_tree` > ls/find.
Native Edit/Write/Glob stay as-is; use `ctx_edit` only when Edit needs an unavailable Read.
<!-- /lean-ctx -->
