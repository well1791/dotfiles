#!/usr/bin/env bash
set -euo pipefail

# pr-create.sh - Wrapper for `bkt pr create` with intelligent defaults
# Part of the pr-create skill

show_usage() {
    cat <<EOF
Usage: pr-create.sh [OPTIONS]

Create a Bitbucket PR with intelligent defaults for target, reviewers, and draft status.

The script automatically:
  - Detects current branch as --source
  - Sets --target to 'dev'
  - Adds --draft, --close-source, --with-default-reviewers flags
  - Extracts title from first non-merged commit
  - Generates description using pr-description skill

Options:
  --target BRANCH    Override target branch (default: dev)
  --title TITLE      Override auto-detected title
  --description TEXT Override auto-generated description
  --no-draft         Don't create as draft
  --help             Show this help message

Examples:
  # Create PR with all defaults
  pr-create.sh

  # Override target branch
  pr-create.sh --target main

  # Custom title and description
  pr-create.sh --title "Fix bug" --description "Fixed the thing"

Requirements:
  - bkt CLI must be installed
  - Git repository with commits ahead of target branch
  - pr-description skill available (for description generation)
EOF
}

# Default values
TARGET_BRANCH="dev"
USE_DRAFT="--draft"
TITLE=""
DESCRIPTION=""

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            TARGET_BRANCH="$2"
            shift 2
            ;;
        --title)
            TITLE="$2"
            shift 2
            ;;
        --description)
            DESCRIPTION="$2"
            shift 2
            ;;
        --no-draft)
            USE_DRAFT=""
            shift
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_usage >&2
            exit 1
            ;;
    esac
done

# Validate we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "Error: Not in a git repository" >&2
    exit 1
fi

# Check if bkt is available
if ! command -v bkt &> /dev/null; then
    echo "Error: bkt command not found. Please install it first." >&2
    exit 1
fi

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)
if [[ -z "$CURRENT_BRANCH" ]]; then
    echo "Error: Not on a branch (detached HEAD?)" >&2
    exit 1
fi

echo "Source branch: $CURRENT_BRANCH" >&2
echo "Target branch: $TARGET_BRANCH" >&2

# Get title from first non-merged commit if not provided
if [[ -z "$TITLE" ]]; then
    # Find commits on current branch not in target
    TITLE=$(git log --pretty=format:"%s" "origin/${TARGET_BRANCH}..HEAD" | tail -n 1)
    
    if [[ -z "$TITLE" ]]; then
        echo "Error: Could not auto-detect title. No commits ahead of origin/${TARGET_BRANCH}" >&2
        echo "Hint: Use --title to specify manually" >&2
        exit 1
    fi
    
    echo "Auto-detected title: $TITLE" >&2
fi

# Get description from clipboard if not provided
if [[ -z "$DESCRIPTION" ]]; then
    echo "Reading PR description from clipboard..." >&2
    
    # Try to read from clipboard
    if command -v wl-paste &> /dev/null; then
        DESCRIPTION=$(wl-paste 2>/dev/null || true)
    elif command -v xclip &> /dev/null; then
        DESCRIPTION=$(xclip -o -selection clipboard 2>/dev/null || true)
    elif command -v pbpaste &> /dev/null; then
        DESCRIPTION=$(pbpaste 2>/dev/null || true)
    fi
    
    if [[ -z "$DESCRIPTION" ]]; then
        echo "Error: No description provided and clipboard is empty" >&2
        echo "" >&2
        echo "Please either:" >&2
        echo "  1. Run pr-description skill first to generate description (copies to clipboard)" >&2
        echo "  2. Provide description with --description flag" >&2
        echo "" >&2
        echo "Example workflow:" >&2
        echo "  # Agent invokes pr-description skill (generates and copies description)" >&2
        echo "  # Then run:" >&2
        echo "  pr-create.sh" >&2
        exit 1
    fi
    
    echo "Description loaded from clipboard ($(echo "$DESCRIPTION" | wc -l) lines)" >&2
fi

# Build the bkt pr create command
CMD=(
    bkt pr create
    --source "$CURRENT_BRANCH"
    --target "$TARGET_BRANCH"
    --close-source
    --with-default-reviewers
    --title "$TITLE"
    --description "$DESCRIPTION"
)

# Add draft flag if enabled
if [[ -n "$USE_DRAFT" ]]; then
    CMD+=("$USE_DRAFT")
fi

# Show the command being executed (for debugging)
echo "Executing: ${CMD[*]}" >&2
echo "" >&2

# Execute the command
"${CMD[@]}"
