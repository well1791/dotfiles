# Laya-Router A/B Benchmark — 2026-09-23

Baseline (A: routing disabled, every prompt → `zai/glm-5.3`) vs Laya routing
(B: shipped defaults, `small` = `zai/glm-5.3-flash`, frontier = base model).
5 fixed scenarios × both sides, `pi -p -ne -e <laya-router> -a`, isolated
session dirs, scratch cwds (see `scripts/laya-bench/scenarios.md`).

## Routing decisions (from routing.jsonl)

| Scenario | Laya decision | Routed model | Correct? |
|---|---|---|---|
| S1 `hello` | small (trivial 0.81) | glm-5.3-flash | ✓ |
| S2 JSON one-liner | frontier (default-frontier) | glm-5.3 | ✓ conservative (laya probes: trivial score 0.12 < 0.60 cut) |
| S3 jest or vitest? | laya (decision 0.85) → Mode A skipped in print mode → small | glm-5.3-flash | ✓ |
| S4 retry wrapper | frontier (coding) | glm-5.3 | ✓ |
| S5 billing schema | frontier (default-frontier) | glm-5.3 | ✓ |

**0 wrong-cheap selections. 0 quality failures** (all five answers graded pass
on both sides: greetings ✓, "JavaScript Object Notation" ✓, both S3 sides
legitimately ask for repo context, both S4 sides ask sensible retry-parameter
clarifications, both S5 sides list multi-table schemas).

## Usage & cost (from session jsonl via extract-usage.ts)

| Side | glm-5.3 calls | flash calls | Total tokens | Total cost |
|---|---|---|---|---|
| A (baseline) | 10 | 0 | 127,958 | $0.0473 |
| B (routing) | 6 | 4 | 127,642 | $0.0488 |

| Scenario | A cost | B cost | Δ |
|---|---|---|---|
| S1 | $0.00376 | $0.00188 | **−50%** |
| S2 | $0.00337 | $0.01614 | **+379%** (cold-cache re-entry, see below) |
| S3 | $0.00791 | $0.00279 | **−65%** |
| S4 | $0.01670 | $0.01300 | −22% (fewer turns) |
| S5 | $0.01551 | $0.01496 | −4% |

Latency: Laya consult 440–602 ms per routed prompt (CPU, 4 questions, single
forward pass); total prompt latency dominated by model time (2.8–34 s both
sides, no perceptible routing overhead).

## Findings

1. **Decisions are correct and safe.** Every coding/design prompt stayed on
   the frontier; every trivial/typed-decision prompt left it. The composition
   policy's conservative default (unknown → frontier) behaved exactly as
   designed (S2, S5).
2. **Net cost on this mix is a wash (+3%)** — because the mix is 3/5
   frontier-deserving and one trivial savings is offset by S2's **cold-cache
   penalty**: after flash answered S1, glm-5.3 re-entered with a cold prompt
   cache and paid full input price on the identical 12.4k-token system prompt
   ($0.0161 vs $0.0034 warm). Model switching trades cache warmth for cheap
   tokens — precisely the effect the spec's 24k-context guard and §13
   limitation anticipated; at 12k context the guard does not trigger.
3. **Where routing pays:** consecutive trivial/conversational traffic (S1
   −50%, S3 −65% — and S3 also shifted work off the frontier quota pool:
   10 → 6 glm calls, 4 moved to flash). Mode A is free outright. Quota (the
   actual scarce resource on zai) improves whenever prompts route off glm-5.3.
4. **Where routing costs:** single trivial prompt sandwiched between frontier
   work (S2 pattern) — the switch-back re-pays cold input. Mitigation options
   (future work, not in scope): cache-aware stickiness — stay on frontier
   when the context is already warm on it and the prompt is borderline.

## Verdict

The integration **works as specified**: correct routing, zero quality
degradation, graceful behavior throughout. As a *cost optimizer* on short
mixed sessions the cache penalty can offset trivial-prompt savings; on
conversational/steering-heavy sessions or quota-constrained windows it
reduces frontier usage materially (40% of glm calls moved off-frontier in
this run). The thresholds (0.60/0.50/0.75, minConfidence 0.70) produced no
misroutes across the live grid + benchmark.
