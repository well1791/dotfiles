# custom
abbr -a -- cmd 'command'
abbr -a -- pfn 'printf "%s\n"'
abbr -a -- j 'zellij'
abbr -a -- x 'hx'
abbr -a -- ls 'exa'
abbr -a -- l 'exa --all --long'
abbr -a -- ll 'exa --all --long --tree --level=2'
abbr -a -- pc pbcopy
abbr -a -- pp pbpaste
abbr -a -- cat 'bat -p'

# git fetch
abbr -a -- gf 'git fetch --all --prune'
abbr -a -- gfu 'git pull --ff-only --all --prune'

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
abbr -a -- gbx 'git branch -D'
abbr -a -- gbc 'git checkout -b'

# git changes
abbr -a -- gco 'git checkout'
abbr -a -- gc 'git commit --verbose'
abbr -a -- gce 'git commit --amend'
abbr -a -- gca 'git commit --amend --reuse-message HEAD'
abbr -a gcm --set-cursor 'git commit --message "%"'

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
abbr -a -- gra 'git merge --abort'

# git log
set -g _git_log_fuller_format '%C(bold yellow)commit %h%C(auto)%d%n%C(bold)Author: %C(blue)%an <%ae> %C(reset)%C(cyan)%ai (%ar)%n%C(bold)Commit: %C(blue)%cn <%ce> %C(reset)%C(cyan)%ci (%cr)%C(reset)%n%+B'
set -g _git_log_oneline_format '%C(bold yellow)%h%C(reset) %s%C(auto)%d%C(reset)'

abbr -a -- gl 'git log --topo-order --pretty=format:(echo $_git_log_oneline_format) -11'
abbr -a -- gll 'git log --topo-order --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gld 'git log --topo-order --stat --patch --pretty=format:(echo $_git_log_fuller_format) -11'
abbr -a -- gls 'git log --topo-order --stat --pretty=format:(echo $_git_log_fuller_format) -11'

# chezmoi
abbr -a -- m 'chezmoi'


# helix as default editor
set -gx EDITOR /opt/homebrew/bin/hx
set -gx VISUAL /opt/homebrew/bin/hx
set -gx LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=-2"

# rust
set -gx PATH $HOME/.cargo/bin $PATH

# cocoapods
set -gx LC_ALL en_US.UTF-8

# edgedb
set -gx PATH "$HOME/Library/Application Support/edgedb/bin" $PATH

# rbenv
set -gx PATH "/opt/homebrew/opt/ruby/bin" $PATH
set -gx PATH "$HOME/.rbenv/bin" $PATH
eval "$(rbenv init -)"

# bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH
