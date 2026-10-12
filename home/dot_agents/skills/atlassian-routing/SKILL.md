---
name: atlassian-routing
description: "Use when working with Jira tickets, Bitbucket PRs, Confluence pages, or any Atlassian tool. Triggers on ticket keys (PROJ-123), PR references, sprint/board mentions, or requests involving Jira/Bitbucket/Confluence. Provides decision tree for choosing the right tool on the first try."
---

# Atlassian Tool Routing

Smart routing layer that eliminates trial-and-error when working with Atlassian tools. Two CLI layers — pick the right one on the first try.

## Tool Layers

| Layer | Tools | Best For |
|-------|-------|----------|
| **atlcli** (CLI) | `atlcli jira ...`, `atlcli wiki ...` | All Jira + Confluence reads and writes |
| **bkt** (CLI) | `bkt pr ...`, `bkt branch ...`, `bkt pipeline ...` | All Bitbucket operations — PRs, branches, pipelines, reviews |

No Atlassian MCP/extension tools are installed — the `@pi-stef/atlassian` pi extension was removed 2026-10-12. Everything goes through the CLIs. Raw `curl` is only permitted for formatted ADF Jira comments (see below); never for anything a CLI covers.

---

## Token Discipline for Reads (IMPORTANT)

The CLIs return raw JSON, not agent-compact output. Always bound what enters context:

```bash
# Select only needed fields with jq — do NOT dump full issue JSON
atlcli jira issue get --key PROJ-123 --json | jq '{key, summary: .fields.summary, status: .fields.status.name, assignee: .fields.assignee.displayName, labels: .fields.labels}'

# Description only when actually needed (can be long)
atlcli jira issue get --key PROJ-123 --json | jq -r '.fields.description'

# Lists: limit + project fields
atlcli jira board issues --id 123 --limit 10 --json | jq '.[] | {key, summary: .fields.summary, status: .fields.status.name}'

# Wiki pages: extract body text, not metadata
atlcli wiki page get --id 12345 --json | jq -r '.body' | head -c 4000
```

Byte-cap long output: `... | head -c 4000`. A full unfiltered issue is 10-50k tokens; a jq-selected read is 100-500.

---

## Decision Tree

### Reading Ticket Context

```
Need ticket info?
├─ Quick context (summary, status, assignee)
│  → atlcli jira issue get --key PROJ-123 --json | jq '{key, summary: .fields.summary, status: .fields.status.name}'
│
├─ Description / acceptance criteria
│  → atlcli jira issue get --key PROJ-123 --json | jq -r '.fields.description'
│
├─ Specific raw fields (custom fields, changelog)
│  → atlcli jira issue get --key PROJ-123 [--expand changelog] --json | jq '<selection>'
│
└─ Search across tickets
   → atlcli jira search --jql "project = SD AND status = 'In Progress'" --json | jq '.issues[] | {key, summary: .fields.summary}'
```

**JQL must be bounded** — the server rejects unbounded queries ("Unbounded JQL queries are not allowed"). Always include at least one restriction: `project = X`, `sprint in openSprints()`, `assignee = currentUser()`, or `status != Closed`.

### Writing to Jira

```
Need to write?
├─ Add comment (plain text)
│  → atlcli jira issue comment --key PROJ-123 "[agent] Review complete."
│
├─ Add comment (formatted — headings, code blocks, tables)
│  → Jira REST API v3 with ADF JSON body via curl
│    See "Formatted Jira Comments" section below
│
├─ Transition issue
│  → atlcli jira issue transition --key PROJ-123 --to "Code Review"
│  → available statuses: atlcli jira issue transitions --key PROJ-123
│
├─ Create issue
│  → atlcli jira issue create --project SD --type Task --summary "..." [--description "..."] [--priority High]
│
├─ Update issue fields
│  → atlcli jira issue update --key PROJ-123 --summary "..." --priority High
│
└─ Bulk operations
   → atlcli jira bulk edit --jql "..." --set priority=High --dry-run
   → atlcli jira bulk transition --jql "..." --to "Done" --dry-run
     Always use --dry-run first, then remove it to apply
```

### Confluence

```
Need Confluence?
├─ Read a page
│  → atlcli wiki page get --id 12345 --json | jq -r '.body' | head -c 4000
│
├─ List pages in a space / by label
│  → atlcli wiki page list --space TEAM [--label architecture] [--limit 20]
│
├─ Search wiki
│  → atlcli wiki search "architecture" [--space DEV]
│
├─ Push/pull docs (batch operations)
│  → atlcli wiki docs pull --space TEAM --ancestor-id 12345 --output-dir ./temp
│  → atlcli wiki docs push --space TEAM --parent-id 12345 --input-dir ./docs
│
└─ Create/update page
   → atlcli wiki page create --space TEAM --title "..." --body page.md
   → atlcli wiki page update --id 12345 --body page.md
```

### Bitbucket PRs

