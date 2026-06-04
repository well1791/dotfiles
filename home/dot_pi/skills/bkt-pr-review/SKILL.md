---
name: bkt-pr-review
description: "Use when asked to review a PR, ticket, or branch. Executes complete Bitbucket PR review workflow: fetches ticket, analyzes code with reviewer subagent, compares with existing comments, posts technical disagreements only, and approves/declines based on findings."
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

## Context

- **Your role:** Wellington (reviewer), NOT the PR owner
- **Platform:** Bitbucket PRs with Jira tickets
- **Branch pattern:** Branch names match ticket IDs (e.g., `origin/SD-1010` ↔ ticket `SD-1010`)

## Workflow Steps

### 1. Identify Ticket and PR

**If given PR number:**
```bash
bkt pr diff <PR_NUMBER>
```
Extract ticket ID from commit messages or branch name in diff header.

**If given ticket ID:**
```bash
bkt pr list
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
bkt pr diff <PR_NUMBER>
```

Review the complete set of changes to understand scope.

### 4. Checkout Branch Locally

```bash
git checkout <BRANCH-NAME>
```

This enables reading full file context, not just diffs.

### 5. Review with Subagent

Invoke the `reviewer` subagent with forked context:

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
bkt pr comments <PR_NUMBER> --details
```

Parse output to identify:
- File paths and line numbers for each comment
- Comment types (QUESTION, SUGGESTION, REQUEST)
- Whether comments are resolved
- Who posted them

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

### 7b. Testing Scenario Comments

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

**For multi-area concerns (general PR comment):**
- Use `bkt pr comment <PR_NUMBER> --text "..."`
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

**To reply to an existing comment:**
```bash
bkt pr comment <PR_NUMBER> --file "<same_filepath>" --to-line <same_line_number> --text "<reply>"
```
- Use the SAME file and line as the original comment
- Do NOT use `--parent` flag
- Do NOT tag users (no "@name")

**To add a new inline comment:**
```bash
bkt pr comment <PR_NUMBER> --file "<filepath>" --to-line <line_number> --text "<comment>"
```

**To add a general comment:**
```bash
bkt pr comment <PR_NUMBER> --text "<comment>"
```

### 9. Approve or Decline

**Approve when:**
- ✅ No blockers or critical bugs
- ✅ Only minor/optional suggestions (don't affect functionality)
- ✅ Fix correctly addresses root cause
- ✅ No blocking comments posted by you or others

```bash
bkt pr approve <PR_NUMBER>
```

**Decline when:**
- ❌ You posted blocking comments requiring code changes
- ❌ Critical bugs or security issues found
- ❌ Major architectural concerns

```bash
bkt pr decline <PR_NUMBER>
```

**Stay silent (no approve/decline) when:**
- Other reviewers have unresolved blocking comments
- Waiting for PR owner to respond
- Significant changes requested by someone else
- Not confident in the domain area

## Decision Tree

```
Review complete. What did subagent find?
├─ Critical/blocking issues?
│  ├─ YES → Did I post comments about them?
│  │  ├─ YES → bkt pr decline <NUMBER>
│  │  └─ NO → Stay silent
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
3. `git checkout fix/sd-1020-app-crashing-with-invalid-zip-code`
4. Read key files: `useSelectedMaterial.ts`, `StoresList.component.tsx`
5. Invoke `reviewer` subagent with full context
6. `bkt pr comments 916 --details` → no comments yet
7. Compare findings: only minor issues (non-blocking)
8. Decision: No comments to post (silence = agreement)
9. `bkt pr approve 916` → no blockers, fix is correct

## Key Commands Reference

| Command | Purpose |
|---------|---------|
| `atlcli jira issue get --key <KEY>` | Fetch Jira ticket details |
| `bkt pr list` | List all open PRs |
| `bkt pr diff <NUMBER>` | Show PR changes (full diff) |
| `bkt pr comments <NUMBER> --details` | Show all existing comments |
| `bkt pr comment <NUMBER> --file "<path>" --to-line <N> --text "<msg>"` | Add inline comment (or reply) |
| `bkt pr comment <NUMBER> --text "<msg>"` | Add general comment |
| `bkt pr approve <NUMBER>` | Approve PR (no major issues) |
| `bkt pr decline <NUMBER>` | Decline PR (blocking issues) |
| `git checkout <BRANCH>` | Switch to PR branch locally |

## Team Culture Notes

- **Silence = agreement** — Don't comment just to agree
- **Reply in same location** — Use same file/line, not `--parent`
- **No tagging** — Don't use "@name" in replies
- **Evidence over opinion** — Back disagreements with code/docs
- **Respect PR owner** — You can't accept/implement, only review

## Output Format

After completing the review, present:
1. **Summary:** PR number, ticket, owner, issue type
2. **Review findings:** Critical/major/minor issues (or "no issues")
3. **Comments posted:** List of files/lines where you commented (or "none")
4. **Decision:** Approved/Declined/No action taken
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
