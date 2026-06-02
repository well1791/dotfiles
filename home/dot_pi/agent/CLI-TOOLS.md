# CLI Tools Reference

This document provides comprehensive usage patterns for modern CLI tools preferred on this system.

## Quick Reference

| Task | Use | Not | Why |
|------|-----|-----|-----|
| Find files/directories | `fd` | `find` | Faster, better defaults, simpler syntax |
| Search text in files | `rg` | `grep` | Faster, recursive by default, respects .gitignore |
| View file contents | `bat` | `cat` | Syntax highlighting, line numbers, git integration |
| List directory contents | `eza` | `ls` | Better formatting, tree view, git status |
| View git diffs | `delta` | raw diff | Syntax highlighting, side-by-side view |
| Navigate directories | `zoxide` | `cd` | Smart directory jumping based on frecency |
| Browse files | `yazi` | - | Terminal file manager with preview |
| Copy to clipboard | `wl-copy` | `xclip` | Native Wayland clipboard, no X11 dependency |
| Paste from clipboard | `wl-paste` | `xclip -o` | Native Wayland clipboard, no X11 dependency |

## fd - File/Directory Search

**Installation verified:** `/usr/bin/fd`

### Common Usage

```sh
# Find files by name
fd pattern

# Find only files
fd --type f pattern

# Find only directories
fd --type d pattern

# Search in specific path
fd pattern path/to/search

# Case-insensitive search
fd -i pattern

# Include hidden files
fd --hidden pattern

# Exclude .git directories
fd --exclude .git pattern

# Execute command on results
fd pattern --exec command {}
```

### When to Use

- Finding files by name pattern
- Listing all files of a certain type
- Building file lists for other commands
- Any task that would use `find`

### Performance Notes

- Respects `.gitignore` by default (use `--no-ignore` to override)
- Parallel execution by default
- Excludes hidden files by default (use `--hidden` to include)

## rg - Text Search (ripgrep)

**Installation verified:** `/usr/bin/rg`

### Common Usage

```sh
# Search for pattern (recursive by default)
rg pattern

# Search in specific path
rg pattern path/

# Case-insensitive search
rg -i pattern

# Show only filenames with matches
rg -l pattern

# Show context lines (2 before, 2 after)
rg -C 2 pattern

# Search with JSON output (useful for piping)
rg --json pattern

# Search specific file types
rg --type rust pattern
rg --type-add 'custom:*.{ext1,ext2}' --type custom pattern

# Exclude patterns
rg pattern --glob '!*.min.js'

# Fixed string search (no regex)
rg -F "exact string"

# Search and pipe to delta for diff-like view
rg --json -C 2 pattern | delta
```

### When to Use

- Searching for text patterns in files
- Finding occurrences across codebase
- Filtering log files
- Any task that would use `grep -r`

### Performance Notes

- Respects `.gitignore` by default
- Significantly faster than grep for large codebases
- UTF-8 optimized
- Automatic smart-case (case-insensitive if pattern is lowercase)

## bat - File Viewing

**Installation verified:** `/usr/bin/bat`

### Common Usage

```sh
# View file with syntax highlighting
bat file.txt

# Plain output (no decorations)
bat -p file.txt

# Show line numbers
bat -n file.txt

# Show non-printable characters
bat -A file.txt

# View specific language
bat --language rust file.txt

# View multiple files
bat file1.txt file2.txt

# Page through file (like less)
bat --paging always file.txt

# Show git modifications
bat --diff file.txt
```

### When to Use

- Viewing file contents for inspection
- Quick syntax-highlighted previews
- Comparing file versions
- Any task that would use `cat` or `less`

### User Configuration

System abbreviation: `cat` → `bat -p` (plain output)

## eza - Directory Listing

**Installation verified:** `/usr/bin/eza`

### Common Usage

```sh
# List all files with details
eza --all --long

# Tree view (2 levels deep)
eza --all --long --tree --level=2

# Sort by modification time
eza --all --long --sort modified

# Sort by size
eza --all --long --sort size

# Show git status
eza --all --long --git

# Show file headers
eza --all --long --header

# Show icons (if terminal supports)
eza --all --long --icons

# List only directories
eza --all --long --only-dirs

# Reverse sort order
eza --all --long --reverse
```

### When to Use

- Listing directory contents
- Exploring directory structure
- Checking file permissions and sizes
- Any task that would use `ls`

### User Abbreviations

- `l` → `eza --all --long`
- `ll` → `eza --all --long --tree --level=2`

## delta - Git Diff Viewer

**Installation verified:** `/usr/bin/delta`

### Common Usage

