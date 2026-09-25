/**
 * laya-router — Laya-backed model routing for pi.
 *
 * Mode A (input hook): prompts classified as self-contained typed decisions are
 * answered by Laya itself and handled without any LLM call (UI sessions only).
 * Mode B (before_agent_start): every other prompt is routed to a model class
 * (small / frontier) and applied via pi.setModel before the run starts.
 *
 * Explicit selection always wins: /model, Ctrl+P, or --model pins the session
 * and routing stands down. Any Laya failure falls back to pi's normal model.
 * See docs/superpowers/specs/2026-09-22-laya-pi-routing-design.md.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LayaServiceClient, LayaError, type LayaHealth, type LayaPredictResult } from "./client";
import { loadConfig, type LayaRouterConfig } from "./config";
import { RoutingLog, digest, type RoutingEvent } from "./log";
import { ROUTING_QUESTIONS, buildLayaOnlyQuestions, buildRoutingState, decide } from "./policy";

// Structural subset of the pi APIs this extension uses (keeps tests fake-able;
// the real ExtensionAPI satisfies these shapes).
interface PiLike {
	on(event: string, handler: (event: any, ctx: any) => any): () => void;
	registerCommand(name: string, options: { description: string; handler: (args: string, ctx: any) => any }): void;
	registerEntryRenderer?(customType: string, renderer: any): void;
	appendEntry(customType: string, data?: unknown): void;
	setModel(model: unknown): Promise<boolean | void>;
	exec(cmd: string, args: string[], opts?: unknown): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface RouterDeps {
	config: LayaRouterConfig;
	client: Pick<LayaServiceClient, "health" | "predict">;
	log: RoutingLog;
	argv?: string[];
	now?: () => number;
	/** Re-read config with an (already trust-checked) project overlay. Real wiring only. */
	reconfigure?: (projectPath: string | null) => {
		config: LayaRouterConfig;
		client: Pick<LayaServiceClient, "health" | "predict">;
	} | null;
}

interface ResolvedDecision {
	route: "laya" | "small" | "frontier";
	confidence: number;
	escalated: boolean;
	reason: string;
	signals?: { difficulty?: number; needsTools?: boolean; sensitive?: boolean };
}

function argvHasModel(argv: string[]): boolean {
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--model" || a === "-m") return true;
		if (a.startsWith("--model=")) return true;
	}
	return false;
}

function sameModel(a: { provider: string; id: string } | null | undefined, b: unknown): boolean {
	if (!a || !b) return false;
	const m = b as { provider?: string; id?: string };
	return m.provider === a.provider && m.id === a.id;
}

function pct(x: number): string {
	return `${Math.round(x * 100)}%`;
}

