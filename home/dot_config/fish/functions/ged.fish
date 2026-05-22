function ged --description 'Open modified and untracked files in Helix'
    begin
        git diff --name-only --diff-filter=d HEAD
        and git ls-files --others --exclude-standard
    end | xargs $EDITOR
end