```sh
# View git diff with delta
git diff | delta

# View git log with diffs
git log -p | delta

# Compare two files
diff file1 file2 | delta

# View git show output
git show commit_hash | delta

# Pipe rg JSON output to delta
rg --json -C 2 pattern | delta
```

### When to Use

- Reviewing git diffs
- Comparing files
- Viewing search results with context
- Any task that produces diff-like output

### User Integration

System abbreviation: `rgd` → `rg --json -C 2 % | delta`

## zoxide - Smart Directory Navigation

**Installation verified:** `/usr/bin/zoxide`

### Common Usage

```sh
# Jump to a frequently used directory
z project_name

# Jump to directory matching pattern
z doc

# Interactive selection if multiple matches
zi pattern

# Add current directory to database
zoxide add .

# Remove directory from database
zoxide remove /path/to/dir

# Query database
zoxide query pattern

# Edit database directly
zoxide edit
```

### When to Use

- Navigating to frequently used directories
- Quick directory switching without full paths
- Navigating project structures
- Alternative to `cd` for known locations

### How It Works

Tracks frecency (frequency + recency) of directory usage. The more you visit a directory, the higher its rank.

## yazi - Terminal File Manager

**Installation verified:** `/usr/bin/yazi`

### Common Usage

```sh
# Launch yazi in current directory
yazi

# Launch in specific directory
yazi /path/to/dir

# Launch with file selection (stores selection in temp file)
yazi --cwd-file="$tmp"
```

### When to Use

- Visual file browsing
- Batch file operations
- Previewing files before opening
- Complex file management tasks

### User Function

System has `y` function that integrates yazi with directory change on exit.

## wl-copy / wl-paste - Wayland Clipboard

**Installation verified:** `/usr/bin/wl-copy`, `/usr/bin/wl-paste`

### Common Usage

```sh
# Copy text to clipboard
echo "hello" | wl-copy

# Copy file contents to clipboard
wl-copy < file.txt

# Copy with specific MIME type
wl-copy --type text/html < page.html

# Paste clipboard contents
wl-paste

# Paste to a file
wl-paste > output.txt

# Paste specific MIME type
wl-paste --type text/plain

# List available MIME types in clipboard
wl-paste --list-types

# Copy to primary selection (middle-click paste)
echo "hello" | wl-copy --primary

# Paste from primary selection
wl-paste --primary

# Clear clipboard
wl-copy --clear
```

### When to Use

- Copying command output for the user to paste elsewhere
- Piping content to the clipboard for easy sharing
- Reading clipboard contents for processing
- Any task requiring clipboard interaction on Wayland

### Integration Examples

```sh
# Copy a file path to clipboard
fd pattern | wl-copy

# Copy search results to clipboard
rg pattern -l | wl-copy

# Copy git diff to clipboard
git diff | wl-copy

# Process clipboard contents
wl-paste | rg pattern
```

## Integration Patterns

### File Search + Processing

```sh
# Find and edit files
fd '\.md$' | xargs $EDITOR

# Find and delete (with confirmation)
fd 'test_.*\.tmp' --exec rm -i {}

# Find files and count lines
fd '\.rs$' | xargs wc -l
```

### Text Search + Analysis

```sh
# Find all TODO comments
rg 'TODO|FIXME'

# Count occurrences
rg pattern -c

# Search and open in editor
rg -l pattern | xargs $EDITOR
```

### Combined Workflows

```sh
# Search in specific file types found by fd
fd --extension rs --exec rg pattern {}

# Preview files before processing
fd pattern | xargs bat

# Interactive file selection with preview
fd --type f | fzf --preview 'bat --color=always {}'
```

## Default Behavior Notes

### Respect .gitignore

Both `fd` and `rg` respect `.gitignore` by default:
- Use `--no-ignore` to disable
- Use `--hidden` to include hidden files
- Use `--no-ignore-vcs` to disable only VCS ignores

### Color Output

All tools use colored output by default:
- Automatically disabled when piping (unless forced)
- Use `--color always` to force colors
- Use `--color never` to disable colors

### Performance Characteristics

- `fd`: Parallel by default, uses multiple cores
- `rg`: Parallel by default, uses memory mapping
- `bat`: Single-threaded, optimized for syntax highlighting
- `eza`: Single-threaded, focuses on rich formatting

## Fallback Strategy

If a modern tool is unavailable, fall back gracefully:

```sh
# Example fallback pattern
if command -v fd >/dev/null 2>&1; then
    fd pattern
else
    find . -name '*pattern*'
fi
```

However, on this system all documented tools are installed and should be used.
