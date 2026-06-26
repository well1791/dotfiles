# |-- DEFAULT
set --global fish_greeting
set --global XDG_CONFIG_HOME "$HOME/.config"
set --global --export LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=2"

fish_add_path -m ~/.local/bin

# |-- API KEYS
# Load API keys from separate file (not tracked in git)
if test -f $XDG_CONFIG_HOME/fish/api-keys.fish
    source $XDG_CONFIG_HOME/fish/api-keys.fish
end

# |-- BUN
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

# |-- RUST/CARGO
if test -d ~/.cargo/bin
    set --export PATH ~/.cargo/bin $PATH
end

# |-- PI (must come after BUN to take precedence)
set --export PATH ~/.pi/agent/bin $PATH

# |-- TV
if status is-interactive
    tv init fish | source
end

# |-- ATUIN (shell history)
if status is-interactive
    atuin init fish | source
end

# |-- atlcli
fish_add_path $HOME/.atlcli/bin
