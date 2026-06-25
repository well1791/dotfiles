---
name: atlassian-routing
description: "Use when working with Jira tickets, Bitbucket PRs, Confluence pages, or any Atlassian tool. Triggers on ticket keys (PROJ-123), PR references, sprint/board mentions, or requests involving Jira/Bitbucket/Confluence. Provides decision tree for choosing the right tool on the first try."
---

# Atlassian Tool Routing

Smart routing layer that eliminates trial-and-error when working with Atlassian tools. Three tool layers available — pick the right one on the first try.

## Tool Layers

| Layer | Tools | Best For |
|-------|-------|----------|
| **@pi-stef/atlassian** (extension) | `jira_issue`, `story_context`, `jira_search_issues`, `confluence_page`, etc. | Agent-native reads — compact Markdown output, bounded traversal, token-efficient |
| **atlcli** (CLI) | `atlcli jira ...`, `atlcli wiki ...` | Precise writes, formatted comments (ADF via REST), bulk ops, exports, analytics |
| **bkt** (CLI) | `bkt pr ...`, `bkt branch ...`, `bkt pipeline ...` | All Bitbucket operations — PRs, branches, pipelines, issues |

---

## Decision Tree

### Reading Ticket Context

```
Need ticket info?
├─ Quick context (summary, description, AC, links)
│  → jira_issue key="PROJ-123"
│    Compact Markdown, fits in context window
│
├─ Implementation context (ticket + linked issues + Confluence + Figma)
│  → story_context key="PROJ-123"
│    Bounded: maxJiraIssues=10, maxConfluencePages=3
│
├─ Raw issue data (all fields, custom fields, changelog)
│  → jira_get_issue issueIdOrKey="PROJ-123"
│    Full API response — use only when specific fields are needed
│
└─ Search across tickets
   → jira_search_issues jql="project = SD AND status = 'In Progress'"
```

### Writing to Jira

```
Need to write?
├─ Add comment (plain text)
│  → jira_add_comment issueIdOrKey="PROJ-123" body="Review complete."
│    Auto-converts plain text to ADF
│
├─ Add comment (formatted — headings, code blocks, tables)
│  → Use Jira REST API v3 with ADF JSON body via curl
│    See "Formatted Jira Comments" section below
│
├─ Transition issue
│  → jira_transition_issue issueIdOrKey="PROJ-123" transitionId="31"
│    First get available transitions:
│    → jira_get_transitions issueIdOrKey="PROJ-123"
│
│  Or via CLI (simpler — accepts status name directly):
│    atlcli jira issue transition --key PROJ-123 --to "Code Review"
│
├─ Create issue
│  → jira_create_issue projectKey="SD" issueTypeName="Task" summary="..." description="..."
│
├─ Update issue fields
│  → jira_update_issue issueIdOrKey="PROJ-123" summary="..." description="..."
│
└─ Bulk operations
   → atlcli jira bulk edit --jql "..." --set priority=High --dry-run
   → atlcli jira bulk transition --jql "..." --to "Done" --dry-run
     Always use --dry-run first, then remove it to apply
```

### Confluence

```
Need Confluence?
├─ Read a page (compact)
│  → confluence_page url="https://..." OR pageId="12345"
│
├─ Read a page (full, with version info)
│  → confluence_get_page pageId="12345" includeVersion=true
│
├─ Search wiki
│  → confluence_search cql="space = II AND text ~ 'architecture'"
│
├─ Push/pull docs (batch operations)
│  → atlcli wiki docs pull --space TEAM --ancestor-id 12345 --output-dir ./temp
│  → atlcli wiki docs push --space TEAM --parent-id 12345 --input-dir ./docs
│
├─ Create page
│  → confluence_create_page spaceId="..." title="..." body="<p>content</p>"
│
└─ Export to DOCX
   → atlcli wiki export 12345 --template corporate --output ./report.docx
```

### Bitbucket PRs

```
Need PR operations? → always use bkt

├─ List PRs
│  bkt pr list                          # open PRs in current repo
│  bkt pr list --mine                   # my PRs across all repos
│  bkt pr list --state MERGED           # merged PRs
│
├─ View PR details
│  bkt pr view 42                       # title, description, reviewers
│  bkt pr view 42 --web                 # open in browser
│
├─ Show PR diff
│  bkt pr diff 42                       # full unified diff
│  bkt pr diff 42 --stat                # file change stats only
│
├─ Create PR
│  bkt pr create --target dev --close-source --with-default-reviewers
│  bkt pr create --title "Fix login" --target main --draft
│
├─ Comment on PR
│  # General comment
│  bkt pr comment 42 --text "LGTM"
│
│  # Inline comment on specific file + line (PREFERRED)
│  bkt pr comment 42 --file "src/main.ts" --to-line 55 --text "Check null here"
│
│  # Reply to existing comment thread
│  bkt pr comment 42 --text "Fixed" --parent 1001
│
├─ List existing comments
│  bkt pr comments 42 --details         # with file/line info
│  bkt pr comments 42 --details --json  # structured (get comment IDs)
│
├─ Approve / Merge / Decline
│  bkt pr approve 42
│  bkt pr merge 42
│  bkt pr merge 42 --strategy squash --message "Release v1.2"
│  bkt pr decline 42
│
├─ Checkout PR branch locally
│  bkt pr checkout 42
│
└─ Override repo for all commands
   bkt --repo other-repo pr diff 42     # --repo goes between bkt and subcommand
```

