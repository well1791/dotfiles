function gcb --description "Clones a repo as bare and set up two worktrees."
    set repo "$argv[1]"
    if test (count $argv) -ge 2
        set proj_name "$argv[2]"
    else
        set proj_name (basename "$repo" .git)
    end

    mkdir "$proj_name"
    cd "$proj_name"

    git clone --single-branch --bare "$repo" .git
    git config --local --add remote.origin.fetch "+refs/heads/*:refs/remotes/origin/*"
    git fetch --all --prune
    git worktree add --detach agent
    git worktree add --detach "$proj_name.1"
    git worktree add --detach "$proj_name.2"
    git worktree add --detach "$proj_name.3"
    git branch --delete --force (git branch | awk 'END {print $NF}')

    cd "$proj_name.1"
end
