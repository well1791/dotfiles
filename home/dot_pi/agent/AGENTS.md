# Global Instructions

Operational rules for this environment: research order, tool routing, delegation, workflows, validation, and persistence. Behavioral, epistemic, and safety rules live in APPEND_SYSTEM.md (system prompt, inherited by subagents). More local AGENTS.md files override these when they conflict.

## Research & Citations

Before answering questions, follow this order:

1. **Local documentation first** — `tldr` (tealdeer), `man`, or `--help` for command-line tools; project `.md` files; config files and inline docs.
2. **Memory** — personal scope first, then project scope (`memory_search`).
3. **Ask the user** — if local resources and memory are insufficient and the user may have the context.
4. **Search online last** — when 1-3 are insufficient; prefer current, authoritative sources.

Every factual claim carries a source: local file path, memory reference, or URL. If nothing reliable is found, say so. Never rely solely on training data.

## Uncertainty

- Ask before acting when intent is materially ambiguous.
- Ask before choices that change behavior, API/UX, naming, persistence, auth, dependencies, config, or compatibility.
- Prefer one targeted question; when bundling, each question must be independently answerable.
- Proceed without asking only when ambiguity is low-risk and repo conventions make the choice clear — state the assumption briefly.

Example: "Make it faster" → "Startup time, response latency, or memory usage?"

## Evidence

Gather evidence proportional to risk:

- Trivial low-risk edit: inspect the target file and adjacent context.
- Behavioral, API, dependency, or infrastructure change: trace execution path, call sites, constraints, and regression surface before editing.
- Command usage: `tldr` / `man` / `--help` before searching online.
- Project conventions: local `.md` files and project memory before asking or searching.
- Unreadable dependency or generated code: check matching upstream docs or source before guessing.
- Debugging from logs or stack traces: examine only files relevant to the fault; prioritize structural causal analysis across the dependency chain; produce unified output (`diff -u`) with precise, relevant information.

**Context discipline.** Answer the narrow question first; inspect the smallest relevant file, symbol, route, diff, or log. Byte-cap unknown or potentially large command output — line caps are unsafe because one huge line defeats them:

```fish
COMMAND 2>&1 | head -c 4000   # from the top
COMMAND 2>&1 | tail -c 4000   # from the end (logs, test failures)
```

If capped output is insufficient, narrow the command before raising the cap. Avoid dumping full files, full logs, broad repo searches, and generated output after the relevant code is found. lean-ctx tools auto-compress their output; byte-capping still applies to raw shell calls. Never cap instruction, skill, or policy files — read those whole.

Prefer external verification over self-review: a fresh test beats re-reading your own code. State uncertainty when something cannot be confirmed.

## Workflow

1. Explore in the main agent first — read files, check local docs, trace execution paths, query memory, follow the research order. Do not delegate before seeing the data.
2. Scan available skills for direct and adjacent matches before choosing the execution path; when in doubt, load the skill and check.
3. Choose one path after scoping: single-track or dependent steps → main agent; small reads or searches → parallel tool calls; 2+ independent tracks → subagent batch (below).
4. Synthesize findings; re-read target files if stale (>10 turns or post-compaction).
5. Implement the smallest correct change.
6. Discover validation commands from local tooling (`--help`, man pages, project docs); validate per the Testing section.

For review, debugging, or analysis requests: do not force code changes once findings are evidenced.

## Delegation & Subagents

Use 2+ subagents or none. NEVER exactly 1 — a subagent call blocks the main agent, so main agent + 1 subagent is sequential work, not parallelism.

The main agent is a builder, not a dispatcher: work first, delegate second — only after scoping splits the work into independent tracks.

- Launch all subagents in the same response, as a batch.
- Each track must complete without the others' results; dependent steps stay in the main agent.
- One prompt per track with a concrete return format — not "report findings" or "explore the codebase," but a specific answer, list, or table.
- Never hand data already in main-agent context to a subagent for formatting, transformation, or generation.
- After the batch returns: synthesize, gap-fill in the main agent, implement.
- Subagents inherit APPEND_SYSTEM.md behavior rules; task prompts carry role-specific rules only.

For implementation plans with multiple independent tasks: dispatch subagents per task with review between tasks.

## Testing & Validation

- Preserve existing tests. Update tests when behavior changes; never silently change tested behavior.
- Scope validation to risk: docs → readback; types/API → targeted typecheck or test; runtime/UI → targeted test, lint, or build.
- If relevant checks already fail, state that; do not attribute pre-existing failures to new work.
- Verification fails after a change → one targeted fix when the cause is clear; otherwise stop and report the failure.
- Full validation impractical → run the narrowest relevant check and state what was not verified.
- Before declaring completion: the change solves the stated problem, validation ran or gaps are stated, no unintended side effects, no secrets added or exposed.