### Bitbucket Other

```
├─ Branches
│  bkt branch list
│
├─ Pipelines
│  bkt pipeline list                    # recent pipelines
│  bkt pipeline trigger --branch main   # trigger pipeline
│
└─ Raw API
   bkt api GET /repositories/{workspace}/{repo}/...
```

### Agile (Boards, Sprints, Epics)

```
Need agile info?
├─ List boards
│  → jira_get_agile_boards
│  → atlcli jira board list --project SD
│
├─ Board issues / backlog
│  → jira_get_board_issues boardId=123
│  → jira_get_backlog_issues boardId=123
│
├─ Sprints
│  → jira_get_sprints_from_board boardId=123
│  → jira_get_sprint_issues sprintId=456
│  → jira_move_issues_to_sprint sprintId=456 issues=["PROJ-1","PROJ-2"]
│
├─ Epics
│  → jira_get_epic_issues epicIdOrKey="PROJ-100"
│  → jira_link_to_epic epicIdOrKey="PROJ-100" issueKeys=["PROJ-5","PROJ-6"]
│
├─ Sprint analytics (CLI only)
│  → atlcli jira analyze velocity --board 123 --sprints 5
│  → atlcli jira analyze burndown --sprint 456
│  → atlcli jira analyze scope-change --sprint 456
│  → atlcli jira analyze predictability --board 123
│
└─ Sprint management
   → atlcli jira sprint list --board 123
   → atlcli jira sprint create --board 123 --name "Sprint 47"
   → atlcli jira sprint start --id 789
   → atlcli jira sprint close --id 789
   → atlcli jira sprint add PROJ-1 PROJ-2 --sprint 789
```

---

## Key Rules

1. **Reads → @pi-stef tools first.** They return compact Markdown designed for agent context windows. Avoid `atlcli jira issue get` for reading — its raw JSON overflows context.

2. **Writes → prefer @pi-stef tools** (they handle ADF conversion). Fall back to `atlcli` or REST API for:
   - Formatted comments with complex ADF (tables, code blocks, nested structures)
   - Bulk operations (`atlcli jira bulk ...`)
   - Exports (`atlcli jira export ...`)
   - Sprint analytics (`atlcli jira analyze ...`)

3. **Bitbucket → always `bkt`.** No exceptions. No @pi-stef Bitbucket tools exist.

4. **`--repo` placement for bkt:** Always between `bkt` and the subcommand:
   ```
   bkt --repo frontend pr diff 42     ✓ correct
   bkt pr diff 42 --repo frontend     ✗ wrong
   ```

5. **Token budget awareness:**
   - `jira_issue` → ~500-2000 tokens (safe, use by default)
   - `story_context` → ~2000-5000 tokens (bounded, safe for planning)
   - `jira_get_issue` → unbounded (use only when specific raw fields are needed)
   - `atlcli jira issue get` → unbounded raw JSON (avoid for reads)

6. **Transitions via CLI vs extension:**
   - CLI is simpler: `atlcli jira issue transition --key SD-123 --to "Code Review"` (accepts status name)
   - Extension requires transition ID: first call `jira_get_transitions`, then `jira_transition_issue` with the ID

---

## Formatted Jira Comments

For comments needing headings, code blocks, tables, or rich formatting, use the Jira REST API v3 with ADF JSON. `atlcli jira issue comment` and `jira_add_comment` both accept plain text only.

**Auth credentials:** Read from `~/.atlcli/config.json` (nested under `profiles[currentProfile].auth`).

**ADF structure:**
```json
{
  "body": {
    "type": "doc",
    "version": 1,
    "content": [
      { "type": "heading", "attrs": { "level": 3 }, "content": [{ "type": "text", "text": "Title" }] },
      { "type": "paragraph", "content": [
        { "type": "text", "text": "Bold text", "marks": [{ "type": "strong" }] },
        { "type": "text", "text": "code", "marks": [{ "type": "code" }] }
      ]},
      { "type": "codeBlock", "attrs": { "language": "typescript" }, "content": [{ "type": "text", "text": "const x = 1;" }] },
      { "type": "bulletList", "content": [
        { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Item" }] }] }
      ]}
    ]
  }
}
```

