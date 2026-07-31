# sesh (smart tmux/rmux session manager) abbreviations
# Mirrors the zellij abbrs (zj/zja) for the rmux+sesh stack.
#   ss  -> sesh          (e.g. `ss list`, `ss last`)
#   ssa -> sesh connect  (e.g. `ssa chezmoi`; tab-completes session names)
#
# Note: `ss` shadows /usr/bin/ss (socket statistics). Use `command ss` if needed.
abbr -a -- ss sesh
abbr -a -- ssa 'sesh connect'
