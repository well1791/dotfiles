/**
 * laya-model-router — System 1 dynamic model routing for pi.
 *
 * Registers a virtual model (`laya/auto`) that classifies each new user prompt
 * with the local Laya decision service (127.0.0.1:8082, /v1/predict) and
 * dispatches the request to a physical tier:
 *   trivial_shell | localized_refactor       -> fast  (default zai/glm-5.3-flash)
 *   multi_file_architecture | deep_debugging -> heavy (default zai/glm-5.3)
 *
 * Opt-in by design: nothing changes until the virtual model is selected via
 * /model or --model. Continuations and retries stay sticky on the model that
 * handled the turn (keeps prompt caches and thinking signatures valid). Every
 * Laya failure — timeout (hard budget, default 100ms), HTTP error, malformed
 * payload, low confidence — fails open to the heavy tier; the user turn is
 * never interrupted. route() itself never throws unless no physical model can
 * be resolved at all.
 *
 * Config: ~/.pi/agent/laya-model-router.json (deep-merged over defaults).
 * Env overrides: LAYA_MODEL_ROUTER_URL, LAYA_MODEL_ROUTER_ENABLED=0|1.
 * Telemetry: JSONL at ~/.local/share/pi-laya/model-routing.jsonl.
 *
 * Coexists with the laya-router/ extension (tool-result supervision, spec
 * 2026-09-26); that extension never touches model selection.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { mkdirSync, appendFileSync, statSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

// ---------------------------------------------------------------- constants

export const INTENTS = [
	"trivial_shell",
	"localized_refactor",
	"multi_file_architecture",
	"deep_debugging",
] as const;
export type Intent = (typeof INTENTS)[number];

/** Question wording is load-bearing for laya calibration (spec 2026-09-22 §5). */
export const INTENT_QUESTION = {
	type: "choice" as const,
	instructions: "Classify the coding-agent task this user prompt initiates.",
	criteria: {
		trivial_shell:
			"Routine shell or file operations, lookups, formatting, git chores, or simple questions needing no code changes.",
		localized_refactor:
			"Small contained code edits: a rename, a single-function change, a small bugfix confined to one file.",
		multi_file_architecture:
			"Design or cross-cutting changes spanning multiple files or modules, new features, or planning work.",
		deep_debugging:
			"Root-cause analysis of failures, race conditions, subtle or intermittent bugs, long reasoning chains.",
	},
};

const DEFAULT_CONFIG = {
	enabled: true,
	baseUrl: "http://127.0.0.1:8082",
	/** Hard budget for the classification call; on expiry the route fails open. */
	classifyTimeoutMs: 100,
	/** Calibrated-confidence gate; below it the route fails open to heavy. */
	minConfidence: 0.3,
	maxPromptChars: 4000,
	virtualModel: { provider: "laya", id: "auto", name: "Laya Auto" },
	tiers: {
		fast: { provider: "zai", model: "glm-5.3-flash" },
		heavy: { provider: "zai", model: "glm-5.3" },
	},
	log: {
		file: "~/.local/share/pi-laya/model-routing.jsonl",
		maxBytes: 8 * 1024 * 1024,
	},
};

export type RouterConfig = typeof DEFAULT_CONFIG;

const CONFIG_PATH = "~/.pi/agent/laya-model-router.json";

// ---------------------------------------------------------------- config

function expand(p: string): string {
	return p.startsWith("~/") ? joinHome(p.slice(1)) : p;
}

