/**
 * laya-router — Laya-backed tool-result representation gating for pi.
 *
 * Large tool results are classified once (verbatim / compress / digest) by the
 * local Laya decision service; the verdict is cached digest-keyed and applied
 * per model request via the `context` event. The session record, exports, and
 * compaction still see full outputs. Model routing was removed (spec
 * 2026-09-26): the user's selected model is never changed, and any Laya
 * failure falls back to verbatim. PI_LAYA_DISABLE=1 or `/laya off` disables
 * all gating.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LayaServiceClient, LayaError } from "./client";
import { loadConfig, type LayaRouterConfig } from "./config";
import { RoutingLog, digest } from "./log";
import { VerdictCache, verdictKey, type Verdict } from "./verdict-cache";
import { REPRESENTATION_QUESTIONS, buildGateState, validateVerdict, effectiveVerdict, renderVerdict } from "./supervision-policy";

// Structural subset of the pi APIs this extension uses (keeps tests fake-able;
// the real ExtensionAPI satisfies these shapes). No setModel: the extension
// never changes the selected model.
interface PiLike {
	on(event: string, handler: (event: any, ctx: any) => any): () => void;
	registerCommand(name: string, options: { description: string; handler: (args: string, ctx: any) => any }): void;
	exec(cmd: string, args: string[], opts?: unknown): Promise<{ code: number; stdout: string; stderr: string }>;
}

export interface RouterDeps {
	config: LayaRouterConfig;
	client: Pick<LayaServiceClient, "health" | "predict">;
	log: RoutingLog;
	now?: () => number;
	/** Re-read config with an (already trust-checked) project overlay. Real wiring only. */
	reconfigure?: (projectPath: string | null) => {
		config: LayaRouterConfig;
		client: Pick<LayaServiceClient, "health" | "predict">;
	} | null;
}

/** Built-in tool names only: custom (extension-registered) tools are never gated. */
const BUILTIN_TOOLS: ReadonlySet<string> = new Set([
	"bash",
	"powershell",
	"read",
	"edit",
	"write",
	"grep",
	"find",
	"ls",
]);

/** Concatenate the text parts of a tool-result content array; null if any part is not text. */
function textOf(content: unknown): string | null {
	if (!Array.isArray(content)) return null;
	let out = "";
	for (const part of content) {
		if (!part || typeof part !== "object" || (part as { type?: unknown }).type !== "text") return null;
		const t = (part as { text?: unknown }).text;
		if (typeof t !== "string") return null;
		out += t;
	}
	return out;
}