export function createRouter(pi: PiLike, deps: RouterDeps): void {
	const log = deps.log;
	const now = deps.now ?? (() => Date.now());
	let config = deps.config;
	let client = deps.client;

	let pinned = argvHasModel(deps.argv ?? process.argv);
	let selfSwitchArmed = false;
	let runtimeEnabled: boolean | null = null;
	let baseModel: { provider: string; id: string } | null = null;
	let cache: { text: string; decision: ResolvedDecision; layaLatencyMs: number } | null = null;
	let turns = 0;

	const enabledNow = (): boolean => (runtimeEnabled !== null ? runtimeEnabled : config.enabled);

	function clearStatus(ctx: any): void {
		if (ctx?.hasUI && ctx.ui?.setStatus) ctx.ui.setStatus("laya", "");
	}

	function record(e: Partial<RoutingEvent> & { promptDigest: string }): void {
		log.record({ ts: now(), consulted: false, ...e } as RoutingEvent);
	}

	/** health → predict → decide. Never throws. */
	async function consult(
		text: string,
		ctx: any,
	): Promise<{ decision: ResolvedDecision; layaLatencyMs: number } | { failure: string }> {
		const d = digest(text);
		const t0 = now();
		const health: LayaHealth = await client.health();
		if (!health.ok) {
			record({ promptDigest: d, route: "fallback", failure: health.status, totalLatencyMs: now() - t0 });
			return { failure: health.status };
		}
		let result: LayaPredictResult;
		try {
			result = await client.predict(
				buildRoutingState(text, config.state.maxPromptChars),
				ROUTING_QUESTIONS as unknown as Record<string, unknown>,
			);
		} catch (e) {
			const failure = e instanceof LayaError ? e.failure : "unreachable";
			record({ promptDigest: d, consulted: true, route: "fallback", failure, totalLatencyMs: now() - t0 });
			return { failure };
		}
		const contextTokens = typeof ctx?.getContextUsage === "function" ? ctx.getContextUsage()?.tokens : undefined;
		const decision = decide({ answers: result.answers, config, contextTokens });
		if (decision.kind === "invalid") {
			record({
				promptDigest: d,
				consulted: true,
				route: "fallback",
				failure: "schema",
				reason: decision.reason,
				layaLatencyMs: result.latencyMs,
				totalLatencyMs: now() - t0,
			});
			return { failure: "schema" };
		}
		return { decision, layaLatencyMs: result.latencyMs };
	}

	// ------------------------------------------------------------ hooks

	pi.on("session_start", async (_event: any, ctx: any) => {
		// Trusted project overlay: .pi/laya.json is a project resource, so it is
		// only honored once the session confirms project trust.
		if (deps.reconfigure) {
			const projectPath = ctx?.isProjectTrusted?.() ? join(ctx?.cwd ?? ".", ".pi", "laya.json") : null;
			const r = deps.reconfigure(projectPath);
			if (r) {
				config = r.config;
				client = r.client;
			}
		}
		// Restore the no-routing base model from the session record; capture it
		// when this session has never seen the extension. baseModel is what the
		// frontier route (routes.frontier: null) reverts to.
		try {
			const entries: any[] = ctx?.sessionManager?.getEntries?.() ?? [];
			for (let i = entries.length - 1; i >= 0; i--) {
				const e = entries[i];
				if (e?.type === "custom" && e.customType === "laya-base-model" && e.data?.provider && e.data?.id) {
					baseModel = { provider: e.data.provider, id: e.data.id };
					return;
				}
			}
		} catch {
			// fall through to capture
		}
		if (!pinned && ctx?.model?.provider && ctx?.model?.id) {
			baseModel = { provider: ctx.model.provider, id: ctx.model.id };
			try {
				pi.appendEntry("laya-base-model", baseModel);
			} catch {
				// durable capture is best-effort
			}
		}
	});

	pi.on("model_select", async (_event: any, ctx: any) => {
		if (selfSwitchArmed) return; // our own routing switch, not a user pick
		pinned = true;
		clearStatus(ctx);
	});

	pi.on("input", async (event: any, ctx: any) => {
		const text: string = typeof event?.text === "string" ? event.text : "";
		// Non-routable inputs pass through silently: extension-injected
		// messages, mid-run steering/follow-ups, and slash commands/skills
		// (skills still route on their expanded text in before_agent_start).
		if (event?.source === "extension" || event?.streamingBehavior !== undefined || text.startsWith("/")) {
			return { action: "continue" };
		}
		if (!enabledNow()) {
			record({ promptDigest: digest(text), failure: "disabled" });
			return { action: "continue" };
		}
		if (pinned) {
			record({ promptDigest: digest(text), failure: "pinned" });
			return { action: "continue" };
		}

		turns++;
		const t0 = now();
		const consulted = await consult(text, ctx);
		if ("failure" in consulted) return { action: "continue" };
		let { decision } = consulted;

		// Mode A: let Laya answer self-contained typed decisions directly.
		if (
			decision.route === "laya" &&
			config.layaOnly.enabled &&
			decision.confidence >= config.layaOnly.minConfidence &&
			ctx?.hasUI
		) {
			const questions = buildLayaOnlyQuestions(text);
			if (questions) {
				try {
					const answer = await client.predict(buildRoutingState(text, config.state.maxPromptChars), questions);
					const a = answer.answers.answer;
					// Spec §4: an answer below layaOnly.minConfidence is not trustworthy —
					// escalate to small rather than shipping a coin-flip decision.
					if (a.confidence < config.layaOnly.minConfidence) {
						record({
							promptDigest: digest(text),
							consulted: true,
							route: "fallback",
							failure: "laya-only-failed",
							reason: `answer confidence ${a.confidence.toFixed(2)} below ${config.layaOnly.minConfidence}`,
							totalLatencyMs: now() - t0,
						});
						decision = { ...decision, route: "small", escalated: true, reason: "laya-only-failed" };
						cache = { text, decision, layaLatencyMs: consulted.layaLatencyMs + answer.latencyMs };
						return { action: "continue" };
					}
					const answerText =
						a.type === "choice" && a.choice
							? `${a.choice} (${pct(a.confidence)})`
							: `${(a.noul ?? 0) >= 0.5 ? "yes" : "no"} (${pct(a.noul ?? a.confidence)})`;
					pi.appendEntry("laya-answer", {
						promptDigest: digest(text),
						kind: a.type,
						answer: answerText,
						raw: a,
					});
					if (ctx.ui?.notify) ctx.ui.notify(`Laya decision: ${answerText}`, "info");
					record({
						promptDigest: digest(text),
						consulted: true,
						route: "laya",
						confidence: decision.confidence,
						reason: decision.reason,
						model: "laya",
						layaLatencyMs: consulted.layaLatencyMs + answer.latencyMs,
						totalLatencyMs: now() - t0,
					});
					return { action: "handled" };
				} catch (e) {
					const failure = e instanceof LayaError ? e.failure : "unreachable";
					record({
						promptDigest: digest(text),
						consulted: true,
						route: "fallback",
						failure: "laya-only-failed",
						reason: failure,
						totalLatencyMs: now() - t0,
					});
					decision = { ...decision, route: "small", escalated: true, reason: "laya-only-failed" };
				}
			} else {
				// Not constructible as a typed question — take the ladder's next step.
				decision = { ...decision, route: "small", escalated: true, reason: "laya-only-missed" };
			}
		}

		cache = { text, decision, layaLatencyMs: consulted.layaLatencyMs };
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event: any, ctx: any) => {
		if (pinned || !enabledNow()) {
			clearStatus(ctx);
			return;
		}
		const prompt: string = typeof event?.prompt === "string" ? event.prompt : "";
		const t0 = now();
		let consulted: Awaited<ReturnType<typeof consult>>;
		if (cache && cache.text === prompt) {
			consulted = { decision: cache.decision, layaLatencyMs: cache.layaLatencyMs };
		} else {
			consulted = await consult(prompt, ctx);
			if ("failure" in consulted) return;
		}
		const { decision, layaLatencyMs } = consulted;
		if (turns === 0) turns = 1; // before_agent_start without an input pass (e.g. rpc)

		// Resolve the model target. Mode A missed (non-UI, disabled, or
		// non-constructible) demotes laya → small; frontier: null = baseModel.
		const classRoute = decision.route === "laya" ? "small" : decision.route;
		const targetRef = classRoute === "small" ? config.routes.small : (config.routes.frontier ?? null);
		const target =
			targetRef === null && classRoute === "frontier"
				? baseModel
				: targetRef === null
					? null
					: (() => {
							const [provider, ...rest] = targetRef.split("/");
							return { provider, id: rest.join("/") };
						})();

		const current = ctx?.model;
		const finish = (model: string | undefined) => {
			record({
				promptDigest: digest(prompt),
				consulted: true,
				route: decision.route,
				confidence: decision.confidence,
				escalated: decision.escalated,
				reason: decision.reason,
				model,
				layaLatencyMs,
				totalLatencyMs: now() - t0,
			});
			if (config.showStatus && ctx?.hasUI && ctx.ui?.setStatus) {
				ctx.ui.setStatus("laya", `laya:${decision.route} ${decision.confidence.toFixed(2)}`);
			}
		};

		if (!target || sameModel(target, current)) {
			finish(current ? `${current.provider}/${current.id}` : undefined); // no-op switch
			return;
		}
		let model: unknown;
		try {
			model = ctx?.modelRegistry?.find?.(target.provider, target.id);
		} catch {
			model = undefined;
		}
		if (!model) {
			record({
				promptDigest: digest(prompt),
				consulted: true,
				route: "fallback",
				confidence: decision.confidence,
				failure: "target-unavailable",
				reason: `${target.provider}/${target.id} not in registry`,
				totalLatencyMs: now() - t0,
			});
			return;
		}
		selfSwitchArmed = true;
		try {
			const ok = await pi.setModel(model);
			if (ok === false) throw new Error("setModel returned false");
			finish(`${target.provider}/${target.id}`);
		} catch (e) {
			record({
				promptDigest: digest(prompt),
				consulted: true,
				route: "fallback",
				confidence: decision.confidence,
				failure: "target-unavailable",
				reason: e instanceof Error ? e.message : "setModel failed",
				totalLatencyMs: now() - t0,
			});
		} finally {
			selfSwitchArmed = false;
		}
	});

	// ------------------------------------------------------------ commands

	pi.registerCommand("laya", {
		description: "Laya model-router: status, stats, on/off, test, start",
		handler: async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "status";
			const rest = args.trim().slice(sub.length).trim();
			const notify = (m: string) => ctx?.ui?.notify?.(m, "info");

			if (sub === "on" || sub === "off") {
				runtimeEnabled = sub === "on";
				notify(`laya routing ${sub} (runtime override; config file unchanged)`);
				return;
			}
			if (sub === "start") {
				const r = await pi.exec("systemctl", ["--user", "start", "laya.service"]);
				notify(r.code === 0 ? "laya.service start issued" : `systemctl failed (${r.code}): ${r.stderr.trim()}`);
				return;
			}
			if (sub === "test") {
				if (!rest) {
					notify("usage: /laya test <prompt>");
					return;
				}
				const consulted = await consult(rest, ctx);
				if ("failure" in consulted) {
					notify(`laya test: fallback (${consulted.failure})`);
					return;
				}
				const { decision, layaLatencyMs } = consulted;
				notify(
					`laya test → ${decision.route} (${decision.confidence.toFixed(2)}, ${decision.reason}` +
						`${decision.escalated ? ", escalated" : ""}) in ${layaLatencyMs}ms`,
				);
				return;
			}
			if (sub === "stats") {
				const s = log.snapshot();
				const recent = log
					.recent(5)
					.map((e) => `${e.route ?? "-"} ${e.failure ?? ""} ${e.model ?? ""}`.trim())
					.join("\n  ");
				notify(
					`consulted=${s.consulted} laya=${s.laya} small=${s.small} frontier=${s.frontier} ` +
						`escalated=${s.escalated} fallback=${s.fallback} failures=${s.failures}\n  ${recent}`,
				);
				return;
			}
			// status (default)
			const health = await client.health(true).catch(() => null);
			const s = log.snapshot();
			notify(
				`laya: ${health?.ok ? `ready (${health.layaVersion ?? "?"})` : `unavailable (${health?.status ?? "error"})`}\n` +
					`routing: ${enabledNow() ? "enabled" : "disabled"}${pinned ? " (session pinned — explicit model selected)" : ""}\n` +
					`routes: small=${config.routes.small ?? "-"} frontier=${config.routes.frontier ?? `base(${baseModel ? `${baseModel.provider}/${baseModel.id}` : "?"})`}\n` +
					`minConfidence=${config.minConfidence} layaOnly=${config.layaOnly.enabled ? config.layaOnly.minConfidence : "off"}\n` +
					`consulted=${s.consulted} small=${s.small} frontier=${s.frontier} laya=${s.laya} fallback=${s.fallback}`,
			);
		},
	});
}

// ------------------------------------------------------------ real wiring

export default function (pi: ExtensionAPI): void {
	const globalPath = join(homedir(), ".pi", "agent", "laya.json");
	const reader = (p: string): string | null => {
		try {
			return readFileSync(p, "utf8");
		} catch {
			return null;
		}
	};
	const build = (projectPath: string | null) => {
		const { config } = loadConfig(process.env, reader, globalPath, projectPath);
		const client = new LayaServiceClient({
			baseUrl: config.baseUrl,
			timeoutMs: config.timeoutMs,
			healthTimeoutMs: config.healthTimeoutMs,
			healthCacheMs: config.healthCacheMs,
		});
		return { config, client };
	};
	const initial = build(null);
	const log = new RoutingLog(initial.config.log.file.replace(/^~/, homedir()));
	createRouter(pi as unknown as PiLike, {
		config: initial.config,
		client: initial.client,
		log,
		reconfigure: (projectPath) => build(projectPath),
	});
}
