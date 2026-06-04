# AGENTS.md

This document provides instructions for agentic coding agents on how to work with this dotfiles repository.

## Project Overview

This is a personal dotfiles repository managed using [chezmoi](https.chezmoi.io). The files in the `home` directory are templates that `chezmoi` uses to generate the actual dotfiles in the user's home directory.

The user's preferred environment consists of:
- **Shell:** fish
- **Terminal:** ghostty
- **Editors:** helix (primary), with a planned transition to doom-emacs.
- **Key-remapper:** kanata
- **AI Agent:** pi (terminal coding agent)
- **Fuzzy finder:** television (replaces fzf/skim for shell integration)

## Build, Lint, and Test Commands

This repository primarily consists of configuration files and shell scripts, so there are no traditional build, lint, or test commands.

### Applying Changes

The primary command to apply changes is:
```sh
chezmoi apply
```
This command will apply any changes made to the source files to the target dotfiles. To see what changes would be made without applying them, you can use:
```sh
chezmoi diff
```

### Verification

Since there are no automated tests, all changes must be manually verified. For example, if you change a shell configuration file, you should start a new shell to ensure it works as expected.

## Code Style Guidelines

### General Principles
- **Convention over configuration**: Follow the existing code style and conventions in the file you are editing.
- **Simplicity and Readability**: Write clear and concise code and configuration.

### Shell Scripts
- **Shell:** Use `sh` (POSIX shell) for scripts to ensure portability, unless `bash` specific features are required. The `install.sh` script is a good example to follow.
- **Error Handling:** Use `set -e` to exit on error in shell scripts.
- **Formatting:** Follow the formatting of existing scripts regarding indentation and spacing.

### Imports
Not applicable in the same way as a typical software project. For shell scripts, any sourced files should be clearly documented.

### Naming Conventions
- For variables in shell scripts, use `snake_case`.
- For new files managed by `chezmoi`, follow `chezmoi`'s naming conventions (e.g., `dot_` prefix for files in the home directory).

### Commits
- Follow the existing commit message style. A quick `git log` will give you a good idea of the preferred style. Generally, messages are short and descriptive.

### Editor Configuration
- The user primarily uses `helix` and `doom-emacs`. Be mindful of configurations for these editors located in `home/dot_config/helix/` and `home/dot_doom.d/`. When editing these, ensure the syntax is correct for the respective editor.

### Error Handling
- For shell scripts, check for the existence of commands before using them, as seen in `install.sh`.
- In configuration files, avoid introducing syntax errors. Double-check the documentation for the tool if you are unsure about the syntax.

## Adding CLI Tools

When adding a new CLI tool to this dotfiles repository, follow this process:

### 1. Installation Script

Create a `run_once_before_<NN>-install-<tool>.sh.tmpl` file in `home/`.

**Numbering convention** (lower runs first):
- `00-09`: System prerequisites (age, kdotool)
- `10-29`: Language/runtime managers (nix, mise, devenv)
- `30-49`: Language toolchains (uv, rust)
- `50-59`: Container tools (podman)
- `60-69`: Runtime tools (bun, engram, atuin)
- `70-79`: CLI tools and utilities (cli-tools bundle, television, global-menu)
- `80-89`: Desktop/system integration (espanso, vicinae)
- `90-99`: Tools with dependencies on earlier tools (navi → needs fzf from pacman)

**Template structure:**
```sh
{{ template "install-header.sh.tmpl" . }}
# Install <tool> (<short description>)
# <upstream URL>

# Skip if already installed
if log_version <cmd>; then
    exit 0
fi

# Install
log_info "Installing <tool>..."
install_packages <package-name>

# Verify
if ! check_command <cmd>; then
    die "<tool> installation failed"
fi

log_success "<tool> installed" "$(get_version <cmd>)"
```

Available helpers from `install-lib.sh`:
- `check_command`, `require_command`, `check_any_command`
- `install_packages` (auto-detects pacman/apt/dnf)
- `log_success`, `log_info`, `log_warn`, `log_error`, `die`
- `log_version` (check + print version, returns 0/1)
- `is_dry_run`, `get_version`

### 2. Configuration Files

Place config in `home/dot_config/<tool>/` following chezmoi naming:
- `dot_` prefix → `.` in target
- `executable_` prefix → sets +x permission
- `.tmpl` suffix → processed as Go template

### 3. Shell Integration

If the tool needs fish shell integration, create `home/dot_config/fish/conf.d/<tool>.fish`:
```fish
# Guard: skip if tool not installed
if not command -v <cmd> >/dev/null 2>&1
    exit
end

# Initialize
<cmd> init fish | source
```

### 4. Documentation

- Add a section to `README.md` under "What Gets Installed"
- Document dependencies explicitly (see Dependencies section below)

### 5. Update Script

If the tool has a self-update mechanism, add it to `home/dot_local/bin/executable_update-all`.

## Tool Dependencies

Some tools depend on others. Document these explicitly:

| Tool | Depends On | Reason |
|------|-----------|--------|
| navi | fzf (system package) | navi uses fzf as its interactive finder backend (pipes stdin → fzf → stdout). Cannot use television as replacement — tv is a TUI, not a unix filter. |
| television | — | Standalone. Replaces skim/fzf for shell integration (Ctrl-T, Ctrl-R). |
| devenv | nix | Built on Nix for reproducible environments |
| pi | bun | Installed via bun global packages |

**Important:** Do NOT attempt to replace fzf with television for tools that use fzf as a unix pipe filter (stdin → fuzzy select → stdout). Television is architecturally different — it's a full-screen TUI that requires `--source-command`, not stdin piping.