export function createRouter(pi: PiLike, deps: RouterDeps): void {
	const log = deps.log;
	const now = deps.now ?? (() => Date.now());
	let config = deps.config;
	let client = deps.client;
	let runtimeEnabled: boolean | null = null;
	let taskAnchor = "";

	const gatingEnabled = (): boolean =>
		(runtimeEnabled !== null ? runtimeEnabled : config.enabled) && config.contextSupervision.enabled;

	const cache = new VerdictCache(config.contextSupervision.verdictCacheEntries);

	function record(e: Parameters<RoutingLog["record"]>[0]): void {
		log.record({ ts: now(), consulted: false, ...e });
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
	});

	// Capture the task anchor: the most recent non-extension user input, capped.
	// The input hook never consults Laya and never alters the input.
	pi.on("input", async (event: any, _ctx: any) => {
		const text: string = typeof event?.text === "string" ? event.text : "";
		if (event?.source === "extension" || event?.streamingBehavior !== undefined || text.startsWith("/")) return;
		const max = config.state.maxPromptChars;
		taskAnchor = text.length > max ? text.slice(0, max) : text;
	});

	// Classify one large tool result (spec §4). Advisory only: the handler never
	// mutates the event and always returns undefined; every failure → verbatim.
	pi.on("tool_result", async (event: any, ctx: any) => {
		const toolName: unknown = event?.toolName;
		if (typeof toolName !== "string" || !BUILTIN_TOOLS.has(toolName)) return;
		const text = textOf(event?.content);
		if (text === null || text.length === 0) return; // image parts / empty: verbatim
		const cs = config.contextSupervision;
		const bytesIn = Buffer.byteLength(text, "utf8");
		if (bytesIn <= cs.minBytes) return; // rule 1: never consult for small results
		const promptDigest = digest(taskAnchor);
		if (!gatingEnabled()) {
			record({ kind: "gate", tool: toolName, promptDigest, failure: "disabled" });
			return;
		}
		const key = verdictKey(toolName, text);
		const hit = cache.get(key);
		if (hit) {
			if (hit.verdict === "digest" || hit.verdict === "compress") log.markReRead();
			return;
		}
		const t0 = now();
		const health = await client.health();
		if (!health.ok) {
			record({ kind: "gate", tool: toolName, promptDigest, failure: health.status, totalLatencyMs: now() - t0 });
			return;
		}
		let result;
		try {
			result = await client.predict(
				buildGateState(taskAnchor, toolName, text, config.state.maxPromptChars),
				REPRESENTATION_QUESTIONS as unknown as Record<string, unknown>,
			);
		} catch (e) {
			const failure = e instanceof LayaError ? e.failure : "unreachable";
			record({ kind: "gate", tool: toolName, promptDigest, consulted: true, failure, totalLatencyMs: now() - t0 });
			return;
		}
		const layaAnswer = (result.answers as Record<string, unknown>).representation;
		const verdict = effectiveVerdict(text, validateVerdict(layaAnswer, cs.minConfidence), cs.minBytes, cs.compressHeadChars);
		const confidence =
			typeof (layaAnswer as { confidence?: unknown } | undefined)?.confidence === "number"
				? (layaAnswer as { confidence: number }).confidence
				: 0;
		const bytesOut =
			verdict === "verbatim"
				? bytesIn
				: Buffer.byteLength(renderVerdict(toolName, text, event?.isError === true, verdict, cs.compressHeadChars), "utf8");
		cache.set(key, { verdict, confidence, bytesIn, bytesOut });
		record({
			kind: "gate",
			tool: toolName,
			promptDigest,
			consulted: true,
			verdict,
			confidence,
			bytesIn,
			bytesOut,
			layaLatencyMs: result.latencyMs,
			totalLatencyMs: now() - t0,
		});
		if (config.showStatus && ctx?.hasUI && ctx.ui?.setStatus) {
			ctx.ui.setStatus("laya", `laya:${verdict}`);
		}
		return; // advisory: never alter the tool result
	});

	// ------------------------------------------------------------ commands

	pi.registerCommand("laya", {
		description: "Laya context supervision: status, stats, on/off, test, start",
		handler: async (args: string, ctx: any) => {
			const parts = args.trim().split(/\s+/).filter(Boolean);
			const sub = parts[0] ?? "status";
			const rest = args.trim().slice(sub.length).trim();
			const notify = (m: string) => ctx?.ui?.notify?.(m, "info");

			if (sub === "on" || sub === "off") {
				runtimeEnabled = sub === "on";
				notify(`laya supervision ${sub} (runtime override; config file unchanged)`);
				return;
			}
			if (sub === "start") {
				const r = await pi.exec("systemctl", ["--user", "start", "laya.service"]);
				notify(r.code === 0 ? "laya.service start issued" : `systemctl failed (${r.code}): ${r.stderr.trim()}`);
				return;
			}
			if (sub === "test") {
				if (!rest) {
					notify("usage: /laya test <pasted tool output>");
					return;
				}
				notify("laya test: not wired yet");
				return;
			}
			if (sub === "stats") {
				const s = log.snapshot();
				notify(
					`gated=${s.gated} verbatim=${s.verbatim} compress=${s.compress} digest=${s.digest} ` +
						`reclaimedBytes=${s.reclaimedBytes} reReadAfterDigest=${s.reReadAfterDigest} ` +
						`failures=${s.failures} disabledSkips=${s.disabledSkips}`,
				);
				return;
			}
			// status (default)
			const health = await client.health(true).catch(() => null);
			const s = log.snapshot();
			notify(
				`laya: ${health?.ok ? `ready (${health.layaVersion ?? "?"})` : `unavailable (${health?.status ?? "error"})`}\n` +
					`supervision: ${gatingEnabled() ? "enabled" : "disabled"}\n` +
					`thresholds: minBytes=${config.contextSupervision.minBytes} ` +
					`minConfidence=${config.contextSupervision.minConfidence} ` +
					`headChars=${config.contextSupervision.compressHeadChars}\n` +
					`gated=${s.gated} verbatim=${s.verbatim} compress=${s.compress} digest=${s.digest} ` +
					`reclaimedBytes=${s.reclaimedBytes}`,
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
