# |-- EZA
abbr -a -- l 'eza --all --long'
abbr -a -- ll 'eza --all --long --tree --level=2'

# |-- BAT
abbr -a -- cat 'bat -p'

# |-- DUST (du replacement)
abbr -a -- du dust

# |-- DUF (df replacement)
abbr -a -- df duf

# |-- EMACS
# abbr -a -- emacs "emacsclient -c -a 'emacs'"

# |-- ALIAS for cmd
abbr -a -- cmd command

# |-- Search word in file
# | usage:
# |        rgd text-to-search path/to/file
abbr -a rgd --set-cursor 'rg --json -C 2 % | delta'
