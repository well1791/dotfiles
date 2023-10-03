function gcb --description "Clones a repo as bare and set up two worktrees."
    set repo "$argv[1]"
    set dir "$argv[2]"

    if test -z $dir
        set dir (echo "$repo" | grep -o '[^/]*$')
    end

    set proj_name (string join . (string split . "$dir")[1..-2])

    git clone --single-branch --bare "$repo" "$dir"

    cd "$dir"

    git fetch --all --prune
    git config --local --add remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
    git worktree add -b rename1 wt/1/$proj_name
    git worktree add -b rename2 wt/2/$proj_name

    cd wt/1/$proj_name
end
