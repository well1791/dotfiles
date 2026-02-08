# |-- DEFAULT
set -g fish_greeting
set -gx LESS "--no-init --RAW-CONTROL-CHARS --ignore-case --quit-if-one-screen --silent --tabs=4 --window=2"
set -g XDG_CONFIG_HOME "$HOME/.config"

fish_add_path -m ~/.local/bin

# |-- BUN
set --export BUN_INSTALL "$HOME/.bun"
set --export PATH $BUN_INSTALL/bin $PATH
