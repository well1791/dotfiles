---
name: bbkt-pr-review
description: "Use when asked to review a PR, ticket, or branch. Executes complete Bitbucket PR review workflow: fetches ticket, analyzes code with reviewer subagent, compares with existing comments, posts inline comments on specific lines, and approves based on findings."
---

# Pull Request Review Workflow

Complete workflow for reviewing Bitbucket PRs with Jira ticket integration.

## When to Use

Trigger this skill when the user says any of:
- "Review PR 915"
- "Review SD-1010" (ticket ID)
- "Review branch origin/SD-1010"
- "Code review for PR 915"
- "Do a code review"
- "Review PR 915 --repo other-repo"

## Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `--repo <REPO_NAME>` | No | Override the default repository for all `bkt` commands |

When the user provides a repo name (e.g., "review PR 915 on repo frontend" or "--repo frontend"), **all `bkt` commands** in this workflow must include `--repo <REPO_NAME>` immediately after `bkt`. For example:

```bash
# Without --repo (default):
bkt pr diff 915

# With --repo:
bkt --repo frontend pr diff 915
```

The `--repo` flag is placed between `bkt` and the subcommand in every invocation.

## Context

- **Your role:** Wellington (reviewer), NOT the PR owner
- **Platform:** Bitbucket PRs with Jira tickets
- **Branch pattern:** Branch names match ticket IDs (e.g., `origin/SD-1010` ↔ ticket `SD-1010`)

## Workflow Steps

### 1. Identify Ticket and PR

**If given PR number:**
```bash
bkt [--repo <REPO_NAME>] pr diff <PR_NUMBER>
```
Extract ticket ID from commit messages or branch name in diff header.

**If given ticket ID:**
```bash
bkt [--repo <REPO_NAME>] pr list
```
Find PR number by matching ticket ID in PR titles.

**If given branch name:**
Extract ticket ID from branch name (usually last segment).

### 2. Fetch Ticket Details

```bash
atlcli jira issue get --key <TICKET-KEY>
```

Parse JSON to understand:
- Issue summary and type
- Root cause (for bugs/errors, stack trace IS the description)
- Steps to reproduce
- Expected vs actual results

### 3. Get PR Diff

```bash
bkt [--repo <REPO_NAME>] pr diff <PR_NUMBER>
```

Review the complete set of changes to understand scope.

**Searching the diff locally:**
You can pipe the diff to search for specific patterns:
```bash
bkt [--repo <REPO_NAME>] pr diff <PR_NUMBER> | rg '<pattern>'
```
This is useful for quickly finding specific changes, variable names, or patterns across the full diff without scrolling through it manually.

### 4. Switch to PR Branch Locally

**Before switching, check for a clean working tree:**
```bash
git status --short
```

If there are untracked, modified, or staged files → **ask the user before proceeding.** Do not switch branches with a dirty working tree.

**Switch using detached HEAD (no local branch needed):**
```bash
git switch --detach origin/<BRANCH-NAME>
```

This enables reading full file context without creating a local branch. We use detached HEAD because we only need to inspect the code, not commit to it.

### 5. Plan and Delegate the Review

**Subagent/Skill Selection:**
Always choose the best subagent for each task. Available subagents:
- **scout** — quick file/pattern discovery
- **researcher** — deep investigation of specific areas
- **planner** — break down complex review into actionable steps
- **worker** — implement or verify changes
- **reviewer** — code review and analysis
- **context-builder** — gather broad context across the codebase
- **oracle** — answer specific technical questions
- **delegate** — general-purpose task execution

**Workflow:**
1. First, plan how to handle the review (identify focus areas, files, concerns)
2. Then delegate the work in parallel using 2+ subagents so independent review tracks run concurrently

For example, you might:
- Send **context-builder** to gather related file context and patterns
- Send **reviewer** to analyze the diff against the ticket requirements
- Send **researcher** to investigate edge cases or related code paths

All parallel tracks should be launched in the same response.

**Primary review subagent — invoke `reviewer` with forked context:**

```
subagent → agent: reviewer, context: fork
```

