# git push in a rush
abbr -a -- gg 'git add . && git commit -m "WIP" -an && git push --set-upstream origin (git branch --show-current) --force-with-lease'

# git fetch
abbr -a -- gf 'git fetch --all --prune'

# git push
abbr -a -- gp 'git push --set-upstream origin (git branch --show-current) --force-with-lease'

# git add
abbr -a -- ga 'git add'
abbr -a -- gaa 'git add .'

# git diff
abbr -a -- gdi 'git diff --no-ext-diff'
abbr -a -- gdis 'git diff --no-ext-diff --cached'

# git edit
abbr -a -- ged 'git diff --name-only HEAD | xargs helix'

# git branch
abbr -a -- gbr 'git branch'
abbr -a -- gbra 'git branch --all'
abbr -a -- gbrx 'git branch --delete --force'
abbr -a -- gbrm 'git branch --move'
abbr -a -- gbrc 'git switch --copy'

# git status
abbr -a -- gst 'git status --short'
abbr -a -- gsts 'git status --short'
abbr -a -- gstv 'git status --verbose'

# git switch
abbr -a -- gsw 'git switch'
abbr -a -- gswd 'git switch --detach'
abbr -a -- gswdv 'git switch --detach origin/dev'

# git restore
abbr -a -- grs 'git restore .'

# git commit
abbr -a -- gco 'git commit --verbose'
abbr -a gcom --set-cursor 'git commit --message "%"'
abbr -a -- gcoe 'git commit --verbose --amend'
abbr -a -- gcof 'git commit --amend --reuse-message HEAD'

# git merge
abbr -a -- gme 'git merge'
abbr -a -- gmec 'git merge --continue'
abbr -a -- gmea 'git merge --abort'

# git rebase
abbr -a -- grb 'git rebase'
abbr -a -- grbi 'git rebase --interactive'
abbr -a -- grbc 'git rebase --continue'
abbr -a -- grba 'git rebase --abort'
abbr -a -- grbd 'git rebase origin/dev'
abbr -a -- grbm 'git rebase origin/dev'

# git reset
abbr -a -- gre 'git reset --hard && git clean -fd'

# git log
set -g _git_log_fuller_format '%C(bold yellow)commit %h%C(auto)%d%n%C(bold)Author: %C(blue)%an <%ae >%C(reset)%C(cyan)%ai (%ar)%n%C(bold)Commit: %C(blue)%cn <%ce >%C(reset)%C(cyan)%ci (%cr)%C(reset)%n%+B'
set -g _git_log_oneline_format '%C(bold yellow)%h%C(reset) %s%C(auto)%d%C(reset)'

abbr -a -- glo 'git log --topo-order --pretty=format:(echo $_git_log_oneline_format) -11'
abbr -a -- glol 'git log --topo-order --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- glod 'git log --topo-order --stat --patch --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- glos 'git log --topo-order --stat --pretty=format:(echo $_git_log_fuller_format) -11'