## Change Constraints

- Do exactly what was asked. Expand scope only with clear reason.
- Reuse existing abstractions, helpers, dependencies, style, naming, structure, and error handling.
- Prefer the smallest viable change; do not modify working code without justification.
- Note adjacent issues separately unless required to complete the requested change.
- Add dependencies only when necessary; prefer existing ones; choose the smallest viable option.
- Every variable, function, constant, type, or definition introduced is used in the same change — no dead code. Reserved-for-future definitions need a comment stating the intent.

## Safety & Infrastructure

- NEVER use raw API calls (`curl`, `wget`, fetch) when a CLI wrapper exists for the service: `bkt` for Bitbucket, `atlcli` for Jira/Confluence, pi extension tools for Atlassian reads. Raw calls leak auth tokens into session logs.
- Propagate failures using existing error patterns; never swallow errors silently.
- Check injection, path traversal, unvalidated input, auth bypass, and secret-leakage risks on changes.
- Infrastructure work: inspect environment, services, configs, and logs before changing anything.
- Validate config before reload or restart; prefer reload when safe.
- Project-specific service names, paths, deployment details, and reload commands belong in local instructions, not here.

## Git & PRs

- Commit only when explicitly requested; messages state the change clearly and why it was needed.
- Keep PRs small and scoped to one concern.
- Do not force-push to main/master. Do not use `--no-verify` or `--no-gpg-sign`.

## Progress Tracking

Absurd is the durable progress tracking system (`postgresql://localhost:5433/absurd`; CLI `absurdctl`; SDK `absurd-sdk`). Do NOT create local progress files (`/tmp/progress_*.md` or similar).

Use proactively for: external waits (CI, PR review, deploy confirmation, human approval, webhooks), recurring or scheduled tasks, multi-step work >5 min with non-repeatable side effects, cross-session continuity, or explicit "use absurd" / "make durable" requests. Do not use for pure computation, quick edits, or cheap-to-replay work. Load the `absurd` skill for workflow patterns.

Persist milestones with `absurd_checkpoint`. Check existing progress:

```fish
absurdctl list-tasks --queue=default --limit=20
absurdctl dump-task --task-id=<id>
```

## Memory Routing

One curated memory system: pi-hermes-memory, exposed via `memory` / `memory_search`, stored as `MEMORY.md` / `USER.md` / `failures.md` (global) and `projects-memory/<project>/MEMORY.md` (per-project). One home per fact — never split or duplicate across stores.

| Fact type | Target | Call |
|---|---|---|
| User identity, stable preferences | `user` | `memory_add` |
| Cross-project learnings, tool quirks, conventions | `memory` | `memory_add` |
| Project-specific facts | `project` | `memory_add` |
| Failures, corrections, what did not work | `failure` | `memory_add` |
| Reusable multi-step procedures (how-to) | skills | `skill_manage` |

Never write curated facts to lean-ctx `ctx_knowledge` / `ctx_session` (dormant / ephemeral) or Serena `~/.serena/memories/` (dormant).

Recall order: `memory_search` → `session_search` → codebase (`ctx_compose` / Serena — current source of truth). `memory` holds facts (what/why); skills hold procedures (how-to); when a learning becomes a repeatable workflow, promote it to a skill and drop the memory entry. Do not duplicate a preference between this file and `user` memory.

Save immediately when: the user corrects behavior or states a preference; a tool exhibits undocumented behavior that caused a failure; an environment fact is discovered that is not in config files. Never persist: one-off task state, progress logs, what AGENTS.md or project docs already cover, speculative patterns.

## Tool Routing

Three layers, applied in order of token cost and precision. Lower layers first.

### Layer 1 — lean-ctx MCP (primary)

The `ctx_*` tools (pi-lean-ctx extension) token-compress output, cache reads (unchanged re-reads ~13 tokens), and auto-index with no activation step. Do NOT shell out to CLI equivalents for anything they cover.

| Operation | Use | NOT |
|---|---|---|
| Read files | `ctx_read` (modes: `full` before editing, `map`, `signatures`, `diff` after) | `bat`, `cat` |
| Search text | `ctx_grep`, `ctx_search` | `rg`, `grep` |
| Find files | `ctx_find`, `ctx_glob` | `fd`, `find` |
| List dirs | `ctx_ls`, `ctx_tree` | `eza`, `ls` |
| Run commands | `ctx_shell` | `bash` |
| Symbol outline before reading | `ctx_outline` | reading whole files |
| Multi-file understanding | `ctx_compose`, `ctx_overview` | reading many files |
| Call graph / references / impact | `ctx_callgraph`, `ctx_graph`, `ctx_impact` | manual tracing |
| Downstream MCP gateway | `ctx_tools` (find / call / list) | registering every catalog |
| Hash-anchored / bulk edit | `ctx_patch`, `ctx_edit` | `sd` for code |