**Task template:**
```
Review PR #<NUMBER> for ticket <TICKET-KEY>: "<SUMMARY>"

## Context
**Issue:** <Brief description of the bug/feature>
**Root Cause:** <Why the change is needed>
**Affected:** <Components/files/scenarios>

## PR Changes Summary
<High-level description of what changed - 3-5 bullet points>

## Full PR Diff
```diff
<paste full diff here>
```

## Review Focus Areas
1. **Correctness:** Does the fix address the root cause?
2. **Type Safety:** Any type guard issues or `any` escapes?
3. **Edge Cases:** Null/undefined handling, race conditions?
4. **Error Handling:** Graceful degradation?
5. **State Management:** Redux dispatch loops or stale state?
6. **User Experience:** Clear error messages, intuitive flow?
7. **Performance:** Unnecessary re-renders or redundant calls?
8. **Code Quality:** Consistent with project patterns?

## Expected Deliverables
- List of issues with severity (critical, major, minor)
- Verification that fix addresses root cause
- Suggestions for improvements
- Confirmation of completeness
```

### 6. Fetch Existing Comments

```bash
bkt [--repo <REPO_NAME>] pr comments <PR_NUMBER> --details --json
```

Use `--json` to get structured data with comment IDs (needed for threaded replies).

Parse output to identify:
- **Comment IDs** — needed as `--parent` values when replying in threads
- File paths and line numbers for each comment
- Comment types (QUESTION, SUGGESTION, REQUEST)
- Whether comments are resolved
- Who posted them

When a thread already has replies, identify the **root/first comment** in that thread — that is the ID to use as `--parent`.

### 7. Decide What to Comment

**ONLY comment when you have:**
- ✅ Technical disagreement with another reviewer's comment (with evidence)
- ✅ Better alternative approach (with specific code)
- ✅ Critical bug that others missed
- ✅ Need clarification on ambiguous comment
- ✅ Testing scenarios to suggest for manual verification

**DO NOT comment when:**
- ❌ You agree (silence = agreement)
- ❌ Endorsing good suggestions (let PR owner implement)
- ❌ Team preference issues (console.warn, style)
- ❌ Low-level nitpicks (naming, docs) unless critical
- ❌ Suggesting automated tests (unless PR already has test code)
- ❌ Repeating what others said

### 7a. Comment Intention Prefixes (REQUIRED)

**Every comment MUST start with one of these three words in caps:**

#### QUESTION
Something unclear that needs explanation from the PR owner.

**Example:**
```
QUESTION

Why are we using setTimeout here instead of useEffect cleanup?
```

#### SUGGEST
Valuable improvement but not critical (nice-to-have). Won't block PR approval.

**Example:**
```
SUGGEST

FlatMap is better for this kind of work:

```typescript
data.flatMap((id) => id)
```
```

#### REQUEST
Imperative fix for introduced/potential bug (must-fix). Will block PR approval.

**Example:**
```
REQUEST

This will cause a memory leak - please remove the event listener in cleanup:

```typescript
useEffect(() => {
  return () => window.removeEventListener('resize', handler);
}, [handler]);
```
```

### 7b. Comment Tone Guidelines (REQUIRED)

**All comments must follow this tone:**

- ✅ **Technical** - Focus on implementation details, not opinions
- ✅ **Straightforward** - Say what needs to be said, no filler
- ✅ **Fact-oriented** - Reference code, docs, or behavior, not assumptions
- ✅ **Professional** - Respectful but direct
- ✅ **Pedagogic when complex** - Explain "why" for non-obvious issues

**Avoid:**
- ❌ Sugarcoating ("maybe consider", "just a thought")
- ❌ Fluff ("Great work!", "I love this approach")
- ❌ Vague language ("seems like", "might be", "could possibly")
- ❌ Apologies ("Sorry, but...")

**Examples:**

**❌ Bad (sugarcoated, vague):**
```
SUGGEST

Maybe we could possibly consider using flatMap here? It might be a bit cleaner.
```

**✅ Good (direct, technical):**
```
SUGGEST

Use flatMap instead of map + flat:

```typescript
data.flatMap((id) => id)
```

FlatMap is 2x faster and more readable for this pattern.
```

**❌ Bad (vague, apologetic):**
```
REQUEST

Sorry, but I think this might cause issues. Could you maybe look at the cleanup?
```

