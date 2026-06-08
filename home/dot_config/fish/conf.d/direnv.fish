# direnv shell integration for fish
# https://direnv.net

if not command -v direnv >/dev/null 2>&1
    exit
end

direnv hook fish | source
