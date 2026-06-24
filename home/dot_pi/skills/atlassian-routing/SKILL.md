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
| **atlcli** (CLI) | `atlcli jira issue get/comment/transition/create`, `atlcli wiki search/docs` | Precise writes, formatted comments (ADF via REST), bulk ops, exports |
| **bkt** (CLI) | `bkt pr list/view/diff/create/approve/comment/merge` | All Bitbucket PR operations |

## Decision Tree

### Reading Ticket Context

```
Need ticket info?
├─ Quick context (summary, description, AC, links)
│  → jira_issue key="PROJ-123"
│    Compact Markdown, fits in context window
│
├─ Implementation context (ticket + linked issues + Confluence pages)
│  → story_context key="PROJ-123"
│    Bounded: maxJiraIssues=10, maxConfluencePages=3
│
├─ Raw issue data (all fields, custom fields, changelog)
│  → jira_get_issue key="PROJ-123"
│    Full API response, use only when specific fields are needed
│
└─ Search across tickets
   → jira_search_issues jql="project = SD AND status = 'In Progress'"
```

### Writing to Jira

```
Need to write?
├─ Add comment (plain text)
│  → jira_add_comment key="PROJ-123" body="text"
│    Auto-converts plain text to ADF
│
├─ Add comment (formatted — headings, code blocks, tables)
│  → atlcli: use Jira REST API v3 with ADF JSON body
│    See AGENTS.md "Jira Comments: Use ADF via REST API" section
│
├─ Transition issue
│  → jira_transition_issue key="PROJ-123" transitionName="In Review"
│    Or: atlcli jira issue transition --key PROJ-123 --to "In Review"
│
├─ Create issue
│  → jira_create_issue project="SD" issueType="Task" summary="..." description="..."
│
└─ Update issue fields
   → jira_update_issue key="PROJ-123" summary="..." description="..."
```

### Confluence

```
Need Confluence?
├─ Read a page
│  → confluence_page url="https://..." OR pageId="12345"
│    Returns compact Markdown with context
│
├─ Search wiki
│  → confluence_search cql="space = II AND text ~ 'architecture'"
│
├─ Push/pull docs (batch)
│  → atlcli wiki docs push/pull (better for bulk operations)
│
└─ Create/update page
   → confluence_create_page / confluence_update_page
```

### Bitbucket PRs

```
Need PR operations?
├─ ALL PR operations → use bkt
│  bkt pr list / view / diff / create / approve / merge / comment
│
└─ Never use @pi-stef for Bitbucket (no Bitbucket tools in that package)
```

### Agile (Boards, Sprints, Epics)

```
Need agile info?
├─ List boards
│  → jira_get_agile_boards
│
├─ Sprint issues
│  → jira_get_sprint_issues boardId=123 sprintId=456
│
├─ Backlog
│  → jira_get_backlog_issues boardId=123
│
├─ Sprint analytics (velocity, burndown)
│  → atlcli jira analyze velocity/burndown --board 123
│
└─ Move issues to sprint
   → jira_move_issues_to_sprint sprintId=456 issues=["PROJ-1","PROJ-2"]
```

## Key Rules

1. **Reads → @pi-stef tools first.** They return compact Markdown designed for agent context windows. Never use `atlcli jira issue get` for reading — its raw JSON overflows context.

2. **Writes → prefer @pi-stef tools** (they handle ADF conversion). Fall back to `atlcli` or REST API only for:
   - Formatted comments with complex ADF (tables, code blocks, nested structures)
   - Bulk operations (`atlcli jira bulk edit/transition`)
   - Exports (`atlcli jira export`)

3. **Bitbucket → always `bkt`.** No exceptions.

4. **Never guess tool names.** The tools available from @pi-stef/atlassian are:
   - `jira_issue` — compact issue context
   - `jira_get_issue` — full issue (use sparingly)
   - `story_context` — bounded implementation context
   - `jira_search_issues` — JQL search
   - `jira_create_issue` / `jira_update_issue` / `jira_delete_issue`
   - `jira_transition_issue` / `jira_get_transitions`
   - `jira_add_comment`
   - `jira_add_worklog` / `jira_get_worklog`
   - `jira_create_issue_link` / `jira_remove_issue_link`
   - `jira_get_agile_boards` / `jira_get_board_issues`
   - `jira_get_sprints_from_board` / `jira_get_sprint_issues`
   - `jira_get_backlog_issues` / `jira_rank_backlog_issues`
   - `jira_move_issues_to_sprint`
   - `jira_get_epic_issues` / `jira_link_to_epic`
   - `jira_create_sprint` / `jira_update_sprint` / `jira_delete_sprint`
   - `jira_list_projects` / `jira_get_project_versions`
   - `jira_search_fields` / `jira_batch_get_changelogs`
   - `jira_download_attachments`
   - `confluence_page` — compact page context
   - `confluence_get_page` — full page
   - `confluence_list_spaces` / `confluence_list_pages`
   - `confluence_search` — CQL search
   - `confluence_create_page` / `confluence_update_page` / `confluence_delete_page`
   - `confluence_get_comments` / `confluence_add_comment`
   - `confluence_get_labels` / `confluence_add_label`
   - `confluence_get_page_children`

5. **Token budget awareness:**
   - `jira_issue` → ~500-2000 tokens (safe, use by default)
   - `story_context` → ~2000-5000 tokens (bounded, safe for planning)
   - `jira_get_issue` → unbounded (use only when you need specific raw fields)
   - `atlcli jira issue get` → unbounded JSON (avoid for reads)

## Slash Commands (from @pi-stef)

| Command | Equivalent |
|---------|-----------|
| `/jira-issue PROJ-123` | `jira_issue key="PROJ-123"` |
| `/story-context PROJ-123` | `story_context key="PROJ-123"` |
| `/get-jira-issue PROJ-123` | `jira_get_issue key="PROJ-123"` |
| `/confluence-page <URL or ID>` | `confluence_page` |
| `/get-confluence-page <ID>` | `confluence_get_page` |

## Common Patterns

### "Read ticket and plan implementation"
```
1. story_context key="PROJ-123"    ← bounded, includes linked context
2. Read the returned Markdown
3. Plan implementation from context
```

### "Comment on ticket with review results"
```
1. jira_add_comment key="PROJ-123" body="Review complete. No blocking issues found."
   ← plain text auto-converts to ADF
```

### "Comment with formatted code/tables"
```
1. Build ADF JSON payload
2. POST via curl to REST API v3 (see AGENTS.md pattern)
   ← only when formatting matters
```

### "Check my sprint work"
```
1. jira_search_issues jql="assignee = currentUser() AND sprint in openSprints()"
```

### "Review PR with ticket context"
```
1. jira_issue key="SD-123"         ← ticket context
2. bkt pr diff 42                  ← PR changes
3. Review + bkt pr comment/approve ← actions
```