**✅ Good (direct, fact-based):**
```
REQUEST

This creates a memory leak. The event listener is never removed.

Fix:
```typescript
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, [handler]);
```
```

**❌ Bad (unclear, no reasoning):**
```
QUESTION

Is this the best way to do this?
```

**✅ Good (specific, pedagogic):**
```
QUESTION

Why use `materials.length === 0` instead of `!materials?.length`?

The current check fails when `materials` is undefined, causing the early return
to be skipped. This defeats the infinite loop guard.
```

### 7c. Testing Scenario Comments

When code changes introduce potential bugs that could be caught by manual testing, suggest testing scenarios.

**For code-specific concerns (inline comment):**
- Comment on the suspicious code block
- Start with SUGGEST or REQUEST depending on severity
- Provide step-by-step testing instructions

**Example (inline):**
```
REQUEST

Testing scenario to verify this doesn't break the save flow:
1. Enter valid ZIP (30030) → select Material/Color
2. Navigate to Design step, add a shape
3. Click Save button
Expected: Modal shows, estimate saves successfully
Actual risk: Invalid zip check might block valid saves
```

**For multi-area concerns (general PR comment — only when no single file is the anchor):**
- Use `bkt pr comment <PR_NUMBER> --text "..."` ONLY if the scenario truly spans unrelated files
- If one file is the primary concern, use inline comment on that file instead
- Start with SUGGEST or REQUEST
- Explain which flows/areas to test

**Example (general):**
```bash
bkt pr comment 916 --text "REQUEST

Testing scenario to verify no regression:
1. Enter valid ZIP (30030) → select Material/Color
2. Navigate back to Store step
3. Enter non-serviced ZIP (96701)
4. Click Material step
Expected: Modal shows 'no products available', app does not crash
Actual risk: Infinite loop if materials array is empty without early return"
```

### 8. Post Comments (if warranted)

**ALWAYS prefer inline comments on specific file+line.** General comments are a last resort.

**Rule:** If a comment relates to ANY specific code — even if it spans multiple lines — post it as an inline comment on the most relevant line. Use general comments ONLY for:
- Whole-PR concerns (architecture direction, missing test coverage across the PR)
- Testing scenarios that span multiple unrelated files
- Meta-feedback about the PR itself (scope, description)

**To reply to an existing comment (threaded):**
```bash
bkt [--repo <REPO_NAME>] pr comment <PR_NUMBER> --text "<reply>" --parent <parent-comment-id>
```
- Always use `--parent` with the **root/first comment ID** in the thread — never use a reply's ID as parent
- This creates a proper threaded reply visible in Bitbucket's UI
- To find comment IDs: `bkt [--repo <REPO_NAME>] pr comments <PR_NUMBER> --details --json`
- Do NOT tag users (no "@name")

**To add a new inline comment (PREFERRED — use this by default):**
```bash
bkt [--repo <REPO_NAME>] pr comment <PR_NUMBER> --file "<filepath>" --to-line <line_number> --text "<comment>"
```

**To add a general comment (ONLY when the concern is truly PR-wide):**
```bash
bkt [--repo <REPO_NAME>] pr comment <PR_NUMBER> --text "<comment>"
```

### 9. Approve or Stay Silent

**NEVER decline a PR.** Use comments (REQUEST) to communicate blocking issues instead.

**Approve when:**
- ✅ No critical bugs that fundamentally break functionality
- ✅ Fix correctly addresses root cause
- ✅ Even if you posted REQUEST comments — approve and let the owner address them

```bash
bkt [--repo <REPO_NAME>] pr approve <PR_NUMBER>
```

**Stay silent (no approve) when:**
- Other reviewers have unresolved blocking comments
- Waiting for PR owner to respond
- Not confident in the domain area

## Decision Tree

```
Review complete. What did subagent find?
├─ Critical/blocking issues?
│  ├─ YES → Post REQUEST comments on specific lines
│  │  └─ Then → bkt pr approve <NUMBER> (never decline)
│  └─ NO → Only minor/optional issues?
│     ├─ YES → bkt pr approve <NUMBER>
│     └─ NO → Stay silent or approve based on confidence
```

