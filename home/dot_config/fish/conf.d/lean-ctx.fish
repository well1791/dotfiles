if not command -v lean-ctx >/dev/null 2>&1; exit; end
lean-ctx init fish | string match -v '*isatty stdout; and echo*' | source