```
Need PR operations? → always use bkt (Cloud)

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
├─ Approve / Merge
│  bkt pr approve 42
│  bkt pr merge 42 --strategy squash
│  bkt pr merge 42 --strategy squash --message "Release v1.2"
│
├─ Checkout PR branch locally
│  bkt pr checkout 42
│
└─ Override repo for all commands
   bkt pr diff 42 --workspace workspace --repo other-repo     # --workspace and --repo are subcommand flags
```

### Bitbucket PR Comments & Reviews

**⚠ REQUIRED: Inline comments MUST only target lines that are part of the PR diff.**
Before commenting on a file+line, verify the line appears in `bkt pr diff <id>`.
Never comment on lines outside the diff — the Bitbucket API will reject it or attach
the comment to the wrong context.

**⚠ REQUIRED: When replying to an existing comment, ALWAYS use `--parent <comment-id>`.**
Never post a new top-level comment as a reply — always thread it under the original.

#### Workflow: Reviewing a PR

```bash
# 1. Get the diff to know which files/lines are commentable
bkt pr diff 42
bkt pr diff 42 --stat                   # quick overview of changed files

# 2. List existing comments (get IDs for replies)
bkt pr comments 42 --workspace workspace --repo other-repo --details --json     # returns comment IDs, file, line, resolution state

# 3. Filter by resolution state
bkt pr comments 42 --workspace workspace --repo other-repo --state unresolved   # only unresolved threads
bkt pr comments 42 --workspace workspace --repo other-repo --state resolved     # resolved threads
```

#### Adding Comments

```bash
# General comment (activity-level, not attached to a file)
bkt pr comment 42 --workspace workspace --repo other-repo --text "LGTM, one minor nit below."

# Inline comment on a specific line in the NEW file (added/modified side)
# The file and line MUST appear in the PR diff
bkt pr comment 42 --workspace workspace --repo other-repo --file "src/main.ts" --to-line 55 --text "Null check needed here"

# Inline comment on a specific line in the OLD file (removed/source side)
bkt pr comment 42 --workspace workspace --repo other-repo --file "src/main.ts" --from-line 30 --text "Why was this removed?"

# Pending/draft comment (not visible until review is submitted)
bkt pr comment 42 --workspace workspace --repo other-repo --file "src/api.ts" --to-line 12 --text "Consider error handling" --pending
```

#### Replying to Comments

```bash
# ALWAYS reply with --parent <comment-id> to thread correctly
# First get the comment ID from the comments list:
bkt pr comments 42 --workspace workspace --repo other-repo --details --json | jq '.[].id'

# Then reply:
bkt pr comment 42 --workspace workspace --repo other-repo --text "Fixed in latest push" --parent 1001
bkt pr comment 42 --workspace workspace --repo other-repo --text "Good catch, updated" --parent 2045

# NOTE: --parent cannot be combined with --file/--to-line/--from-line
# Replies inherit the inline context (file+line) from the parent comment
```

#### Comment Rules Summary

| Flag | Purpose | Constraint |
|---|---|---|
| `--text` | Comment body (required) | Always required |
| `--file` | Target file path in the diff | Must be a file changed in the PR |
| `--to-line` | Line in NEW file (added side) | Must be within diff hunks for that file |
| `--from-line` | Line in OLD file (removed side) | Must be within diff hunks for that file |
| `--parent` | Reply to existing comment by ID | Cannot combine with `--file`/`--to-line`/`--from-line` |
| `--pending` | Draft comment (not yet visible) | Can combine with inline flags |

### Bitbucket Other

```
├─ Branches
│  bkt branch list
│
├─ Pipelines
│  bkt pipeline list                    # recent pipelines
│  bkt pipeline run --branch main       # trigger pipeline
│  bkt pipeline view <id>               # pipeline details
│  bkt pipeline logs <id>               # fetch logs
│
└─ Raw API
   bkt api GET /repositories/{workspace}/{repo}/...
```

### Agile (Boards, Sprints, Epics)

```
Need agile info?
├─ Boards
│  → atlcli jira board list [--project SD] [--type scrum]
│  → atlcli jira board get --id 123
│
├─ Board issues / backlog
│  → atlcli jira board issues --id 123 [--limit 20]
│  → atlcli jira board backlog --id 123
│
├─ Sprints
│  → atlcli jira sprint list --board 123 [--state active]
│  → atlcli jira sprint issues --id 456
│
└─ Epics
   → atlcli jira epic list --project SD
   → atlcli jira epic issues PROJ-100
   → atlcli jira epic add PROJ-5 PROJ-6 --epic PROJ-100
```

---

## Key Rules

1. **Comment identification — ALWAYS prefix `[agent]`.** Every comment you post — Jira (`atlcli jira issue comment`, REST API) or Bitbucket (`bkt pr comment`) — MUST begin with the text `[agent]`. This identifies agent-authored comments to human readers.
   ```
   [agent] Review complete. No blocking issues found.
   [agent] Fixed in latest push — see commit abc123.
   [agent] Null check needed here — `user` can be undefined when session expires.
   ```
   No exceptions. Applies to: general comments, inline PR comments, reply comments (`--parent`), and formatted ADF comments.

