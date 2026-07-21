# git push in a rush
abbr -a -- gg 'git add . && git commit -m "WIP" -an && git push --set-upstream origin (git branch --show-current) --force-with-lease'

# git fetch
abbr -a -- gfa 'git fetch --all --prune'

# git push
abbr -a -- gpf 'git push --set-upstream origin (git branch --show-current) --force-with-lease'

# git add
abbr -a -- gad 'git add'
abbr -a -- gaa 'git add .'

# git diff
abbr -a -- gdi 'git diff --no-ext-diff'
abbr -a -- gdg 'git diff --no-ext-diff --cached'

# git branch
abbr -a -- gbr 'git branch'
abbr -a -- gba 'git branch --all'
abbr -a -- gbx 'git branch --delete --force'
abbr -a -- gbm 'git branch --move'
abbr -a -- gbc 'git switch --create'
abbr -a -- gby 'git switch --copy'

# git status
abbr -a -- gst 'git status --short'
abbr -a -- gss 'git status --short'
abbr -a -- gsv 'git status --verbose'

# git switch
abbr -a -- gsw 'git switch'
abbr -a -- gsd 'git switch --detach'

# git restore
abbr -a -- grs 'git restore .'
abbr -a -- grg 'git restore --staged .'

# git commit
abbr -a -- gco 'git commit --verbose'
abbr -a gcm --set-cursor 'git commit --message "%"'
abbr -a -- gce 'git commit --verbose --amend'
abbr -a -- gcf 'git commit --amend --reuse-message HEAD'

# git merge
abbr -a -- gme 'git merge'
abbr -a -- gmc 'git merge --continue'
abbr -a -- gma 'git merge --abort'

# git rebase
abbr -a -- grb 'git rebase'
abbr -a -- gri 'git rebase --interactive'
abbr -a -- grc 'git rebase --continue'
abbr -a -- gra 'git rebase --abort'

# git reset
abbr -a -- gre 'git reset'

# git log
set -g _git_log_fuller_format '%C(bold yellow)commit %h%C(auto)%d%n%C(bold)Author: %C(blue)%an <%ae >%C(reset)%C(cyan)%ai (%ar)%n%C(bold)Commit: %C(blue)%cn <%ce >%C(reset)%C(cyan)%ci (%cr)%C(reset)%n%+B'
set -g _git_log_oneline_format '%C(bold yellow)%h%C(reset) %s%C(auto)%d%C(reset)'

abbr -a -- glo 'git log --topo-order --pretty=format:(echo $_git_log_oneline_format) -11'
abbr -a -- gll 'git log --topo-order --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gld 'git log --topo-order --stat --patch --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gls 'git log --topo-order --stat --pretty=format:(echo $_git_log_fuller_format) -11'
