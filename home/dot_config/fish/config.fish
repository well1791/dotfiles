# |-- DEFAULT
set -g fish_greeting
set -gx LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=2"
set -g XDG_CONFIG_HOME "$HOME/.config"
set -g SUDO_EDITOR helix

fish_add_path -m ~/.local/bin

# |-- API KEYS
# Load API keys from separate file (not tracked in git)
if test -f ~/.config/fish/api-keys.fish
    source ~/.config/fish/api-keys.fish
end

# |-- BUN
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH

# |-- PI (must come after BUN to take precedence)
set --export PATH ~/.pi/agent/bin $PATH

# |-- TV
if status is-interactive
    tv init fish | source
end

# atlcli
fish_add_path /home/well/.atlcli/bin
