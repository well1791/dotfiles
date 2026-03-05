# AGENTS.md

This document provides instructions for agentic coding agents on how to work with this dotfiles repository.

## Project Overview

This is a personal dotfiles repository managed using [chezmoi](https.chezmoi.io). The files in the `home` directory are templates that `chezmoi` uses to generate the actual dotfiles in the user's home directory.

The user's preferred environment consists of:
- **Shell:** fish
- **Terminal:** ghostty
- **Editors:** helix (primary), with a planned transition to doom-emacs.
- **Key-remapper:** kanata
- **AI Agent:** opencode

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
