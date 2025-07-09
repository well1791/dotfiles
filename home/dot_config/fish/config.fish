# default
set -g fish_greeting
set -gx LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=-2"

# Try common helix binary names in common locations
set helix_paths /usr/local/bin/hx /usr/local/bin/helix /usr/bin/hx /usr/bin/helix ~/.cargo/bin/hx

for path in $helix_paths
    if test -x $path
        set -gx EDITOR $path
        set -gx VISUAL $path
        break
    end
end

if not set -q EDITOR
    echo "Warning: Could not find helix editor" >&2
    set -gx EDITOR vim
    set -gx VISUAL vim
end

fish_add_path -m ~/.local/bin

# #rbenv
#set -gx PATH /opt/homebrew/opt/ruby/bin $PATH
#set -gx PATH "$HOME/.rbenv/bin" $PATH
#eval "$(rbenv init -)"

# #bun
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH
