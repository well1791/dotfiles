# Television (fuzzy finder) shell integration for fish
# https://github.com/alexpasmantier/television

if not command -v tv >/dev/null 2>&1
    exit
end

# Initialize shell integration (Ctrl-T smart autocomplete, Ctrl-R history)
tv init fish | source
