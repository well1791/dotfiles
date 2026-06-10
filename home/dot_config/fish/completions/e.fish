# Completions for e - edit files, optionally git-changed
complete -c e -s g -l git -d 'All git-changed files (modified + untracked, excl. deleted/renamed)'
complete -c e -s u -l untracked -d 'Untracked files'
complete -c e -s m -l modified -d 'Modified files (unstaged)'
complete -c e -s s -l staged -d 'Staged files'
complete -c e -s c -l conflicts -d 'Files with merge conflicts'
complete -c e -s d -l deleted -d 'Deleted files'
complete -c e -s r -l renamed -d 'Renamed files'
complete -c e -s h -l help -d 'Show this help'
