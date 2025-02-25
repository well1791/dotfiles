# git rush
abbr -a -- gg 'git add . && git commit -m "WIP" -an && git push --force-with-lease'

# git fetch
abbr -a -- gf 'git pull --ff-only --all --prune'
abbr -a -- gfa 'git fetch --all --prune'

# git push
abbr -a -- gp 'git push'
abbr -a -- gpc 'git push --set-upstream origin (git branch --show-current)'
abbr -a -- gpf 'git push --force-with-lease'

# git add
abbr -a -- ga 'git add'
abbr -a -- gaa 'git add .'

# git diff
abbr -a -- gd 'git diff --no-ext-diff'
abbr -a -- gds 'git diff --no-ext-diff --cached'

# git branch
abbr -a -- gb 'git branch'
abbr -a -- gba 'git branch -a'
abbr -a -- gbx 'git branch -D'
abbr -a -- gbm 'git branch -m'
abbr -a -- gbc 'git checkout -b'

# git checkout
abbr -a -- go 'git checkout'
abbr -a -- goc 'git checkout -- .'
abbr -a -- god 'git checkout origin/dev'
abbr -a -- gom 'git checkout origin/main'

# git commit
abbr -a -- gc 'git commit --verbose'
abbr -a gcm --set-cursor 'git commit --message "%" -a'
abbr -a -- gce 'git commit --verbose --amend -a'
abbr -a -- gcf 'git commit --amend --reuse-message HEAD -a'

# git merge
abbr -a -- gm 'git merge'
abbr -a -- gmc 'git merge --continue'
abbr -a -- gma 'git merge --abort'

# git status
abbr -a -- gs 'git status --short'
abbr -a -- gss 'git status --verbose'

# git worktree
abbr -a -- gw 'git worktree'

# git rebase
abbr -a -- gr 'git rebase'
abbr -a -- gri 'git rebase -i'
abbr -a -- grc 'git rebase --continue'
abbr -a -- gra 'git rebase --abort'
abbr -a -- grd 'git rebase origin/dev'

# git reset
abbr -a -- ge 'git reset --hard'

# git log
set -g _git_log_fuller_format '%C(bold yellow)commit %h%C(auto)%d%n%C(bold)Author: %C(blue)%an <%ae >%C(reset)%C(cyan)%ai (%ar)%n%C(bold)Commit: %C(blue)%cn <%ce >%C(reset)%C(cyan)%ci (%cr)%C(reset)%n%+B'
set -g _git_log_oneline_format '%C(bold yellow)%h%C(reset) %s%C(auto)%d%C(reset)'

abbr -a -- gl 'git log --topo-order --pretty=format:(echo $_git_log_oneline_format) -11'
abbr -a -- gll 'git log --topo-order --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gld 'git log --topo-order --stat --patch --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gls 'git log --topo-order --stat --pretty=format:(echo $_git_log_fuller_format) -11'