2. **Reads → atlcli + jq field selection.** Never let full raw JSON into context. `--json | jq '{...}'` with named fields, `--limit` on lists, `head -c` on bodies. See "Token Discipline for Reads".

3. **Writes → atlcli.** It handles plain-text comments, transitions by status name, field updates, links, attachments. Only formatted ADF comments need the REST path (below).

4. **Bitbucket → always `bkt`.** No exceptions. Cloud only. NEVER use raw curl/API calls to Bitbucket — this leaks auth tokens into session logs.

5. **`--repo`/`--workspace` placement for bkt:** Pass as flags on the subcommand (after `<id>` or verb):
   ```
   bkt pr diff 42 --repo frontend --workspace myteam     ✓ correct
   bkt --repo frontend pr diff 42                        ✗ wrong (not a global flag)
   ```

6. **JQL must be bounded.** Unbounded queries are rejected server-side. Always include a restriction (`project = X`, `sprint in openSprints()`, `assignee = currentUser()`, `status != Closed`).

7. **PR inline comments → diff lines only.** Before posting an inline comment (`--file` + `--to-line`/`--from-line`), ALWAYS run `bkt pr diff <id>` first and verify the target file+line is within a diff hunk. The Bitbucket API rejects comments on lines outside the diff.

8. **PR replies → always use `--parent <comment-id>`.** Never post a top-level comment as a reply. Get the comment ID from `bkt pr comments <id> --details --json`, then reply with `--parent`.

9. **Transitions accept status names directly:** `atlcli jira issue transition --key SD-123 --to "Code Review"`. List available: `atlcli jira issue transitions --key SD-123`.

---

## Formatted Jira Comments

For comments needing headings, code blocks, tables, or rich formatting, use the Jira REST API v3 with ADF JSON. `atlcli jira issue comment` accepts plain text only.

**Auth credentials:** Read from `~/.atlcli/config.json` (nested under `profiles[currentProfile].auth`). Do not print them; reference in the curl invocation only.

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
atlcli jira issue get --key SD-981 [--expand changelog] --json    # raw JSON — pipe through jq
atlcli jira issue create --project SD --type Task --summary "Implement feature X"
atlcli jira issue update --key SD-981 --summary "New title" --priority High
atlcli jira issue transition --key SD-981 --to "Code Review"
atlcli jira issue transitions --key SD-981        # available transitions
atlcli jira issue comment --key SD-981 "[agent] Fixed in PR 920"
atlcli jira issue assign --key SD-981 --assignee <accountId>
atlcli jira issue link --from SD-100 --to SD-200 --type "blocks"
atlcli jira issue link-page --key SD-981 --page 12345   # link Confluence page
atlcli jira issue pages --key SD-981               # list linked pages
atlcli jira issue attach --key SD-981 screenshot.png
atlcli jira issue open SD-981                      # open in browser
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
atlcli wiki page get --id 12345 --json | jq -r '.body'
atlcli wiki page list --space II [--cql <query>] [--limit 20]
atlcli wiki page create --space II --title "Title" --body page.md
atlcli wiki page update --id 12345 --body page.md
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

## Common Patterns

### "Read ticket and plan implementation"
1. `atlcli jira issue get --key PROJ-123 --json | jq '{key, summary: .fields.summary, status: .fields.status.name}'`
2. `... | jq -r '.fields.description'` — read AC/description (head -c if long)
3. Linked context: `atlcli jira issue pages --key PROJ-123`, then `atlcli wiki page get --id <id> --json | jq -r '.body' | head -c 4000`

### "Comment on ticket with review results"
`atlcli jira issue comment --key PROJ-123 "[agent] Review complete. No blocking issues."`

### "Check my sprint work"
`atlcli jira search --jql "assignee = currentUser() AND sprint in openSprints()" --json | jq '.issues[] | {key, summary: .fields.summary, status: .fields.status.name}'`

### "Review PR with ticket context"
1. `atlcli jira issue get --key SD-123 --json | jq '{...}'` — ticket context
2. `bkt pr diff 42 --repo "<repo>"` — PR changes (establishes which files/lines are commentable)
3. `bkt pr comments 42 --repo "<repo>" --details --json` — get existing comment IDs
4. Reply: `bkt pr comment 42 --repo "<repo>" --text "..." --parent <id>` — thread under existing
5. New inline: `bkt pr comment 42 --repo "<repo>" --file "src/x.ts" --to-line 55 --text "[agent] ..."` — only on diff lines
6. `bkt pr approve 42 --repo "<repo>"` — when satisfied

### "Transition after PR merge"
`atlcli jira issue transition --key SD-123 --to "Ready for QA"`

### "Create PR from current branch"
`bkt pr create --repo "<repo>" --target dev --close-source --with-default-reviewers`
