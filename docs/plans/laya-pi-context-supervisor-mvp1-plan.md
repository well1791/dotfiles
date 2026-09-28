# Laya Pi Context-Supervisor MVP-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace laya-router's model routing with tool-result representation gating — Laya classifies each large tool result as verbatim/compress/digest once, and the verdict is applied per model request via the `context` event, cutting input tokens without touching the session record or the selected model.

**Architecture:** Classify once at `tool_result` (single `choice` question, bounded state), cache the verdict in a bounded LRU keyed by content digest, and transform tool-result messages per model request in the `context` handler. The session record, exports, and compaction still see full outputs. Routing (routes/policy/setModel) is removed entirely.

**Tech Stack:** TypeScript, Bun tests (mocked service, house pattern), Pi extension API (`tool_result`, `context` events), existing Laya HTTP service and chezmoi-managed configuration.

**Spec:** `docs/superpowers/specs/2026-09-26-laya-context-supervisor-design.md` — the plan argues from the spec; executors read both. (Supersedes `docs/plans/laya-pi-session-supervisor-plan.md`, whose routing-removal task this plan inherits.)

**Execution notes:** Inline execution (superpowers:executing-plans). Subagent review at the end runs on `opencode/glm-5.3-flash` (cheap, separate quota pool from the session's `zai`); optional second opinion from local qwen (`qwen-start`, OpenAI-compatible `http://127.0.0.1:8083/v1`, model `qwen3.5-4b`) via its documented curl API, diff-only, no secrets. Interruptions (glm quota) are recoverable: progress ledger at `.superpowers/sdd/<plan-basename>/progress.md` + git commits per task.

## Global Constraints

From spec §4–§9, verbatim values:

- No model routing: no `pi.setModel` call anywhere; the selected model never changes (spec §1, §8).
- Kill-switch `PI_LAYA_DISABLE=1` forces everything off; `/laya off` → no laya calls, no transformations (spec §7, §8).
- Fallback-first: laya down / timeout / 4xx / 5xx / malformed / low confidence → verbatim, single attempt, no retry (spec §4, §8).
- Unknown result (no verdict, eviction, restart) → verbatim (spec §6).
- Privacy: verdict cache and telemetry never retain raw prompts or full tool output — digest-only (existing `digest()` sha256/16-hex) (spec §2, §9).
- Defaults: `contextSupervision = { enabled: true, minBytes: 2048, minConfidence: 0.7, compressHeadChars: 1500, verdictCacheEntries: 200 }`; retained `timeoutMs 5000`, `state.maxPromptChars 4000` (spec §7).
- LRU key: `sha256(toolName + "\n" + result text as received)`; cache stores verdict, confidence, byte counts — never raw text (spec §4).
- Classification state: `{ task: <anchor>, tool, output }` with `output` capped at `state.maxPromptChars` (spec §5).
- Question: one `choice`, id `representation`, criteria/instructions exactly as spec §5.
- Representation copy exactly (spec §4):
  - compress: first `compressHeadChars` verbatim + `[…laya: compressed, N chars total omitted; re-run the tool or read the source for the full output]`
  - digest: `[laya: {tool} {status} — output classified irrelevant to the current task; N chars omitted]` as the entire body; `{status}` = `error` when `isError`, else `ok`.
- Both representations keep the result's success/error status; session record is never modified (spec §4, §8).
- `context` transform error → log, return messages unmodified (spec §8).
- Prompt/system messages are never modified — only `role === "toolResult"` messages (spec §10).
- Byte counts: `Buffer.byteLength(text, "utf8")` (plan decision; spec says "bytes").
- Extension directory stays `laya-router`; no `/laya` command redesign beyond `test` extension and `stats` extension (spec §3, §14).

## Review Focus

Input classes the spec implies but task tests do not fully exercise, each pinned to its owning task:

1. **Tool results containing ImageContent** — a digest/compress that drops images loses data silently. Expected: any result whose `content` has an image part is left verbatim (never gated). → Task 5 test.
2. **`/laya off` (or kill-switch) with verdicts already cached** — expected: no laya calls AND no transformations applied. → Task 5 test.
3. **LRU eviction** — > `verdictCacheEntries` distinct gated results evicts the oldest; a re-seen evicted result must fall back to verbatim (not stale-transform). → Task 2 test.
4. **Multi-part text content** (`content` = several text items) — key over concatenated text; transform replaces whole content with one text part. → Task 3 test (render) + Task 5 test (transform).
5. **Sequential duplicate results** — identical result text re-observed must be a cache hit: one predict total, second occurrence still transformed. → Task 5 test.

---

### Task 1: Configuration — contextSupervision block, drop routing keys

**Files:**
- Modify: `home/dot_pi/agent/extensions/laya-router/config.ts`
- Test: `home/dot_pi/agent/extensions/laya-router/config.test.ts`
- Modify: `home/dot_pi/agent/laya.json` (chezmoi source; live copy is identical today)

**Interfaces:**
- Produces: `LayaRouterConfig` now contains `contextSupervision: { enabled: boolean; minBytes: number; minConfidence: number; compressHeadChars: number; verdictCacheEntries: number }` and NO `routes`, `signals`, `escalate`, `minConfidence`, `smallRouteMaxContextTokens`, `layaOnly`. `DEFAULT_CONFIG.contextSupervision` = global-constraint values. Stale keys in overlay files produce one warning each, message pattern: `"routes" is no longer used; routing was removed` (same for the other five keys), values ignored, no throw.

- [ ] **Step 1: Write failing tests** — defaults include contextSupervision block; overlay deep-merge sets each subkey; invalid subkeys (minBytes 0, minConfidence 2, compressHeadChars "x", verdictCacheEntries -1, enabled "yes") are dropped with warnings; overlay containing each removed routing key yields its deprecation warning and the value is ignored; kill-switch still forces `enabled:false`; config still frozen.
- [ ] **Step 2: Run** `bun test home/dot_pi/agent/extensions/laya-router/config.test.ts` **Expected:** FAIL (new assertions).
- [ ] **Step 3: Implement** — add sanitize branch for `contextSupervision` (bool enabled; minBytes ≥ 1; minConfidence ∈ [0,1]; compressHeadChars ≥ 1; verdictCacheEntries ≥ 1), delete routing-key sanitize branches, add deprecation-warning loop over the six removed keys, update `DEFAULT_CONFIG` and the interface. Drop the six keys from `home/dot_pi/agent/laya.json` (keep every other line byte-identical).
- [ ] **Step 4: Run** `bun test home/dot_pi/agent/extensions/laya-router/config.test.ts` **Expected:** PASS.
- [ ] **Step 5: Run full suite** `bun test home/dot_pi/agent/extensions/laya-router/` — routing tests in `index.test.ts`/`policy.test.ts` will now FAIL on config shape; that break is Task 5's to clear. **Expected:** config tests pass; index/policy failures are only config-shape failures. (If suite-wide green is required here, temporarily `cfg()`-fix `index.test.ts` minimally — do not rewrite routing tests.)
- [ ] **Step 6: Commit** `git add -A home/dot_pi/agent/extensions/laya-router/ home/dot_pi/agent/laya.json && git commit -m "feat(laya): contextSupervision config, drop routing keys"`

### Task 2: Verdict cache — bounded LRU, digest-keyed

**Files:**
- Create: `home/dot_pi/agent/extensions/laya-router/verdict-cache.ts`
- Test: `home/dot_pi/agent/extensions/laya-router/verdict-cache.test.ts`

**Interfaces:**
- Produces:
  - `export type Verdict = "verbatim" | "compress" | "digest";`
  - `export interface VerdictEntry { verdict: Verdict; confidence: number; bytesIn: number; bytesOut: number; }`
  - `export function verdictKey(toolName: string, text: string): string;` — sha256 of `toolName + "\n" + text`, 16 hex chars, implemented locally in this module (same format as `log.digest`, kept separate so the cache module has no log dependency).
  - `export class VerdictCache { constructor(maxEntries: number); get(key: string): VerdictEntry | undefined; set(key: string, entry: VerdictEntry): void; size(): number; }` — LRU: `get` refreshes recency; `set` on full evicts least-recently-used; entries never contain raw text.

- [ ] **Step 1: Write failing tests** — key is stable 16-hex and differs for different toolName or text (incl. text differing only after 4000 chars); set/get roundtrip; get refreshes recency (fill cache, touch entry 0, insert one more → entry 1 evicted, entry 0 alive); bound respected (`size() ≤ maxEntries`); no raw text stored (JSON.stringify of entries lacks the source text).
- [ ] **Step 2: Run** `bun test home/dot_pi/agent/extensions/laya-router/verdict-cache.test.ts` **Expected:** FAIL (module missing).
- [ ] **Step 3: Implement** — `Map` insertion-order LRU (delete+set on get; evict first key when over bound).
- [ ] **Step 4: Run** `bun test home/dot_pi/agent/extensions/laya-router/verdict-cache.test.ts` **Expected:** PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(laya): bounded LRU verdict cache"`

### Task 3: Supervision policy — pure question/validation/render module

**Files:**
- Create: `home/dot_pi/agent/extensions/laya-router/supervision-policy.ts`
- Test: `home/dot_pi/agent/extensions/laya-router/supervision-policy.test.ts`

**Interfaces:**
- Consumes: `Verdict`, `VerdictEntry` from Task 2; `LayaRouterConfig` from Task 1.
- Produces:
  - `export const REPRESENTATION_QUESTIONS: Record<string, unknown>` — single question id `representation`, spec §5 text verbatim (instructions + criteria for verbatim/compress/digest).
  - `export function buildGateState(task: string, tool: string, output: string, maxChars: number): { task: string; tool: string; output: string };` — output truncated to `maxChars`.
  - `export function validateVerdict(answer: unknown, minConfidence: number): Verdict | null;` — non-null only when `type === "choice"`, `choice ∈ {verbatim, compress, digest}`, confidence finite and ≥ minConfidence; else null (covers malformed + low-confidence).
  - `export function effectiveVerdict(bytes: number, verdict: Verdict | null, minBytes: number, compressHeadChars: number): Verdict;` — §6 rules: `bytes ≤ minBytes` → verbatim; null → verbatim; compress with `bytes ≤ compressHeadChars` → verbatim (no-op guard); else the verdict.
  - `export function renderVerdict(toolName: string, text: string, isError: boolean, verdict: "compress" | "digest", compressHeadChars: number): string;` — exact §4 copy; `N` = total omitted chars = `text.length - kept` for compress (kept = first `compressHeadChars` chars) and `text.length` for digest; `{status}` = `isError ? "error" : "ok"`.

- [ ] **Step 1: Write failing tests** — question object matches §5 shape/text exactly; buildGateState truncates only output; validateVerdict accepts each valid choice at/above threshold and rejects wrong type/unknown choice/low confidence/malformed shapes; effectiveVerdict covers rules 1/3/4 with boundary values (bytes = minBytes, bytes = minBytes+1, compress at exactly compressHeadChars); renderVerdict produces the exact §4 strings for a known input (assert full expected strings) and handles multi-byte text.
- [ ] **Step 2: Run** `bun test home/dot_pi/agent/extensions/laya-router/supervision-policy.test.ts` **Expected:** FAIL.
- [ ] **Step 3: Implement** — pure module, no pi imports, no I/O.
- [ ] **Step 4: Run** `bun test home/dot_pi/agent/extensions/laya-router/supervision-policy.test.ts` **Expected:** PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(laya): pure representation-gating policy module"`

### Task 4: Telemetry — gate entries and counters

**Files:**
- Modify: `home/dot_pi/agent/extensions/laya-router/log.ts`
- Test: `home/dot_pi/agent/extensions/laya-router/log.test.ts`

**Interfaces:**
- Produces: `RoutingEvent` gains optional `kind?: "gate"`, `tool?: string`, `verdict?: Verdict`, `bytesIn?: number`, `bytesOut?: number`; `promptDigest` stays required (digest of the task anchor). `Counters` becomes `{ consulted, failures, fallback, disabledSkips, gated, verbatim, compress, digest, reclaimedBytes, reReadAfterDigest }` — route-class counters (`laya/small/frontier/escalated/pinnedSkips`) removed. Counting rules: `kind === "gate"` → `gated++` and the matching verdict counter (including verbatim); `reclaimedBytes += max(0, bytesIn - bytesOut)`. `reReadAfterDigest` increments only via `RoutingLog.markReRead(): void`, called by Task 5 wiring when a tool_result verdict-key HITS an existing cache entry whose verdict is digest or compress (agent re-ran the tool and got the same digested/compressed output — the recovery-pointer quality signal); a hit emits no gate event.

- [ ] **Step 1: Write failing tests** — recording a gate event increments gated + verdict counter + reclaimedBytes correctly (incl. bytesOut > bytesIn → no reclaim); failure entries increment failures/fallback as today; ring bounds unchanged; removed counters absent from snapshot; `markReRead()` increments only `reReadAfterDigest`; jsonl line contains the new fields and no raw text.
- [ ] **Step 2: Run** `bun test home/dot_pi/agent/extensions/laya-router/log.test.ts` **Expected:** FAIL.
- [ ] **Step 3: Implement** — extend `RoutingEvent`, rewrite `Counters`/record switch, keep fs-error swallowing and RING_MAX.
- [ ] **Step 4: Run** `bun test home/dot_pi/agent/extensions/laya-router/log.test.ts` **Expected:** PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(laya): gate telemetry entries and counters"`

### Task 5: Remove routing; wire tool_result classification + context transform

**Files:**
- Modify: `home/dot_pi/agent/extensions/laya-router/index.ts` (rewrite)
- Delete: `home/dot_pi/agent/extensions/laya-router/policy.ts`, `home/dot_pi/agent/extensions/laya-router/policy.test.ts`
- Test: `home/dot_pi/agent/extensions/laya-router/index.test.ts` (rewrite)

**Interfaces:**
- Consumes: `LayaServiceClient.health/predict` (unchanged `client.ts`); Tasks 1–4 products; Pi events — `tool_result: { toolName, toolCallId, input, content: (TextContent|ImageContent)[], isError }` (handler returns nothing), `context: { messages: AgentMessage[] }` → optional `{ messages }`, `input: { text, source?, streamingBehavior? }`.
- Produces: `createRouter(pi, deps)` with `RouterDeps = { config, client, log, now?, reconfigure? }` (argv removed — no pinning concept). Hook behavior:
  - `session_start`: keep trusted-project `reconfigure` only; drop baseModel capture/restore.
  - `input`: capture task anchor = latest non-extension, non-streaming, non-slash text, capped at `state.maxPromptChars`; never consults laya; no return-value mutation.
  - `tool_result` (wiring, in order): skip when supervision disabled (log `failure:"disabled"` gate-skip only when it would have gated); extract text = concat of text parts; skip (verbatim, no entry) when any image part present or text empty; bytes = utf8 byteLength; `bytes ≤ minBytes` → verbatim, no entry, no laya; cache hit → `log.markReRead()` when the hit entry's verdict is digest or compress, no laya, no gate event; miss → health (cached) → predict with `buildGateState(anchor, toolName, text, maxPromptChars)` + `REPRESENTATION_QUESTIONS` → `validateVerdict` → `effectiveVerdict` → store entry (verdict, confidence, bytesIn, bytesOut from rendered length when verdict ≠ verbatim else bytesIn) → record gate event. Any laya failure → record gate event with `failure` kind (`unreachable/timeout/http/malformed/schema` or health status), verbatim, no retry. Handler always returns `undefined` (advisory).
  - `context`: build new messages array; for each `role === "toolResult"` message, recompute `verdictKey`, on digest/compress entry replace content with single text part `renderVerdict(...)` (never touch prompt/system/other messages, never mutate input objects — shallow-copy the changed message); on any throw → log and return messages unmodified. Skip entirely (return undefined) when supervision disabled. Deterministic given the cache.
  - Commands: `/laya` status (health + counters, no route lines), `/laya stats` extended with `gated= verbatim= compress= digest= reclaimedBytes= reReadAfterDigest=`, `/laya on|off` (runtime override incl. transformations), `/laya start` unchanged, `/laya test <text>` extended: classifies the pasted `<text>` as a tool output named `test` against the current anchor and notifies the verdict + confidence (falls back to verbatim message on failure).

- [ ] **Step 1: Write failing tests for routing removal** — no `setModel` in PiLike/FakePi assertions; model_select emits nothing; no routing tests remain; config-driven `enabled:false` + kill-switch covered; suite has zero references to routes/policy.
- [ ] **Step 2: Run** `bun test home/dot_pi/agent/extensions/laya-router/index.test.ts` **Expected:** FAIL.
- [ ] **Step 3: Strip routing** — delete policy.ts(+test), remove ResolvedDecision/cache/pinned/baseModel/selfSwitchArmed/argvHasModel/sameModel/setModel/Mode A/before_agent_start/model_select routing logic; keep client/config/log wiring and commands shell. **Run suite** `bun test home/dot_pi/agent/extensions/laya-router/` **Expected:** PASS (commands minimal versions). **Commit** `git commit -am "feat(laya): remove model routing"`.
- [ ] **Step 4: Write failing tests for anchor + classification** — anchor captured from plain input, skipped for extension/steer/slash sources, capped; small result (≤ minBytes) → no predict, no cache entry; large result → exactly one predict with §5 state+questions, verdict cached, gate event recorded with bytes; duplicate identical result → cache hit, no second predict, re-read counter increments when verdict is digest; laya unhealthy → no predict, gate event failure, verbatim; predict throws LayaError timeout → same; low-confidence answer (below contextSupervision.minConfidence) → verbatim, gate event recorded with verdict verbatim; disabled (`enabled:false`, `/laya off`, kill-switch) → no predict, no transformation even with warm cache; image-bearing content → untouched, no predict; extension-generated events need no special casing for `tool_result` (toolName filter: classify built-in tools `bash|powershell|read|edit|write|grep|find|ls` only — custom/unknown toolNames verbatim, no entry).
- [ ] **Step 5: Run** `bun test .../index.test.ts` **Expected:** FAIL.
- [ ] **Step 6: Implement classification wiring** — per Interfaces. **Run** suite **Expected:** PASS. **Commit** `git commit -am "feat(laya): classify large tool results via laya"`.
- [ ] **Step 7: Write failing tests for context transform** — cached digest verdict → message content replaced with exact digest line, prompt and other messages untouched (identity check on untouched message objects); compress → head + exact marker; verbatim/no-entry/evicted → identity; isError preserved in status word; disabled → undefined return; handler called twice with same cache → identical output (determinism); transform throw → messages returned unmodified (inject throwing render via corrupt entry, e.g. verdict "digest" with bytesIn NaN — assert graceful).
- [ ] **Step 8: Run** `bun test .../index.test.ts` **Expected:** FAIL.
- [ ] **Step 9: Implement transform wiring**. **Run** full suite `bun test home/dot_pi/agent/extensions/laya-router/` **Expected:** PASS (all files). **Commit** `git commit -am "feat(laya): apply verdicts per model request via context event"`.
- [ ] **Step 10: Command tests** — `/laya test <text>` consults and notifies verdict; `/laya stats` shows new counters; `/laya on|off` toggles transformations. RED → implement → GREEN → **Commit** `git commit -am "feat(laya): /laya test gate classification, stats counters"`.

### Task 6: Documentation corrections

**Files:**
- Modify: `docs/laya-service.md` (Pi integration section)
- Modify: `README.md` (entry 32 "Pi integration" bullet)
- Modify: `AGENTS.md` (laya-router row in Tool Dependencies)
- Modify: `home/dot_pi/agent/extensions/laya-router/index.ts` header comment

- [ ] **Step 1:** Update the four surfaces: routing removed; gating flow (classify-once at tool_result, apply at context); verdict cache + LRU bound; `contextSupervision` config keys; `/laya test` now classifies pasted output; telemetry fields; benchmark §11 pending (no quality claims). Keep edits scoped to what changed — no new guide.
- [ ] **Step 2:** Read back each edited surface (`ctx_read`) — no stale routing claims remain: `rg -n 'route|routing|setModel|frontier|small model' docs/laya-service.md README.md AGENTS.md` — expect only historical benchmark references.
- [ ] **Step 3: Commit** `git commit -am "docs(laya): routing removed, representation gating active"`.

### Task 7: Final verification

- [ ] **Step 1:** `bun test home/dot_pi/agent/extensions/laya-router/` — full suite green; note the test count.
- [ ] **Step 2:** Static check only if the repo already defines one (it does not — none was found; do not add one). `bun build --no-bundle`-style typecheck is not configured; `bun test` transpiles and type-strips TS, so rely on the suite + `rg` checks below.
- [ ] **Step 3:** Invariant review of the whole diff vs `8e06c42`: zero `setModel` references; no raw prompt/tool-output strings into `log.record` or `VerdictCache.set`; every laya failure path ends verbatim; `PI_LAYA_DISABLE=1` and `/laya off` produce no predict calls and no transformations; session-record writes absent (no `appendEntry` for gating).
- [ ] **Step 4:** Optional live smoke (only if laya service is up: `curl -fsS http://127.0.0.1:8082/healthz`): `/laya test <long pasted output>` returns a verdict. No benchmark run (spec §11 is a separate post-implementation activity; note it as pending).
- [ ] **Step 5:** Final whole-branch review per superpowers:executing-plans (reviewer subagent on `opencode/glm-5.3-flash`; optional qwen second opinion). Fix pass for Critical/Important findings with RED→GREEN tests.

## Spec coverage map

- §4 flow → Tasks 2, 3, 5. §5 questions → Task 3. §6 policy → Task 3 (+ wiring order Task 5). §7 config → Task 1. §8 fallback table → Task 5 tests (each row). §9 observability → Tasks 4, 5. §10 testing → all tasks + Task 7. §11 benchmark → Task 7 Step 4 note (deferred, needs live sessions; success criteria unchanged). §12 MVP-2, §14 out-of-scope → excluded by design.
