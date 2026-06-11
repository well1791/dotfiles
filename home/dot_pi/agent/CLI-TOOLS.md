# CLI Tools Reference

This document provides comprehensive usage patterns for modern CLI tools preferred on this system.

## Quick Reference

| Task | Use | Not | Why |
|------|-----|-----|-----|
| Directory disk usage | `dust` | `du` | Visual tree, sorted by size, intuitive output |
| Filesystem disk usage | `duf` | `df` | Color output, grouped by type, modern layout |
| Find files/directories | `fd` | `find` | Faster, better defaults, simpler syntax |
| Search text in files | `rg` | `grep` | Faster, recursive by default, respects .gitignore |
| View file contents | `bat` | `cat` | Syntax highlighting, line numbers, git integration |
| List directory contents | `eza` | `ls` | Better formatting, tree view, git status |
| View git diffs | `delta` | raw diff | Syntax highlighting, side-by-side view |
| Text substitution | `sd` | `sed` | Intuitive regex syntax, no escaping nightmares |
| Navigate directories | `zoxide` | `cd` | Smart directory jumping based on frecency |
| Browse files | `yazi` | - | Terminal file manager with preview |
| Copy to clipboard | `wl-copy` | `xclip` | Native Wayland clipboard, no X11 dependency |
| Paste from clipboard | `wl-paste` | `xclip -o` | Native Wayland clipboard, no X11 dependency |

## sd - Text Substitution

**Installation verified:** `/usr/bin/sd`

### Common Usage

```sh
# Simple string replacement (stdin)
echo 'hello world' | sd 'world' 'rust'

# Regex replacement
echo 'foo123bar' | sd '\d+' 'NUM'

# In-place file editing
sd 'old_pattern' 'new_text' file.txt

# Multiple files
sd 'before' 'after' file1.txt file2.txt

# Preview changes (dry run via diff)
sd 'pattern' 'replacement' file.txt | delta

# Capture groups
echo 'foo bar' | sd '(\w+) (\w+)' '$2 $1'

# Literal string mode (no regex)
sd -F 'exact.string' 'replacement' file.txt

# Combined with fd for bulk operations
fd -e rs | xargs sd 'old_fn' 'new_fn'

# Combined with rg to find then replace
rg -l 'deprecated_call' | xargs sd 'deprecated_call' 'new_call'
```

### When to Use

- **Any** text substitution — `sd` fully replaces `sed` on this system
- In-place file modifications
- Regex-based find and replace across files
- Piped text transformations
- Translating `sed` commands from online guides or Stack Overflow answers

### Advantages Over sed

- Uses standard regex syntax (no need to escape `(`, `)`, `+`, etc.)
- Intuitive capture group references (`$1` not `\1`)
- `-F` flag for literal strings without regex interpretation
- Cleaner multi-file operation syntax

### sed → sd Translation Guide

Common `sed` patterns and their `sd` equivalents:

```sh
# sed: in-place replacement
sed -i 's/old/new/g' file.txt
# sd:
sd 'old' 'new' file.txt

# sed: capture groups
sed -i 's/\(foo\)_\(bar\)/\2_\1/g' file.txt
# sd: standard regex, $N references
sd '(foo)_(bar)' '$2_$1' file.txt

# sed: extended regex with -E
sed -Ei 's/v([0-9]+)\.([0-9]+)/v\1.\2.0/g' file.txt
# sd: extended regex is the default
sd 'v([0-9]+)\.([0-9]+)' 'v$1.$2.0' file.txt

# sed: delete lines matching pattern
sed -i '/pattern/d' file.txt
# sd: replace entire line (including newline) with nothing
sd '.*pattern.*\n' '' file.txt

# sed: insert text after a line
sed -i '/marker/a new_line' file.txt
# sd: match and append
sd '(.*marker.*)' '$1\nnew_line' file.txt

# sed: replace only first occurrence
sed -i '0,/old/{s/old/new/}' file.txt
# sd: no built-in "first only" — pipe through head/tail or use an anchored pattern
# For simple cases, make the pattern more specific to match only once

# sed: multiple expressions
sed -i -e 's/a/b/g' -e 's/c/d/g' file.txt
# sd: run twice (sd does one pattern per invocation)
sd 'a' 'b' file.txt && sd 'c' 'd' file.txt

# sed: pipe from stdin
echo 'hello world' | sed 's/world/earth/'
# sd:
echo 'hello world' | sd 'world' 'earth'

# sed: literal string with special chars
sed -i 's/\[ERROR\]/[WARN]/g' file.txt
# sd: use -F for literal mode (no escaping needed)
sd -F '[ERROR]' '[WARN]' file.txt

# sed: backreference to whole match
echo 'foo' | sed 's/.*/"&"/'
# sd: use $0 for whole match
echo 'foo' | sd '.*' '"$0"'
```

### Key Differences to Remember