## Comment Quality Standards

Only add substantive technical value:
- Type safety implications with examples
- Race conditions or edge cases with scenarios
- Security/injection risks
- Better architectural patterns with code
- Clarification of complex tradeoffs

Avoid:
- Agreeing or endorsing (just stay silent)
- Preferences without strong justification
- Documentation/naming unless it causes bugs
- Test requests unless PR has tests
- Questions meant for PR author

## Example Execution

**User says:** "Review PR 916"

**You execute:**
1. `bkt pr diff 916` → identify ticket SD-1020
2. `atlcli jira issue get --key SD-1020` → crash on Material step
3. `git status --short` → clean ✓
4. `git switch --detach origin/fix/sd-1020-app-crashing-with-invalid-zip-code`
5. Plan review: identify focus areas (infinite loop guard, ZIP validation, material handling)
6. Delegate in parallel:
   - **context-builder**: gather related component/hook context
   - **reviewer**: analyze diff against ticket root cause
7. Synthesize findings from subagents
8. `bkt pr comments 916 --details --json` → no comments yet
9. Compare findings: only minor issues (non-blocking)
10. Decision: No comments to post (silence = agreement)
11. `bkt pr approve 916` → no blockers, fix is correct

**User says:** "Review PR 42 --repo mobile-app"

**You execute:**
1. `bkt --repo mobile-app pr diff 42` → identify ticket SD-2050
2. `atlcli jira issue get --key SD-2050` → login flow crash
3. `git status --short` → clean ✓
4. `git switch --detach origin/fix/sd-2050-login-crash`
5. Plan and delegate review (same as above)
6. `bkt --repo mobile-app pr comments 42 --details --json`
7. `bkt --repo mobile-app pr approve 42`

## Key Commands Reference

| Command | Purpose |
|---------|---------|
| `atlcli jira issue get --key <KEY>` | Fetch Jira ticket details |
| `bkt [--repo <REPO>] pr list` | List all open PRs |
| `bkt [--repo <REPO>] pr diff <NUMBER>` | Show PR changes (full diff) |
| `bkt [--repo <REPO>] pr comments <NUMBER> --details` | Show all existing comments |
| `bkt [--repo <REPO>] pr comment <NUMBER> --file "<path>" --to-line <N> --text "<msg>"` | Add inline comment |
| `bkt [--repo <REPO>] pr comment <NUMBER> --text "<msg>" --parent <ID>` | Reply to comment in thread (use root comment ID) |
| `bkt [--repo <REPO>] pr comment <NUMBER> --text "<msg>"` | Add general comment |
| `bkt [--repo <REPO>] pr approve <NUMBER>` | Approve PR (always approve, never decline) |
| `git switch --detach origin/<BRANCH>` | Switch to PR branch (detached HEAD, no local branch) |

## Team Culture Notes

- **Silence = agreement** — Don't comment just to agree
- **Reply in threads** — Use `--parent <root-comment-id>`, always the first/root comment ID in the thread
- **No tagging** — Don't use "@name" in replies
- **Evidence over opinion** — Back disagreements with code/docs
- **Respect PR owner** — You can't accept/implement, only review

## Output Format

After completing the review, present:
1. **Summary:** PR number, ticket, owner, issue type
2. **Review findings:** Critical/major/minor issues (or "no issues")
3. **Comments posted:** List of files/lines where you commented (or "none")
4. **Decision:** Approved/No action taken (never decline)
5. **Reasoning:** Brief explanation of the decision

Example:
```
## Review Complete for PR #916 ✅

**PR #916** (SD-1020) - Fix for application crash when switching to non-serviced ZIP code
**Owner:** Alyson Maia

### Findings
- ✅ Fix correctly addresses root cause (infinite loop)
- ✅ Defense-in-depth approach with multiple validation layers
- ⚠️ Minor: Hardcoded fallback string should use i18n
- ⚠️ Minor: Unused type fields in AlertWithMetadata

### Action Taken
✅ **Approved** - No blocking issues, minor concerns don't affect functionality

### Reasoning
The fix successfully prevents the "Maximum update depth exceeded" crash with a simple early-return guard. Minor code quality issues identified but not blocking.
```
