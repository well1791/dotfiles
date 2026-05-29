# Navi fish shell integration
# https://github.com/denisidoro/navi/blob/master/docs/widgets/README.md

# Only load if navi is installed
if command -v navi &>/dev/null
    # Ctrl+G to open navi
    bind \cg "commandline -r (navi --print); commandline -f repaint"
end
