function ged --description 'Open git-changed files in editor'
    argparse 'h/help' 'u/untracked' 'm/modified' 's/staged' 'c/conflicts' 'd/deleted' 'r/renamed' -- $argv
    or return 1

    if set -q _flag_help
        echo "Usage: ged [OPTIONS]"
        echo ""
        echo "Open git-changed files in \$EDITOR."
        echo "Without flags, opens all modified + untracked files (excluding deleted/renamed)."
        echo ""
        echo "Options:"
        echo "  -u, --untracked   Untracked files"
        echo "  -m, --modified    Modified files (not staged)"
        echo "  -s, --staged      Staged files"
        echo "  -c, --conflicts   Files with merge conflicts"
        echo "  -d, --deleted     Deleted files"
        echo "  -r, --renamed     Renamed files"
        echo "  -h, --help        Show this help"
        echo ""
        echo "Flags are combinable: ged -ums (untracked + modified + staged)"
        return 0
    end

    set -l files

    if not set -q _flag_untracked; and not set -q _flag_modified; and not set -q _flag_staged
        and not set -q _flag_conflicts; and not set -q _flag_deleted; and not set -q _flag_renamed
        # Default: all modified (staged + unstaged) + untracked, excluding deleted/renamed
        set files (
            begin
                git diff --name-only --diff-filter=dr HEAD
                git diff --cached --name-only --diff-filter=dr
                git ls-files --others --exclude-standard
            end
        )
    else
        if set -q _flag_untracked
            set -a files (git ls-files --others --exclude-standard)
        end
        if set -q _flag_modified
            set -a files (git diff --name-only --diff-filter=d)
        end
        if set -q _flag_staged
            set -a files (git diff --cached --name-only --diff-filter=d)
        end
        if set -q _flag_conflicts
            set -a files (git diff --name-only --diff-filter=U)
        end
        if set -q _flag_deleted
            set -a files (git diff --name-only --diff-filter=D HEAD)
        end
        if set -q _flag_renamed
            set -a files (git diff --name-only --diff-filter=R HEAD)
        end
    end

    if test (count $files) -eq 0
        echo "No files found."
        return 0
    end

    # Deduplicate
    set files (printf '%s\n' $files | sort -u)
    $EDITOR $files
end
