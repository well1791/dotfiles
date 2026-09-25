# Laya Pi Session Supervisor — MVP Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement the MVP tasks below. Phase 2 is explicitly deferred and is not part of MVP completion.

**Goal:** Remove Laya-driven model routing and introduce a small, safe failure-focused supervisor that records bounded, typed advice while preserving Pi's normal behavior and the user's selected model.

**Architecture:** Reuse the existing local Laya service, client, configuration, commands, and digest-only telemetry wherever possible. Remove model switching; consult Laya only for meaningful failures; record its typed recommendation as advisory data. The MVP does not retry tools, change prompts, block work, or request continuation.

**Tech Stack:** TypeScript, Bun tests, Pi extension API, existing Laya HTTP service and chezmoi-managed configuration.

**Spec:** The user-provided redesign brief, current extension behavior, `docs/laya-service.md`, and the installed Pi extension API documentation.

## MVP scope and constraints

- The user's selected Pi model remains authoritative. The extension must not call `pi.setModel()` or route between models.
- Keep only bounded failure observations and one decision type: `failure_followup: retry | investigate | stop`.
- Treat decisions as advisory/log-only. Do not automatically retry, continue, suppress settlement, rewrite context, or alter tool results.
- Consult Laya only after a meaningful failed command, test, or tool operation; do not supervise successful routine events.
- Laya errors, timeouts, malformed/low-confidence answers, or service outages leave ordinary Pi behavior unchanged.
- Keep existing privacy behavior: no full prompts, secrets, or full tool output in state or telemetry.
- Reuse existing configuration and `/laya` commands. Make only changes required to disable routing; defer renames, migration UX, and command redesign.
- Add no benchmark harness and make no performance or quality claims in this MVP.

## Review focus

1. Model invariance: no Laya outcome or failure changes the selected model.
2. Failure safety: decisions are advisory, bounded, and fall back to ordinary Pi behavior.
3. Privacy: state and telemetry do not expose raw prompts or full tool output.

---

## Phase 1: Failure-focused MVP

### Task 1: Confirm existing extension patterns and the required Pi event contract

**Files:**
- Read: `home/dot_pi/agent/extensions/laya-router/index.ts`, `client.ts`, `config.ts`, `log.ts`, and related tests
- Read: `docs/laya-service.md`
- Read: the installed Pi extension API documentation (`extensions.md`)

- [ ] Inspect the extension's routing, client/fallback, configuration, and logging paths. Identify the smallest changes needed to remove routing while preserving existing health, timeout, trust, and privacy behavior.
- [ ] Verify only the Pi event/type contract needed to observe failed operations. Do not build a comprehensive event matrix or a separate design document.
- [ ] Proceed directly to implementation; record any unsupported lifecycle behavior in the implementation tests or brief documentation update.

### Task 2: Add minimal bounded failure state and typed advisory decision

**Files:**
- Create: `home/dot_pi/agent/extensions/laya-router/supervisor-state.ts`
- Create: `home/dot_pi/agent/extensions/laya-router/supervisor-policy.ts`
- Create: `home/dot_pi/agent/extensions/laya-router/supervisor-state.test.ts`
- Create: `home/dot_pi/agent/extensions/laya-router/supervisor-policy.test.ts`
- Modify only if needed: `home/dot_pi/agent/extensions/laya-router/client.ts`, `log.ts`

- [ ] Define a bounded ring buffer for recent failure observations (for example, tool/operation kind, outcome/status, and digest) plus the last validated decision. Do not retain full prompts or outputs.
- [ ] Add only `failure_followup: retry | investigate | stop`. Its result is advisory metadata; no action is taken automatically.
- [ ] Implement pure state updates and answer validation. Invalid, low-confidence, or duplicate observations resolve to a safe no-op/fallback.
- [ ] Reuse the current digest-only telemetry format; add only the minimum decision metadata if it is not already represented.
- [ ] Add focused tests for ring-buffer bounds, truncation/digest-only state, malformed/low-confidence answers, duplicate failures, and safe defaults.

### Task 3: Remove model routing and preserve existing configuration behavior

