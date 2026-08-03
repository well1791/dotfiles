# sesh (smart tmux/rmux session manager) abbreviations
# Uses television as the session picker (tv sesh channel).
#   ss  -> sesh          (e.g. `ss list`, `ss last`)
#   ssa -> tv sesh       (interactive session picker via television)
#
# Note: `ss` shadows /usr/bin/ss (socket statistics). Use `command ss` if needed.
abbr -a -- ss sesh
abbr -a -- ssa 'tv sesh'