| Concept | `sed` | `sd` |
|---------|-------|------|
| In-place flag | `-i` (required) | Default behavior on files |
| Regex groups | `\(` and `\)` (BRE) or `(` `)` with `-E` | `(` and `)` always |
| Capture refs | `\1`, `\2` | `$1`, `$2` |
| Whole match ref | `&` | `$0` |
| Literal strings | Escape everything | `-F` flag |
| Delimiter | `s/pat/rep/` (or `s|pat|rep|`) | Two separate arguments |
| Global replace | Needs `/g` flag | Global by default |

## serpl - TUI Search and Replace

**Installation verified:** `/usr/bin/serpl`

### Common Usage

```sh
# Launch interactive TUI in current directory
serpl

# Launch with initial search pattern
serpl --search 'pattern'

# Launch with search and replacement pre-filled
serpl --search 'old' --replace 'new'

# Specify directory
serpl --dir /path/to/project
```

### When to Use

- Interactive project-wide search and replace
- When you want to visually review each replacement
- Complex refactoring that benefits from an editor-like TUI
- Bulk replacements where confirmation is needed per occurrence

### Notes

- Not a replacement for any specific tool — provides a dedicated TUI experience for search/replace workflows
- Uses ripgrep under the hood for fast searching
- Supports regex patterns
- Shows preview of changes before applying

## dust - Directory Disk Usage

**Installation verified:** `/usr/bin/dust`

### Common Usage

```sh
# Show disk usage of current directory (visual tree)
dust

# Show disk usage of specific path
dust /path/to/dir

# Limit depth
dust -d 2

# Show only N largest items
dust -n 10

# Reverse sort (smallest first)
dust -r

# Show apparent size (not disk blocks)
dust -s

# Show hidden files
dust -H

# Ignore directories matching pattern
dust -X .git -X node_modules

# Show only files (no directories)
dust -f

# Show only directories
dust -D

# Show full paths
dust -p

# No percent bars (compact output)
dust -b
```

### When to Use

- Finding what's consuming disk space in a directory
- Visualizing directory size distribution
- Identifying large files/directories for cleanup
- Any task that would use `du -sh * | sort -h`

### Advantages Over du

- Visual bar chart shows relative sizes at a glance
- Sorted by size by default (largest first)
- Tree structure shows hierarchy clearly
- Respects terminal width for clean formatting
- No need to pipe through `sort` or `head`

### User Configuration

System abbreviation: `du` → `dust`

## duf - Filesystem Disk Usage

**Installation verified:** `/usr/bin/duf`

### Common Usage

```sh
# Show all mounted filesystems
duf

# Show specific path
duf /home

# Show only local filesystems
duf --only local

# Show only network filesystems
duf --only network

# Show specific filesystem types
duf --only ext4,btrfs

# Hide specific filesystem types
duf --hide special

# Sort by size
duf --sort size

# Sort by usage percentage
duf --sort usage

# JSON output (for scripting)
duf --json

# Show all (including pseudo/special filesystems)
duf --all

# Show inodes instead of blocks
duf --inodes
```

### When to Use

- Checking available disk space across filesystems
- Monitoring filesystem usage
- Identifying nearly-full partitions
- Any task that would use `df -h`

### Advantages Over df

- Color-coded usage bars
- Groups by device type (local, network, special)
- Clean table formatting
- Shows all relevant info without cryptic column headers
- JSON output for scripting

### User Configuration

System abbreviation: `df` → `duf`

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

## Text Substitution Patterns

### sd for Inline/Piped Replacements

```sh
# Rename variables across a project
fd -e py | xargs sd 'old_var_name' 'new_var_name'

# Fix import paths
fd -e ts | xargs sd 'from "@old/path"' 'from "@new/path"'

# Strip trailing whitespace
sd '\s+$' '' file.txt

# Convert snake_case to camelCase (simple cases)
echo 'my_var_name' | sd '_([a-z])' '${1}'

# Bump version numbers
sd 'version = "([0-9]+)\.([0-9]+)\.([0-9]+)"' 'version = "$1.$2.99"' Cargo.toml

# Comment out a config line
sd '^(dangerous_setting.*)' '# $1' config.toml

# Uncomment a config line
sd '^# (wanted_setting.*)' '$1' config.toml

# Replace literal JSON key (no regex escaping needed)
sd -F '"debug": true' '"debug": false' settings.json

# Chain with rg: find files containing pattern, then replace
rg -l 'deprecated_api' src/ | xargs sd 'deprecated_api' 'new_api'

# Normalize line endings (CRLF to LF)
sd '\r\n' '\n' file.txt

# Add prefix to matching lines via capture
sd '^(TODO.*)' '[URGENT] $1' notes.md
```

### serpl for Interactive Workflows

```sh
# Visual refactoring session
serpl --search 'ClassName' --replace 'NewClassName'

# Review and selectively apply replacements
serpl
```
