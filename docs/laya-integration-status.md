# Laya Integration Status

Reference document: what of the laya decision-engine integration is done, what is pending, and where the details live. Values, env table, ops procedures: see [laya-serve.md](./laya-serve.md).

## Done — Phase 1 scope (merged 2026-11-11, `178cb6a`)

| Piece | Status | Evidence / reference |
|---|---|---|
| `laya-serve` systemd user service (127.0.0.1:8082, English + typed-decisions, strict Jev wire) | ✅ live, user-verified | [laya-serve.md](./laya-serve.md); install/enable scripts `home/.chezmoiscripts/run_onchange_{before,after}_62a-*` |
| Classifier provider `laya` (pi extension, not models.json) | ✅ deployed, live classify verified | `home/dot_pi/agent/extensions/laya-provider.ts` + colocated tests |
| `ask_laya` tool (L10 pattern: typed questions over state/paths/gated command) | ✅ deployed, smoke-tested | `home/dot_pi/agent/extensions/ask-laya.ts` + tests; spec §3 |
| Fail-closed command gate, fail paths (5 Review Focus modes) | ✅ reviewed + tested | Final whole-branch review, 2026-11-11 |
| Ops doc, README entry, AGENTS.md deps row, navi cheat | ✅ | [laya-serve.md](./laya-serve.md), `laya-serve.cheat` |
| Top-level pi sessions get the nudge + tool | ✅ | Child-session probe 2026-11-11 |

Design authority: [the spec](./superpowers/specs/2026-11-03-laya-ask-tool-design.md) (local-only file — `docs/superpowers/` is untracked by policy). Execution record: [the plan](./superpowers/plans/2026-11-10-laya-ask-tool.md) and [spike notes](./superpowers/plans/2026-11-10-laya-ask-tool-spike-notes.md) (same).

### Known caveats in the done scope

- **Subagents cannot call `ask_laya`**: pi-subagents' builtin agent definitions (`worker`, `delegate`) hard-code tool lists excluding extension tools; the nudge does reach children (extension loads user-scoped). Fix (user-side): custom agent under `~/.pi/agent/agents/` with `ask_laya` in its tools.
- `pi --list-models` shows nothing for laya classifiers (by design) — observability alternatives in [laya-serve.md](./laya-serve.md).
- `choice:11+` confidences uncalibrated (checkpoint ships out-of-range temperatures) — do not gate on confidence for wide choices.
- Provider couples to pi's builtin `typesafe` provider for the System One classify impl (only working import route; degrades to clean error results on pi upgrades).

## Pending — spec "Phase 2 queue" (ordered by convenience)

Not started; each needs a go decision. Detail: spec §"Phase 2 queue".

1. **`"+codemode"`** — let pi route yes/no + classification steps to laya automatically during codemode.
2. **`laya/terminal`** — laya as a session model.
3. **L8/L9 file tools** — jev's read-state/prune surfaces as pi file tools.
4. **MCP rider** — `laya-mcp-server` for other MCP clients.
5. **hyper-laya skill** — usage-pattern skill for the model.
6. **Calibration/evals** — `laya-evals`, threshold tuning (score is laya's weakest English primitive; the caveat above stands until then).

### Requires explicit re-approval (binding, per removal history)

- **L7 compact hook**, **L6 guard hook** — always-on interventions; the prior always-on deployment was removed 2026-10-05 (`6b04a5a`) for exactly this. Never touch model selection either way.

### Deprioritized unless requested

- **`laya/auto` model router** — conflicts with the manual model-selection preference. Working code exists on unmerged branch `feat/laya-integration-1`; routing was benchmarked a "net wash" (spec 2026-09-26).

## Update story

Version pin bump in the 62a install script + `chezmoi apply`. Everything else: [laya-serve.md](./laya-serve.md).
