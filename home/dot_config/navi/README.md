# Navi Configuration

**Navi** is an interactive cheatsheet tool for the command-line that helps you browse, search, and execute commands without memorizing them.

## Features

- 📚 **Interactive cheatsheets** - Browse and search through command examples
- 🔍 **Dynamic variables** - Get suggested values for command arguments
- ⚡ **Quick execution** - Execute commands directly from search results
- 🎨 **Customizable** - Configure colors, layout, and behavior
- 📦 **Cheatsheet repos** - Download and manage community cheatsheets
- 🐟 **Shell integration** - Fish widget with Ctrl+G keybind

## Installation

Navi is installed via the `run_once_before_90-install-navi.sh.tmpl` script.

## Configuration

### Files
- **Config**: `~/.config/navi/config.yaml`
- **Cheats directory**: `~/.local/share/navi/cheats/`
- **Custom cheats**: `~/.config/navi/custom-cheats/` (add to config if used)

### Current Configuration

**Finder**: Uses `fzf` (installed as navi dependency)
- Cheats selection: 60% height with preview
- Variable selection: 40% height

**Shell**: Fish for command execution

**Colors**:
- Tags: cyan (25% width)
- Comments: blue (40% width)
- Snippets: white (35% width)

## Usage

### Basic Commands

```bash
# Launch interactive mode
navi

# Print command without executing (useful for testing)
navi --print

# Search for specific cheatsheet
navi --query "git"

# Execute best match directly
navi --best-match --query "git status"
```

### Fish Shell Widget

Press **Ctrl+G** to open navi in the terminal.
- Select a command
- Press Enter to insert it into your command line (without executing)
- Edit as needed, then press Enter to execute

### Managing Cheatsheets

```bash
# Browse featured cheatsheet repositories
navi repo browse

# Add a repository
navi repo add <repository-url>

# List installed repositories
navi repo list

# Update all repositories
navi repo update

# Remove a repository
navi repo remove <repository-name>
```

### Featured Repositories

First run will prompt you to download default cheatsheets. Recommended repos:
- **denisidoro/cheats** - Default collection (already prompted on first run)
- **tldr-pages/tldr** - Community-driven man pages alternative
- **cheat/cheatsheets** - Community cheatsheets

Add them with:
```bash
navi repo add https://github.com/tldr-pages/tldr
```

## Creating Custom Cheatsheets

### Cheatsheet Syntax

Create `.cheat` files in `~/.local/share/navi/cheats/` or a custom directory.

**Basic example** (`custom.cheat`):
```
% git, version-control

# Show git status
git status

# Create and switch to new branch
git checkout -b <branch-name>

# Commit with message
git commit -m "<message>"

# Push to remote
git push origin <branch>

$ branch: git branch | awk '{print $NF}'
```

**Syntax breakdown:**
- `%` - Tags (for filtering)
- `#` - Command description
- Command line (can include `<variables>`)
- `$` - Variable definition with dynamic values

### Advanced Variable Options

```
% docker

# Remove container
docker rm <container-id>

# Remove multiple containers
docker rm <container-ids>

$ container-id: docker ps -a | awk '{print $1, $NF}' --- --column 1
$ container-ids: docker ps -a | awk '{print $1, $NF}' --- --column 1 --multi
```

**Variable options:**
- `--column N` - Extract specific column from output
- `--multi` - Allow multi-selection
- `--delimiter` - Custom delimiter for parsing
- `--map` - Transform output before display
- `--fzf-overrides` - Custom fzf/skim options

### Example Custom Cheatsheet

See `~/.config/navi/custom-cheats/example.cheat` for a working example.

## Tips & Tricks

### Search Tips

- **Type to filter** - Start typing to narrow down results
- **Use tags** - Filter by tag (e.g., `% git` shows only git commands)
- **Fuzzy search** - No need for exact matches

### Integration Tips

```bash
# Use in scripts
COMMAND=$(navi --print --best-match --query "docker ps")
eval "$COMMAND"

# Chain with other tools
navi --print | xargs -I {} sh -c '{}'
```

### Customization Examples

**Change keybind** (edit `~/.config/fish/conf.d/navi.fish`):
```fish
# Use Ctrl+N instead of Ctrl+G
bind \cn "commandline -r (navi --print); commandline -f repaint"
```

**Add custom cheat paths** (`config.yaml`):
```yaml
cheats:
  paths:
    - ~/.config/navi/custom-cheats
    - ~/work/team-cheats
```

**Change colors** (`config.yaml`):
```yaml
style:
  tag:
    color: green
  comment:
    color: yellow
  snippet:
    color: magenta
```

## Troubleshooting

### Navi not finding cheats
```bash
# Check paths
navi info cheats-path

# List all cheats
navi list

# Check config
navi info config-path
cat ~/.config/navi/config.yaml
```

### Fish widget not working
```bash
# Check if navi is in PATH
which navi

# Reload fish config
source ~/.config/fish/conf.d/navi.fish

# Test binding
bind \cg
```

### Variables not working
- Ensure commands use standard output (not stderr)
- Test variable command separately: `docker ps | awk '{print $1}'`
- Add `2>/dev/null` to suppress errors

## Resources

- **Documentation**: https://github.com/denisidoro/navi
- **Cheatsheet syntax**: https://github.com/denisidoro/navi/blob/master/docs/cheatsheet/syntax/README.md
- **Community cheats**: https://github.com/denisidoro/cheats
- **Configuration guide**: https://github.com/denisidoro/navi/blob/master/docs/configuration/README.md

## Quick Reference

| Command | Description |
|---------|-------------|
| `navi` | Launch interactive mode |
| `navi --print` | Print command without executing |
| `navi --query "text"` | Search with initial query |
| `navi repo browse` | Browse featured repos |
| `navi repo add <url>` | Add repository |
| `navi list` | List all available cheats |
| **Ctrl+G** | Open navi (fish shell widget) |
