# PR-Create Quick Reference for Agents

## Trigger Phrases
- "create a PR"
- "make a pull request"
- "submit this for review"
- "create PR for this branch"

## Workflow

```
User: "Create a PR for this branch"

Agent:
  1. Invoke pr-description skill
     → Generates description
     → Copies to clipboard
  
  2. Run pr-create script
     ~/.agents/skills/pr-create/pr-create.sh
     
  3. Script automatically:
     - Reads description from clipboard
     - Detects current branch
     - Extracts title from commits
     - Calls bkt pr create with all flags
     
  4. Confirm PR created
     "✓ PR created: [URL from bkt output]"
```

## Agent Code Pattern

```bash
# 1. First invoke pr-description skill (via Skill tool)
#    This generates the description and copies to clipboard

# 2. Then run pr-create
~/.agents/skills/pr-create/pr-create.sh

# Alternative: With overrides
~/.agents/skills/pr-create/pr-create.sh --target main --no-draft
```

## Common User Requests

| User Says | Agent Does |
|-----------|------------|
| "Create a PR" | Invoke pr-description → Run pr-create.sh |
| "Create PR to main" | Invoke pr-description → Run pr-create.sh --target main |
| "Make a non-draft PR" | Invoke pr-description → Run pr-create.sh --no-draft |
| "Custom title: XYZ" | Invoke pr-description → Run pr-create.sh --title "XYZ" |

## Error Handling

| Error | Solution |
|-------|----------|
| "Not in a git repository" | Verify cwd is in a git repo |
| "No commits ahead of origin/dev" | Check branch has commits |
| "bkt command not found" | User needs to install bkt CLI |
| "Clipboard is empty" | Re-invoke pr-description skill first |

## Integration Notes

- **Always invoke pr-description first** - pr-create expects description in clipboard
- **Works cross-platform** - Supports wl-paste (Wayland), xclip (X11), pbpaste (macOS)
- **Validates everything** - Script checks git repo, bkt command, branch, commits
- **User-friendly errors** - Guides users to fix problems

## Example Output

```
Source branch: feature/add-auth
Target branch: dev
Auto-detected title: [AUTH-123] Add OAuth2 support
Description loaded from clipboard (42 lines)

Executing: bkt pr create --source feature/add-auth --target dev \
  --close-source --with-default-reviewers \
  --title "[AUTH-123] Add OAuth2 support" \
  --description "..." --draft

Pull request created: https://bitbucket.org/workspace/repo/pull-requests/123
```