**POST via curl:**
```bash
curl -s -X POST \
  "https://<site>.atlassian.net/rest/api/3/issue/<KEY>/comment" \
  -H "Content-Type: application/json" \
  -u "<email>:<token>" \
  -d @/tmp/comment.json
```

**Available marks:** `code`, `strong`, `em`, `underline`, `strike`, `link` (with `attrs.href`).

---

## atlcli Quick Reference

### Issues
```bash
atlcli jira my                                    # my open issues
atlcli jira issue get --key SD-981                # full issue (raw JSON — prefer jira_issue instead)
atlcli jira issue create --project SD --type Task --summary "Implement feature X"
atlcli jira issue update --key SD-981 --summary "New title" --priority High
atlcli jira issue transition --key SD-981 --to "Code Review"
atlcli jira issue comment --key SD-981 "Fixed in PR 920"
atlcli jira issue assign --key SD-981 --assignee <accountId>
atlcli jira issue link --from SD-100 --to SD-200 --type "blocks"
atlcli jira issue attach --key SD-981 screenshot.png
atlcli jira issue open SD-981                     # open in browser
```

### Search
```bash
atlcli jira search --jql "project = SD AND status = 'Development In Progress'"
atlcli jira search --jql "assignee = currentUser() AND sprint in openSprints()"
```

### Subtasks
```bash
atlcli jira subtask create SD-981 --summary "Implement feature" --priority High
atlcli jira subtask list SD-981
```

### Confluence
```bash
atlcli wiki search "EE3 architecture" --space DEV
atlcli wiki docs pull --space II --ancestor-id 3535503361 --output-dir ./temp
atlcli wiki docs push --space II --parent-id 3548446721 --input-dir ./features
atlcli wiki export 12345 --template corporate --output ./report.docx
```

### Exports
```bash
atlcli jira export --jql "project = SD" -o issues.json
atlcli jira export --jql "sprint in openSprints()" -o sprint.csv --format csv
```

---

## @pi-stef/atlassian Tool Inventory

### Jira Platform
`jira_issue` · `jira_get_issue` · `story_context` · `jira_search_issues` · `jira_list_projects` · `jira_create_issue` · `jira_update_issue` · `jira_delete_issue` · `jira_get_transitions` · `jira_transition_issue` · `jira_add_comment` · `jira_add_worklog` · `jira_get_worklog` · `jira_create_issue_link` · `jira_remove_issue_link` · `jira_get_issue_link_types` · `jira_get_project_versions` · `jira_create_version` · `jira_get_project_issues` · `jira_search_fields` · `jira_batch_get_changelogs` · `jira_get_user_profile` · `jira_download_attachments` · `jira_batch_create_issues` · `jira_batch_create_versions`

### Jira Software (Agile)
`jira_get_agile_boards` · `jira_create_board` · `jira_delete_board` · `jira_get_board_issues` · `jira_get_sprints_from_board` · `jira_get_sprint_issues` · `jira_create_sprint` · `jira_update_sprint` · `jira_delete_sprint` · `jira_move_issues_to_sprint` · `jira_get_backlog_issues` · `jira_rank_backlog_issues` · `jira_get_epic_issues` · `jira_link_to_epic`

### Confluence
`confluence_page` · `confluence_get_page` · `confluence_list_spaces` · `confluence_list_pages` · `confluence_search` · `confluence_create_page` · `confluence_update_page` · `confluence_delete_page` · `confluence_get_page_children` · `confluence_get_comments` · `confluence_add_comment` · `confluence_get_labels` · `confluence_add_label` · `confluence_search_user`

### Slash Commands
`/jira-issue PROJ-123` · `/story-context PROJ-123` · `/get-jira-issue PROJ-123` · `/confluence-page <URL or ID>` · `/get-confluence-page <ID>`

---

## Common Patterns

### "Read ticket and plan implementation"
1. `story_context key="PROJ-123"` — bounded, includes linked context
2. Read the returned Markdown, plan from there

### "Comment on ticket with review results"
`jira_add_comment issueIdOrKey="PROJ-123" body="Review complete. No blocking issues."`

### "Check my sprint work"
`jira_search_issues jql="assignee = currentUser() AND sprint in openSprints()"`

### "Review PR with ticket context"
1. `jira_issue key="SD-123"` — ticket context
2. `bkt pr diff 42` — PR changes
3. `bkt pr comment 42 ...` / `bkt pr approve 42` — actions

### "Transition after PR merge"
`atlcli jira issue transition --key SD-123 --to "Done"`

### "Create PR from current branch"
`bkt pr create --target dev --close-source --with-default-reviewers`
