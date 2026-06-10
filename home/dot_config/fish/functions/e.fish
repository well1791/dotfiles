function e --description 'Edit files, optionally git-changed'
    argparse h/help g/git u/untracked m/modified s/staged c/conflicts d/deleted r/renamed -- $argv
    or return 1

    if set -q _flag_help
        echo "Usage: e [OPTIONS] [FILES...]"
        echo ""
        echo "Open files in \$EDITOR. Without arguments, opens git-changed files."
        echo "With file arguments and no flags, opens only those files."
        echo ""
        echo "Git options (combinable, union with any file arguments):"
        echo "  -g, --git         All git-changed files (modified + untracked, excl. deleted/renamed)"
        echo "  -u, --untracked   Untracked files"
        echo "  -m, --modified    Modified files (unstaged)"
        echo "  -s, --staged      Staged files"
        echo "  -c, --conflicts   Files with merge conflicts"
        echo "  -d, --deleted     Deleted files"
        echo "  -r, --renamed     Renamed files"
        echo "  -h, --help        Show this help"
        echo ""
        echo "Examples:"
        echo "  e foo.rs          Open foo.rs"
        echo "  e -g foo.rs       Git-changed files + foo.rs"
        echo "  e -ms             Modified + staged files"
        echo "  e                 Same as: e -g"
        return 0
    end

    # Determine if any git flag is active
    set -l has_git_flag
    if set -q _flag_git; or set -q _flag_untracked; or set -q _flag_modified
        or set -q _flag_staged; or set -q _flag_conflicts; or set -q _flag_deleted
        or set -q _flag_renamed
        set has_git_flag 1
    end

    # Case: explicit files, no git flags → open only those files
    if test (count $argv) -gt 0; and not set -q has_git_flag
        $EDITOR $argv
        return $status
    end

    # Case: no args, no flags → default to -g behavior
    if test (count $argv) -eq 0; and not set -q has_git_flag
        set _flag_git 1
        set has_git_flag 1
    end

    # Git flags are active — check we're in a git repo
    if not git rev-parse --is-inside-work-tree >/dev/null 2>&1
        # Not in a git repo — open editor with explicit files or no args
        $EDITOR $argv
        return $status
    end

    # Collect git files
    set -l git_files

    if set -q _flag_git
        # Default set: all modified (staged + unstaged) + untracked, excluding deleted/renamed
        set git_files (
            begin
                git diff --name-only --diff-filter=dr HEAD 2>/dev/null
                git diff --cached --name-only --diff-filter=dr 2>/dev/null
                git ls-files --others --exclude-standard 2>/dev/null
            end
        )
    else
        if set -q _flag_untracked
            set -a git_files (git ls-files --others --exclude-standard 2>/dev/null)
        end
        if set -q _flag_modified
            set -a git_files (git diff --name-only --diff-filter=d 2>/dev/null)
        end
        if set -q _flag_staged
            set -a git_files (git diff --cached --name-only --diff-filter=d 2>/dev/null)
        end
        if set -q _flag_conflicts
            set -a git_files (git diff --name-only --diff-filter=U 2>/dev/null)
        end
        if set -q _flag_deleted
            set -a git_files (git diff --name-only --diff-filter=D HEAD 2>/dev/null)
        end
        if set -q _flag_renamed
            set -a git_files (git diff --name-only --diff-filter=R HEAD 2>/dev/null)
        end
    end

    # Union git files with explicit file args, deduplicate
    set -l all_files $git_files $argv
    if test (count $all_files) -eq 0
        $EDITOR .
        return $status
    end

    set all_files (printf '%s\n' $all_files | sort -u)
    $EDITOR $all_files
end
