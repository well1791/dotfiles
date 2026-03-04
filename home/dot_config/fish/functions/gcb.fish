function gcb --description "Clones a repo as bare and set up two worktrees."
    set repo "$argv[1]"
    set proj_name "$argv[2]"

    mkdir "$proj_name"
    cd "$proj_name"

    git clone --single-branch --bare "$repo" .git
    git config --local --add remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
    git fetch --all --prune
    git worktree add 1
    git worktree add 2
    git worktree add 3

    cd 1
end
