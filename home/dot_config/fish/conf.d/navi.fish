# Navi fish shell integration
# https://github.com/denisidoro/navi/blob/master/docs/widgets/README.md

# Only load if navi is installed
if command -v navi &>/dev/null
    # Ctrl+G to open navi
    bind \cg "commandline -r (navi --print); commandline -f repaint"

    # ntldr: shortcut for tldr-backed lookup (live tldr-pages via tealdeer).
    # Use for generic tools that don't need a hand-written cheat. See AGENTS.md §5.
    function ntldr --description "navi --tldr <query> — live tldr-pages lookup"
        navi --tldr $argv
    end
end
