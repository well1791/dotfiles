# see: https://github.com/Schniz/fnm/issues/356
status is-interactive && command -q fnm && fnm env --use-on-cd --shell fish | source
