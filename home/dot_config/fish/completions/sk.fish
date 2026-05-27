# Fish completion for skim (sk)
# https://github.com/skim-rs/skim

# Main options
complete -c sk -s h -l help -d 'Print help information'
complete -c sk -s V -l version -d 'Print version information'
complete -c sk -s m -l multi -d 'Enable multi-select with tab/shift-tab'
complete -c sk -l no-multi -d 'Disable multi-select'
complete -c sk -s i -l interactive -d 'Start in interactive mode'
complete -c sk -s q -l query -d 'Start with the given query' -r
complete -c sk -s c -l cmd -d 'Command to execute for each query' -r
complete -c sk -l cmd-query -d 'Execute command with query as argument' -r

# Interface options
complete -c sk -l reverse -d 'Display from top to bottom'
complete -c sk -l height -d 'Height of skim window' -r
complete -c sk -l min-height -d 'Minimum height when --height is given' -r
complete -c sk -l no-height -d 'Disable height limit'
complete -c sk -l prompt -d 'Prompt string' -r
complete -c sk -l cmd-prompt -d 'Command prompt string' -r
complete -c sk -l margin -d 'Screen margin (TRBL)' -r
complete -c sk -l inline-info -d 'Display info next to query'
complete -c sk -l header -d 'Header text' -r
complete -c sk -l header-lines -d 'Number of header lines' -r

# Layout options
complete -c sk -l layout -d 'Layout mode' -r -xa 'default reverse reverse-list'
complete -c sk -l border -d 'Draw border around the finder'
complete -c sk -l no-border -d "Don't draw border"

# Search options
complete -c sk -l algo -d 'Fuzzy matching algorithm' -r -xa 'skim_v1 skim_v2 clangd'
complete -c sk -l case -d 'Case sensitivity' -r -xa 'smart respect ignore'
complete -c sk -l literal -d 'Do not use fuzzy matching'
complete -c sk -s e -l exact -d 'Enable exact match'
complete -c sk -s r -l regex -d 'Regex mode'
complete -c sk -l nth -d 'Comma-separated list of field indices' -r
complete -c sk -s d -l delimiter -d 'Field delimiter' -r
complete -c sk -l with-nth -d 'Transform the item using field indices' -r
complete -c sk -s n -l no-sort -d 'Do not sort the result'
complete -c sk -l tac -d 'Reverse the order of the input'
complete -c sk -l tiebreak -d 'Comma-separated criteria' -r

# Filtering options
complete -c sk -l filter -d 'Filter mode (non-interactive)' -r
complete -c sk -l no-filter -d 'Disable filter mode'

# Preview options
complete -c sk -l preview -d 'Preview command' -r
complete -c sk -l preview-window -d 'Preview window layout' -r

# Scripting options
complete -c sk -l print-query -d 'Print query as the first line'
complete -c sk -l print-cmd -d 'Print command query on exit'
complete -c sk -l print0 -d 'Use null character as separator'
complete -c sk -l read0 -d 'Read null-terminated input'
complete -c sk -l sync -d 'Synchronous search'
complete -c sk -l no-sync -d 'Asynchronous search (default)'

# Key bindings
complete -c sk -l bind -d 'Custom key bindings' -r
complete -c sk -l expect -d 'Comma-separated list of expected keys' -r

# Color options
complete -c sk -l color -d 'Color scheme' -r
complete -c sk -l no-color -d 'Disable colors'
complete -c sk -l no-bold -d 'Do not use bold text'
complete -c sk -l black -d 'Use black background'

# Miscellaneous
complete -c sk -s 1 -l select-1 -d 'Auto-select if only one match'
complete -c sk -s 0 -l exit-0 -d 'Exit if no match'
complete -c sk -s f -l filter -d 'Filter mode (no interactive finder)' -r
complete -c sk -l tabstop -d 'Number of spaces for tab' -r
complete -c sk -l no-mouse -d 'Disable mouse'
complete -c sk -l no-hscroll -d 'Disable horizontal scroll'
complete -c sk -l hscroll-off -d 'Screen offset in horizontal scroll' -r
complete -c sk -l filepath-word -d 'Make word-wise movements respect path separators'
complete -c sk -l jump-labels -d 'Characters to use for jump mode' -r
complete -c sk -l history -d 'History file path' -r
complete -c sk -l history-size -d 'Maximum history entries' -r
complete -c sk -l keep-right -d 'Keep the right end of the line visible'
complete -c sk -l skip-to-pattern -d 'Pattern to skip to' -r