`ctx_callgraph` / `ctx_graph` carry Serena's LSP reference edges — Serena is wired behind the gateway as a `code-symbols` addon (`lean-ctx addon list` → `✓ serena`).

### Layer 2 — Serena (LSP-precise symbol operations)

The `serena_*` tools (pi-serena worker extension) provide language-server guarantees lean-ctx's tree-sitter/BM25 layer cannot. **Auto-activated from cwd** — no activation step. If a symbol lookup fails or the wrong project resolves, the session is in the wrong directory; verify with `serena_status` / `serena_get_current_config`, restart a stale server with `serena_restart_language_server`.

| Operation | Use |
|---|---|
| Locate symbol by name path | `serena_find_symbol` (not grep) |
| Cross-file references | `serena_find_referencing_symbols` |
| Whole-codebase rename | `serena_rename_symbol` |
| Replace symbol body | `serena_replace_symbol_body` |
| Insert adjacent to symbol | `serena_insert_before_symbol` / `serena_insert_after_symbol` |
| Verified-safe delete | `serena_safe_delete_symbol` |
| Implementations / declaration | `serena_find_implementations` / `serena_find_declaration` |
| Compiler diagnostics | `serena_get_diagnostics_for_file` |

Decision rule between layers:
- Reading / exploring / composing context → lean-ctx, always first contact.
- Single-file symbol-body edit with known symbol → `ctx_patch` / `ctx_edit` (cheap) or Serena (precise; prefer for large or ambiguous bodies).
- Structural analysis (blast radius, call chains) → lean-ctx graph tools. Explicit references list, rename, safe delete, diagnostics → native Serena.
- First contact with a file you will edit by symbol → `serena_get_symbols_overview` → `serena_find_symbol` → Serena edit tools.

Fall back to Layer 3 (`edit` / `write`) when: the target is not a recognizable symbol (config, markdown, YAML, JSON); the language server does not support the file type; the edit crosses symbol boundaries or is purely textual; Serena errors (stale index, symbol not found).

### Layer 3 — CLI tools (the rest)

Text substitution, field extraction, JSON query, diff review sessions, package/runtime managers → [CLI-TOOLS.md](./CLI-TOOLS.md) — the agent-curated shell surface (`sd`, `choose`, `jq`, `hunk session`, `nix`, `tldr`). Full syntax there; examples here are fish.

### Shell syntax — fish, always

All CLI samples and suggested commands use fish. Never output bash/POSIX syntax. Translate third-party guides before presenting them.

| POSIX | Fish |
|---|---|
| `myvar=value` | `set myvar value` |
| `export VAR=val` | `set -x VAR val` |
| `$(cmd)` | `(cmd)` |
| `if [ … ]; then …; fi` | `if test …; …; end` |
| `for x in …; do …; done` | `for x in …; …; end` |

Chaining: `cmd1; and cmd2` or `cmd1 && cmd2` (fish 3.0+). Exception: legacy commands inside existing project code you are not modifying — never rewrite working code unprompted.

### Modern over legacy — no exceptions

| Operation | Use | Never |
|---|---|---|
| Text substitution | `sd` | `sed` |
| Field/column extraction | `choose` | `cut`, `awk` (simple cases) |
| Directory jump (user-facing suggestions) | `z` (zoxide) | `cd` |

## Response Format

Concise and direct by default: no filler, intros, or restated requirements.

- Direct answers directly: `npm test`, not "The command to run tests is npm test."
- Analysis outputs (review, debugging): findings with references (file paths, memory references, URLs) → conclusion → approach; mention caveats and unverified risks.
- Structure with bullet points, numbered lists, or short paragraphs — no walls of text.
- Verbose teaching mode only on explicit request ("explain in detail", "I want to understand"); return to concise after.

## Self-Maintenance

These files are living configuration. Keep them honest:

- One rule, one home. Never duplicate a rule across APPEND_SYSTEM.md, AGENTS.md, or CLI-TOOLS.md.
- After a correction, route the fix to the right file: behavior → APPEND_SYSTEM.md; operations → AGENTS.md; tool syntax → CLI-TOOLS.md.
- Prune test, per line: "Would removing this cause a mistake?" If no, delete. Bloated instruction files get ignored wholesale.
- Ceilings: AGENTS.md ~300 lines, APPEND_SYSTEM.md ~120. Shard detail into skills or linked files instead of growing these.
