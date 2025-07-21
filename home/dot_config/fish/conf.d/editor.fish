# Try common helix binary names in common locations
set helix_paths /usr/local/bin/hx /usr/local/bin/helix /usr/bin/hx /usr/bin/helix ~/.cargo/bin/hx

for path in $helix_paths
    if test -x $path
        set -gx EDITOR $path
        set -gx VISUAL $path

        if not type -q hx
            alias hx='helix'
        end
        break
    end
end

if not set -q EDITOR
    echo "Warning: Could not find helix editor" >&2
    set -gx EDITOR vim
    set -gx VISUAL vim
end