function joinHome(rest: string): string {
	return `${homedir()}${rest}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-merge a user file over defaults; unknown keys are ignored. */
function deepMerge<T>(base: T, override: unknown): T {
	if (!isPlainObject(override) || !isPlainObject(base)) return base;
	const out: Record<string, unknown> = { ...base };
	for (const [k, v] of Object.entries(override)) {
		if (!(k in base)) continue;
		out[k] = isPlainObject(v) && isPlainObject((base as Record<string, unknown>)[k])
			? deepMerge((base as Record<string, unknown>)[k], v)
			: v;
	}
	return out as T;
}

function loadConfigFile(path: string, exists: (p: string) => boolean, read: (p: string) => string): unknown {
	if (!exists(path)) return {};
	try {
		return JSON.parse(read(path));
	} catch {
		return {}; // malformed config: defaults apply, routing still works
	}
}

export function resolveConfig(env: NodeJS.ProcessEnv = process.env, deps?: {
	exists?: (p: string) => boolean;
	read?: (p: string) => string;
}): RouterConfig {
	const exists = deps?.exists ?? existsSync;
	const read = deps?.read ?? readFileSync;
	let config = deepMerge(DEFAULT_CONFIG, loadConfigFile(expand(CONFIG_PATH), exists, read));

	const url = env.LAYA_MODEL_ROUTER_URL;
	if (typeof url === "string" && url.length > 0) config = { ...config, baseUrl: url };

	const flag = env.LAYA_MODEL_ROUTER_ENABLED;
	if (flag === "0" || flag === "false" || flag === "no") config = { ...config, enabled: false };
	if (flag === "1" || flag === "true" || flag === "yes") config = { ...config, enabled: true };

	return config;
}

// ---------------------------------------------------------------- pure helpers

/** Text of the last user message; string content or text parts. Null when absent or image-only. */
export function extractLastUserText(messages: readonly unknown[]): string | null {
	for (let i = messages.length - 1; i >= 0; i--) {
		const m = messages[i];
		if (!isPlainObject(m) || m.role !== "user") continue;
		const content = m.content;
		if (typeof content === "string") return content.length > 0 ? content : null;
		if (!Array.isArray(content)) return null;
		let out = "";
		for (const part of content) {
			if (!isPlainObject(part) || part.type !== "text" || typeof part.text !== "string") continue;
			out += part.text;
		}
		return out.length > 0 ? out : null;
	}
	return null;
}

/** intent for a validated answer; null on any malformation or low confidence (fail-open). */
export function validateIntentAnswer(answer: unknown, minConfidence: number): Intent | null {
	if (!isPlainObject(answer)) return null;
	if (answer.type !== "choice") return null;
	const choice = answer.choice;
	if (typeof choice !== "string" || !INTENTS.includes(choice as Intent)) return null;
	const confidence = answer.confidence;
	if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
	if (confidence < minConfidence) return null;
	return choice as Intent;
}

export function intentToTier(intent: Intent | null): "fast" | "heavy" {
	if (intent === "trivial_shell" || intent === "localized_refactor") return "fast";
	return "heavy"; // includes null: unknown or unclassified always fails safe
}

// ---------------------------------------------------------------- classify

export interface ClassifyOutcome {
	intent: Intent | null;
	/** calibrated confidence of the choice, when an answer was produced */
	confidence: number | null;
	/** failure kind when intent is null: timeout | http | malformed | schema | error | skipped */
	failure?: string;
	latencyMs: number;
}

export async function classify(
	prompt: string,
	config: RouterConfig,
	fetchImpl: typeof fetch = fetch,
): Promise<ClassifyOutcome> {
	const started = Date.now();
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), config.classifyTimeoutMs);
	try {
		const res = await fetchImpl(`${config.baseUrl}/v1/predict`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				state: prompt.length > config.maxPromptChars ? prompt.slice(0, config.maxPromptChars) : prompt,
				questions: { intent: INTENT_QUESTION },
			}),
			signal: controller.signal,
		});
		if (!res.ok) {
			return { intent: null, confidence: null, failure: `http:${res.status}`, latencyMs: Date.now() - started };
		}
		const data: unknown = await res.json();
		const answer = isPlainObject(data)
			&& isPlainObject(data.result)
			&& isPlainObject(data.result.answers)
			? data.result.answers.intent
			: undefined;
		const intent = validateIntentAnswer(answer, config.minConfidence);
		return {
			intent,
			confidence: isPlainObject(answer) && typeof answer.confidence === "number" ? answer.confidence : null,
			failure: intent ? undefined : answer ? "schema" : "malformed",
			latencyMs: Date.now() - started,
		};
	} catch (err) {
		const aborted = err instanceof Error && (err.name === "AbortError" || /aborted/i.test(String(err?.message ?? "")));
		return { intent: null, failure: aborted ? "timeout" : "error", latencyMs: Date.now() - started };
	} finally {
		clearTimeout(timer);
	}
}

// ---------------------------------------------------------------- jsonl log

export interface RouteRecord {
	ts: number;
	event: "route";
	reason: string;
	intent: string | null;
	confidence: number | null;
	classifyMs: number | null;
	sticky: boolean;
	tier: string | null;
	model: string;
	failure?: string;
}

export class RoutingLog {
	private readonly file: string;
	private readonly maxBytes: number;
	constructor(file: string, maxBytes: number) {
		this.file = file;
		this.maxBytes = maxBytes;
		try {
			mkdirSync(dirname(this.file), { recursive: true });
		} catch {
			// unwritable log location: drop records rather than break routing
		}
	}
	record(r: RouteRecord): void {
		try {
			if (existsSync(this.file) && statSync(this.file).size > this.maxBytes) {
				writeFileSync(this.file, ""); // simple truncate guard against unbounded growth
			}
			appendFileSync(this.file, `${JSON.stringify(r)}\n`);
		} catch {
			// never let telemetry break a route
		}
	}
}

// ---------------------------------------------------------------- wiring

/** Structural subset of the pi APIs used (keeps the wiring fake-able in tests). */
export interface PiLike {
	registerVirtualModel(definition: {
		provider: string;
		id: string;
		name: string;
		thinkingLevels?: readonly string[];
		route(request: unknown, ctx: unknown): Promise<{ model: unknown; thinkingLevel: string }>;
	}): void;
}

interface ModelLike { provider?: string; id?: string }

export interface RouterDeps {
	config: RouterConfig;
	fetchImpl?: typeof fetch;
	log?: RoutingLog;
	now?: () => number;
	warn?: (msg: string) => void;
	info?: (msg: string) => void;
}

interface RouteRequestLike {
	thinkingLevel: string;
	reason: "user" | "continuation" | "retry" | "direct";
	previous?: { model: ModelLike; thinkingLevel?: string };
	failed?: { model: ModelLike; thinkingLevel?: string };
	messages: readonly unknown[];
}

interface RegistryLike {
	find(provider: string, id: string): ModelLike | undefined;
}

function modelId(m: ModelLike | undefined): string {
	return m ? `${m.provider ?? "?"}/${m.id ?? "?"}` : "?/?";
}

export function createRouter(pi: PiLike, deps: RouterDeps): void {
	const { config } = deps;
	const fetchImpl = deps.fetchImpl ?? fetch;
	const log = deps.log ?? new RoutingLog(expand(config.log.file), config.log.maxBytes);
	const now = deps.now ?? (() => Date.now());
	const warn = deps.warn ?? ((msg: string) => console.warn(msg));
	const info = deps.info ?? ((msg: string) => console.log(msg));

	if (!config.enabled) {
		info("[Laya Router] disabled (config or LAYA_MODEL_ROUTER_ENABLED=0); virtual model not registered");
		return;
	}

	const resolveTier = (registry: RegistryLike, tier: "fast" | "heavy"): ModelLike | undefined => {
		const t = config.tiers[tier];
		try {
			return registry.find(t.provider, t.model);
		} catch {
			return undefined;
		}
	};

	pi.registerVirtualModel({
		provider: config.virtualModel.provider,
		id: config.virtualModel.id,
		name: config.virtualModel.name,
		thinkingLevels: ["off", "minimal", "low", "medium", "high", "xhigh", "max"],
		async route(requestRaw: unknown, ctxRaw: unknown) {
			const request = requestRaw as RouteRequestLike;
			const registry = (ctxRaw as { modelRegistry?: RegistryLike })?.modelRegistry;
			if (!registry) throw new Error("[Laya Router] no modelRegistry on route context");

			const base = { thinkingLevel: request.thinkingLevel };
			const sticky = request.previous ?? request.failed;

			// Continuations/retries stay on the model that handled the turn;
			// direct requests (compaction summaries etc.) want the heavy tier.
			if (request.reason === "continuation" && request.previous) {
				log.record({
					ts: now(), event: "route", reason: request.reason, intent: null, confidence: null,
					classifyMs: null, sticky: true, tier: "sticky", model: modelId(request.previous.model), failure: "sticky",
				});
				return { model: request.previous.model, thinkingLevel: request.previous.thinkingLevel ?? base.thinkingLevel };
			}
			if (request.reason === "retry" && request.failed) {
				log.record({
					ts: now(), event: "route", reason: request.reason, intent: null, confidence: null,
					classifyMs: null, sticky: true, tier: "sticky", model: modelId(request.failed.model), failure: "sticky",
				});
				return { model: request.failed.model, thinkingLevel: request.failed.thinkingLevel ?? base.thinkingLevel };
			}

			const record = (e: Omit<RouteRecord, "ts" | "event">): void =>
				log.record({ ts: now(), event: "route", ...e });

			let outcome: ClassifyOutcome | null = null;
			if (request.reason === "user") {
				const text = extractLastUserText(request.messages);
				if (text && !text.startsWith("/")) {
					outcome = await classify(text, config, fetchImpl);
				} else {
					outcome = { intent: null, confidence: null, failure: "skipped", latencyMs: 0 };
				}
			}

			const tier = intentToTier(outcome?.intent ?? null);
			const model =
				resolveTier(registry, tier)
				?? resolveTier(registry, tier === "heavy" ? "fast" : "heavy") // fail-open across tiers
				?? sticky?.model;
			if (!model) {
				// Nothing resolvable: let pi surface the error rather than dispatch blind.
				record({ reason: request.reason, intent: null, confidence: null, classifyMs: null, sticky: false, tier: null, model: "?/?", failure: "unresolvable" });
				throw new Error("[Laya Router] no physical model resolvable for either tier");
			}

			record({
				reason: request.reason,
				intent: outcome?.intent ?? null,
				confidence: outcome?.confidence ?? null,
				classifyMs: outcome?.latencyMs ?? null,
				sticky: request.reason !== "user",
				tier,
				model: modelId(model),
				failure: outcome?.intent ? undefined : (outcome?.failure ?? (request.reason === "user" ? "skipped" : "no-classify")),
			});

			if (request.reason === "user") {
				const label = outcome?.intent
					? `'${outcome.intent}'`
					: `'${outcome?.failure ?? "unclassified"}' (fail-open)`;
				const line = `[Laya Router] Intent: ${label} | Latency: ${outcome?.latencyMs ?? 0}ms | Assigned Tier: ${modelId(model)}`;
				if (outcome?.intent) info(line);
				else warn(line);
			}

			return { model, thinkingLevel: base.thinkingLevel };
		},
	});
}

// ---------------------------------------------------------------- entrypoint

export default function layaModelRouterExtension(pi: ExtensionAPI): void {
	createRouter(pi as unknown as PiLike, { config: resolveConfig() });
}
