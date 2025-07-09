# see: https://github.com/Schniz/fnm/issues/356
status is-interactive && command -q fnm && fnm env --use-on-cd --shell fish | source

# fnm
set FNM_PATH "$HOME/.local/share/fnm"
if [ -d "$FNM_PATH" ]
    set PATH "$FNM_PATH" $PATH
    fnm env | source
end