**Files:**
- Modify: `home/dot_pi/agent/extensions/laya-router/index.ts`
- Modify: `home/dot_pi/agent/extensions/laya-router/config.ts` only as required
- Modify: `home/dot_pi/agent/extensions/laya-router/index.test.ts`
- Modify: `home/dot_pi/agent/extensions/laya-router/config.test.ts` only if configuration behavior changes

- [ ] Remove routing decisions, route-target selection/restoration, and all calls to `pi.setModel()`.
- [ ] Preserve service setup, health checks, timeouts, enablement, trusted project configuration, and other settings that remain applicable.
- [ ] Avoid a broad configuration migration. Remove only settings that directly enable model switching; defer rename and migration UX.
- [ ] Keep input and model-selection hooks from consulting Laya or disabling supervision based on which model the user selected.
- [ ] Add focused tests proving that explicit/runtime model selection is preserved and service failures do not mutate model or session behavior.

### Task 4: Connect supervision to failed operations only

**Files:**
- Modify: `home/dot_pi/agent/extensions/laya-router/index.ts`
- Modify: `home/dot_pi/agent/extensions/laya-router/supervisor-state.ts`
- Modify: `home/dot_pi/agent/extensions/laya-router/supervisor-policy.ts`
- Modify: `home/dot_pi/agent/extensions/laya-router/index.test.ts`
- Create: `home/dot_pi/agent/extensions/laya-router/lifecycle.test.ts`

- [ ] Consult Laya only after a failed command, test, or tool operation, using bounded metadata and excerpts only where required.
- [ ] Record the validated `failure_followup` result as advisory state/telemetry. Never rerun a command, inject a follow-up, block normal Pi processing, or suppress settlement.
- [ ] Add a simple duplicate-event guard and ignore extension-generated events where the available event metadata identifies them.
- [ ] Cover one failure, duplicate failure, Laya unavailable/malformed response, and extension-generated-event fallback. Do not build broad concurrency or continuation-loop machinery in the MVP.

### Task 5: Make only necessary documentation corrections

**Files:**
- Update existing extension documentation only if it incorrectly describes active model routing or the new advisory behavior.
- Update `docs/laya-service.md` only if the Pi consumer contract actually changes.

- [ ] State that routing is removed and failure decisions are advisory-only where the existing docs describe the extension.
- [ ] Do not add or redesign `/laya` commands, add a comprehensive new guide, or revise unrelated service documentation.

### Task 6: Essential final verification

- [ ] Run the extension test suite once after implementation:

  ```fish
  bun test home/dot_pi/agent/extensions/laya-router/
  ```

- [ ] Run an existing TypeScript/Bun static check if the repository already defines one; do not add a new tool solely for this MVP.
- [ ] Review the diff for the release-critical invariants: no model switching, failure advice is non-intervening, and state/telemetry stay bounded and private. Ensure tests cover fallback.
- [ ] Document any Pi API limitation encountered. Do not run benchmarks or live-service experiments as release gates.

## MVP completion criteria

- No active per-prompt routing or `pi.setModel()` call remains.
- The selected Pi model is unchanged across normal use, explicit model selection, and Laya failure.
- Laya consultations occur only after meaningful failed operations and receive bounded state.
- A typed failure recommendation is recorded as advisory only; Pi's normal retry/settlement behavior is untouched.
- Laya failure preserves normal Pi operation; no raw prompts or full tool output enter telemetry/state.
- Focused tests and the final extension suite pass.

---

## Phase 2: Deferred follow-up (not required for MVP completion)

Only plan or implement these after the MVP is reviewed and there is a concrete need:

- Completion-sufficiency decisions and any automatic continuation/intervention.
- Supervision after successful tool results, broad lifecycle coverage, and cross-event/concurrent ordering guarantees.
- Session-state persistence across resume/fork and continuation budgets/loop controls.
- Configuration renaming/migration, `/laya` command redesign, expanded telemetry schema, and a standalone supervisor guide.
- A/B/C benchmark harness, repeated trials, cache analysis, and empirical token/cost/latency/quality claims.

Each deferred behavior needs its own Pi API feasibility check and focused requirements before being added to scope. The MVP makes no claim that Laya reduces model calls, tokens, cost, or latency.
