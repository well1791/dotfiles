# Skim (fuzzy finder) configuration for fish shell
# https://github.com/skim-rs/skim

# Only configure if skim is installed
if not command -v sk >/dev/null 2>&1
    exit
end

# Default skim options
set -gx SKIM_DEFAULT_OPTIONS --height 40% --reverse --border

# Skim command configuration (similar to FZF_DEFAULT_COMMAND)
# Use fd if available, otherwise fall back to find
if command -v fd >/dev/null 2>&1
    set -gx SKIM_DEFAULT_COMMAND fd --type f --hidden --follow --exclude .git
else if command -v rg >/dev/null 2>&1
    set -gx SKIM_DEFAULT_COMMAND rg --files --hidden --follow --glob "!.git/*"
end

# Key bindings for skim in fish
# These mirror common fzf bindings

# Ctrl-T: Paste the selected file path(s) into the command line
function __skim_find_file
    set -l commandline (__skim_parse_commandline)
    set -l dir $commandline[1]
    set -l skim_query $commandline[2]

    # Use SKIM_CTRL_T_COMMAND if defined, otherwise use default
    set -l cmd
    if set -q SKIM_CTRL_T_COMMAND
        set cmd $SKIM_CTRL_T_COMMAND
    else if command -v fd >/dev/null 2>&1
        set cmd "fd --type f --hidden --follow --exclude .git . $dir"
    else
        set cmd "find -L $dir -type f 2>/dev/null"
    end

    eval $cmd | sk -m $SKIM_DEFAULT_OPTIONS $SKIM_CTRL_T_OPTS --query "$skim_query" | while read -l result
        echo $result
    end
end

# Alt-C: cd into the selected directory
function __skim_cd
    set -l commandline (__skim_parse_commandline)
    set -l dir $commandline[1]
    set -l skim_query $commandline[2]

    # Use SKIM_ALT_C_COMMAND if defined, otherwise use default
    set -l cmd
    if set -q SKIM_ALT_C_COMMAND
        set cmd $SKIM_ALT_C_COMMAND
    else if command -v fd >/dev/null 2>&1
        set cmd "fd --type d --hidden --follow --exclude .git . $dir"
    else
        set cmd "find -L $dir -type d 2>/dev/null"
    end

    eval $cmd | sk $SKIM_DEFAULT_OPTIONS $SKIM_ALT_C_OPTS --query "$skim_query" | read -l result
    if test -n "$result"
        cd -- $result
        commandline -f repaint
    end
end

# Helper function to parse the current command line
function __skim_parse_commandline
    set -l commandline (commandline -t)
    set -l dir "."
    set -l skim_query ""

    if test -d $commandline
        set dir $commandline
    else
        set skim_query $commandline
    end

    echo $dir
    echo $skim_query
end

# Bind keys (only in interactive mode)
if status is-interactive
    # Ctrl-T: Find file
    bind \ct '__skim_find_file | while read -l result; echo $result; end | commandline -i'

    # Alt-C: Change directory
    bind \ec __skim_cd
end

# Fish completion integration
# This makes skim work with fish's tab completion
function __skim_complete
    set -l commandline (commandline -o)
    set -l cmd $commandline[1]

    # Get completion candidates
    complete -C | sk --height 40% --reverse --border | read -l result
    and commandline -t -- $result
end

# Optional: uncomment to use skim for completions with Ctrl-Space
# bind \c\  __skim_complete
