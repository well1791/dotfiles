---
name: pr-create
description: Use when ready to create a Bitbucket pull request from the current branch with auto-detected title, generated description, and standard workflow flags
---

# PR Create

## Overview

Streamline Bitbucket PR creation by wrapping `bkt pr create` with intelligent defaults: auto-detects source branch, targets `dev`, enables draft mode, closes source on merge, adds default reviewers, extracts title from commits, and generates description using the pr-description skill.

## When to Use

- Branch work is complete and verified
- Ready to create a Bitbucket PR
- Want standard PR workflow flags without typing them manually
- Need auto-generated PR description from code changes

## Process

### 1. Generate PR Description

First, invoke the `pr-description` skill to generate the description and copy it to clipboard:

```markdown
Use pr-description skill to generate the PR description from the changes.
```

The pr-description skill will:
- Analyze `git diff origin/dev..HEAD`
- Generate structured Overview and "What this PR does?" sections
- Copy the description to clipboard via `wl-copy`

### 2. Get Description from Clipboard

Read the generated description from clipboard:

```bash
DESCRIPTION=$(wl-paste)
```

### 3. Create the PR

Run the pr-create script with the generated description:

```bash
# From skill directory
./pr-create.sh

# With custom description (from clipboard or custom)
./pr-create.sh --description "$DESCRIPTION"

# Override defaults if needed
./pr-create.sh --target main --no-draft
```

## Workflow Integration

**Recommended sequence:**

1. **Verify work is complete** (tests pass, changes verified)
2. **Generate description**: Invoke pr-description skill
3. **Create PR**: Run pr-create.sh with clipboard content
4. **Review**: Check PR in Bitbucket UI

## What the Script Does

The pr-create.sh script automatically:

| Flag | Value | Why |
|------|-------|-----|
| `--source` | Current branch | Detected via `git branch --show-current` |
| `--target` | `dev` | Standard integration branch (override with `--target`) |
| `--draft` | Enabled | PRs start as drafts (disable with `--no-draft`) |
| `--close-source` | Enabled | Clean up source branch after merge |
| `--with-default-reviewers` | Enabled | Add repo's configured reviewers |
| `--title` | First commit subject | From `git log origin/dev..HEAD` (override with `--title`) |
| `--description` | From pr-description | Generated description (override with `--description`) |

## Command Reference

```bash
# Standard usage (with pr-description generated description)
pr-create.sh --description "$(wl-paste)"

# Override target branch
pr-create.sh --target main --description "$(wl-paste)"

# Custom title and description
pr-create.sh --title "Fix bug" --description "Fixed the thing"

# Skip draft mode
pr-create.sh --no-draft --description "$(wl-paste)"

# Show help
pr-create.sh --help
```

## Example Session

```markdown
User: "Ready to create PR for this feature"

Agent:
1. Verify changes:
   git status
   git log origin/dev..HEAD --oneline

2. Generate description:
   [Invoke pr-description skill - analyzes diff, writes to clipboard]

3. Create PR:
   DESCRIPTION=$(wl-paste)
   ~/.agents/skills/pr-create/pr-create.sh --description "$DESCRIPTION"

4. Output:
   Source branch: SPR-135/fix/SD-875/wrong-cutout-product-name
   Target branch: dev
   Auto-detected title: [SPR-135][SD-875] fix: use the right name
   Description generated
   
   Executing: bkt pr create --source SPR-135/fix/SD-875/wrong-cutout-product-name \
     --target dev --close-source --with-default-reviewers \
     --title "[SPR-135][SD-875] fix: use the right name" \
     --description "..." --draft
   
   Pull request created: https://bitbucket.org/...
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Creating PR without verifying tests | Run verification commands first |
| Forgetting to generate description | Always invoke pr-description skill first |
| Not checking clipboard content | Verify `wl-paste` has the description before passing it |
| Wrong target branch | Use `--target` flag to override default `dev` |
| Using outside git repo | Script requires valid git repository |
| Missing `bkt` command | Install Bitbucket CLI first |

## Requirements

- **bkt CLI**: Bitbucket command-line tool must be installed and configured
- **Git repository**: Must be in a git repo with a current branch
- **pr-description skill**: Required for auto-generating PR descriptions
- **wl-copy/wl-paste**: Wayland clipboard tools (usually pre-installed on Wayland systems)
- **Commits ahead of target**: Branch must have commits not in target branch

## Integration with Other Skills

**Before pr-create:**
- `verification-before-completion`: Ensure all tests pass
- `requesting-code-review`: Prepare for review process

**During pr-create:**
- `pr-description`: Generate PR description from code changes

**After pr-create:**
- Check Bitbucket UI to verify PR was created correctly
- Update PR if needed via Bitbucket web interface or `bkt pr update`

## Customization

To change defaults, edit `/home/well/.agents/skills/pr-create/pr-create.sh`:

```bash
# Change default target branch
TARGET_BRANCH="main"  # Line 33

# Disable draft by default
USE_DRAFT=""  # Line 34
```

Or always pass flags:
```bash
alias pr-create='pr-create.sh --target main --no-draft'
```
