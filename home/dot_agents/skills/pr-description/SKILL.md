---
name: pr-description
description: Use when work on a branch is complete and you need to generate a PR description summarizing the changes for review
---

# Describe PR

## Overview

Generate a structured PR description from code changes and copy it to the clipboard ready for pasting into Bitbucket/GitHub.

## When to Use

- Branch work is complete and verified
- User asks for a PR description, summary of changes, or "what did we do"
- Before creating a pull request

## Process

### 1. Gather the Diff

Determine the change range. Use one of:

```bash
# Branch vs base
git diff origin/dev..HEAD --stat
git diff origin/dev..HEAD

# Specific commit range
git diff <base_sha>..<head_sha>

# Last N commits
git diff HEAD~N..HEAD
```

### 2. Write the Description

Output two sections in markdown:

**## Overview**
- What was broken or needed (the problem)
- Why it happened (root cause, brief)
- What the fix/feature does (the solution, conceptual)

**## What this PR does?**
- Numbered list of the most important changes
- Each item: **bold title** — verbal description of what changed and why
- Use inline code (single backticks) for identifiers: function names, file names, variables, types
- Do NOT paste code blocks — describe changes in words
- Focus on decisions and reasoning, not line-by-line diffs

### 3. Output to Clipboard

Write the description to a temp file, copy to clipboard, then clean up:

```bash
wl-copy < /tmp/pr-description.md && rm /tmp/pr-description.md
```

Always write to a file FIRST (avoids terminal artifacts in clipboard), copy, then remove the temp file.

## Format Rules

- Standard markdown
- Single backticks for inline code: `functionName`, `fileName.ts`
- NO fenced code blocks in the description body
- NO copy-pasted code snippets — describe verbally instead
- Bold for emphasis on item titles
- Keep paragraphs concise, no walls of text

## Template

```markdown
## Overview

[Problem: what was broken/needed]

[Root cause: why it happened — 1-2 sentences]

[Solution: what the fix does conceptually]

## What this PR does?

1. **Title of change** — Description of what changed, why, and how it works. Reference `relevantIdentifiers` inline where it helps understanding.

2. **Title of change** — Description...
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Pasting code blocks | Describe verbally with inline code references |
| Using double backticks | Use single backticks for inline code |
| Explaining every line changed | Focus on decisions and important changes only |
| Missing clipboard copy | Always `wl-copy` at the end |
| Writing to stdout only | Write to file first, then copy — avoids terminal artifacts in clipboard |
