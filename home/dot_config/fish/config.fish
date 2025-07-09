# default
set -g fish_greeting
#set -gx EDITOR /usr/local/bin/hx
#set -gx VISUAL /usr/local/bin/hx
set -gx LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=-2"

fish_add_path -m ~/.local/bin

# #rbenv
#set -gx PATH /opt/homebrew/opt/ruby/bin $PATH
#set -gx PATH "$HOME/.rbenv/bin" $PATH
#eval "$(rbenv init -)"

# #bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH
