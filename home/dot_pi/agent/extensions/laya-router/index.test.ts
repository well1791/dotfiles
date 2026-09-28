import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LayaError, type LayaHealth, type LayaPredictResult } from "./client";
import { DEFAULT_CONFIG, type LayaRouterConfig } from "./config";
import { RoutingLog } from "./log";
import { verdictKey } from "./verdict-cache";
import { createRouter, type RouterDeps } from "./index";

// ----------------------------------------------------------------- fakes

class FakeClient {
	healthOk = true;
	healthStatus = "ready";
	predictImpl: (state: unknown, questions: Record<string, unknown>) => LayaPredictResult = () => {
		throw new Error("not configured");
	};
	predictCalls: { state: unknown; questions: Record<string, unknown> }[] = [];
	async health(_force = false): Promise<LayaHealth> {
		return {
			ok: this.healthOk,
			status: this.healthOk ? this.healthStatus : "unreachable",
			cached: false,
		};
	}
	async predict(state: unknown, questions: Record<string, unknown>): Promise<LayaPredictResult> {
		this.predictCalls.push({ state, questions });
		return this.predictImpl(state, questions);
	}
}

class FakePi {
	handlers = new Map<string, (e: any, ctx: any) => any>();
	commands = new Map<string, { description?: string; handler: (args: string, ctx: any) => any }>();
	execCalls: { cmd: string; args: string[] }[] = [];
	on(ev: string, h: (e: any, ctx: any) => any) {
		this.handlers.set(ev, h);
		return () => {};
	}
	registerCommand(name: string, opts: { handler: (args: string, ctx: any) => any }) {
		this.commands.set(name, opts as any);
	}
	async exec(cmd: string, args: string[]) {
		this.execCalls.push({ cmd, args });
		return { code: 0, stdout: "ok", stderr: "" };
	}
	async emit(ev: string, event: any, ctx: any) {
		return this.handlers.get(ev)?.(event, ctx);
	}
}

function makeCtx(over: Record<string, unknown> = {}) {
	return {
		mode: "tui",
		hasUI: true,
		cwd: "/home/u/demo",
		isProjectTrusted: () => false,
		ui: {
			notified: [] as string[],
			status: [] as [string, string][],
			notify(m: string) {
				this.notified.push(m);
			},
			setStatus(k: string, v: string) {
				this.status.push([k, v]);
			},
		},
		...over,
	};
}

function cfg(over: Record<string, unknown> = {}): LayaRouterConfig {
	return { ...structuredClone(DEFAULT_CONFIG), ...over } as LayaRouterConfig;
}

function setup(over: Record<string, unknown> = {}) {
	const pi = new FakePi();
	const client = new FakeClient();
	const dir = mkdtempSync(join(tmpdir(), "laya-idx-"));
	const log = new RoutingLog(join(dir, "r.jsonl"), () => 1);
	const deps: RouterDeps = { config: cfg(over), client, log, now: () => 1 };
	createRouter(pi as any, deps);
	return { pi, client, log, ctx: makeCtx(), deps, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const INPUT = (text: string, over: Record<string, unknown> = {}) => ({ text, source: "interactive", ...over });

// ----------------------------------------------------------------- classification

const BIG = "L".repeat(3000); // > minBytes 2048

function TR(text: string, over: Record<string, unknown> = {}) {
	return {
		type: "tool_result",
		toolName: "bash",
		toolCallId: "tc-1",
		input: { command: "ls" },
		content: [{ type: "text", text }],
		isError: false,
		...over,
	};
}

function answer(choice: string, confidence: number): LayaPredictResult {
	return { answers: { representation: { type: "choice", choice, confidence } }, latencyMs: 100 };
}

test("small result (≤ minBytes) is not classified: no predict, no cache entry, no log", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("task"), s.ctx);
	await s.pi.emit("tool_result", TR("x".repeat(2048)), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().gated).toBe(0);
	s.cleanup();
});

test("large result is classified once with spec state and question; verdict cached; gate event recorded", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("fix the build"), s.ctx);
	s.client.predictImpl = () => answer("digest", 0.9);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	const call = s.client.predictCalls[0];
	expect(call.questions).toHaveProperty("representation");
	expect(call.state).toEqual({ task: "fix the build", tool: "bash", output: BIG });
	const e = s.log.recent(1)[0];
	expect(e.kind).toBe("gate");
	expect(e.tool).toBe("bash");
	expect(e.verdict).toBe("digest");
	expect(e.bytesIn).toBe(3000);
	expect(e.consulted).toBe(true);
	expect(typeof e.bytesOut).toBe("number");
	expect(e.bytesOut!).toBeLessThan(e.bytesIn!);
	expect(s.ctx.ui.status.some(([k, v]) => k === "laya" && v.includes("digest"))).toBe(true);
	s.cleanup();
});

test("duplicate identical result is a cache hit: one predict, re-read counted for digest", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("t"), s.ctx);
	s.client.predictImpl = () => answer("digest", 0.9);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	expect(s.log.snapshot().reReadAfterDigest).toBe(1);
	s.cleanup();
});

test("unhealthy service: no predict, gate failure recorded, verbatim", async () => {
	const s = setup();
	s.client.healthOk = false;
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	const e = s.log.recent(1)[0];
	expect(e.failure).toBe("unreachable");
	expect(e.kind).toBe("gate");
	s.cleanup();
});

test("predict timeout: single attempt per event, gate failure recorded", async () => {
	const s = setup();
	s.client.predictImpl = () => {
		throw new LayaError("timeout", "laya request timed out");
	};
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(s.client.predictCalls.length).toBe(1); // no retry within the event
	expect(s.log.recent(1)[0].failure).toBe("timeout");
	s.cleanup();
});

test("low-confidence answer resolves to verbatim and stores a verbatim entry", async () => {
	const s = setup();
	s.client.predictImpl = () => answer("digest", 0.5);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	const e = s.log.recent(1)[0];
	expect(e.verdict).toBe("verbatim");
	expect(e.bytesOut).toBe(e.bytesIn);
	s.cleanup();
});

test("disabled config: no predict for large results, disabled skip logged", async () => {
	const s = setup({ enabled: false });
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().disabledSkips).toBe(1);
	s.cleanup();
});

test("/laya off mid-session: no predict even with warm cache", async () => {
	const s = setup();
	s.client.predictImpl = () => answer("compress", 0.9);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	await s.pi.commands.get("laya")!.handler("off", s.ctx);
	await s.pi.emit("tool_result", TR(BIG + "2"), s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	expect(s.log.recent(1)[0].failure).toBe("disabled");
	s.cleanup();
});

test("image-bearing content is never gated", async () => {
	const s = setup();
	await s.pi.emit(
		"tool_result",
		TR(BIG, { content: [{ type: "image", data: "..." }, { type: "text", text: BIG }] }),
		s.ctx,
	);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().gated).toBe(0);
	s.cleanup();
});

test("custom or unknown toolName is never gated", async () => {
	const s = setup();
	await s.pi.emit("tool_result", TR(BIG, { toolName: "my-extension-tool" }), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().gated).toBe(0);
	s.cleanup();
});

test("empty text is skipped silently", async () => {
	const s = setup();
	await s.pi.emit("tool_result", TR(""), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().gated).toBe(0);
	s.cleanup();
});

test("anchor passed to laya is the latest user input, capped at maxPromptChars", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("A".repeat(5000)), s.ctx);
	s.client.predictImpl = () => answer("digest", 0.9);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect((s.client.predictCalls[0].state as { task: string }).task).toHaveLength(4000);
	s.cleanup();
});

test("extension-generated input does not update the anchor", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("real task"), s.ctx);
	await s.pi.emit("input", INPUT("injected"), s.ctx);
	s.client.predictImpl = () => answer("digest", 0.9);
	await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect((s.client.predictCalls[0].state as { task: string }).task).toBe("real task");
	s.cleanup();
});

test("tool_result handler returns undefined: the result itself is never mutated", async () => {
	const s = setup();
	s.client.predictImpl = () => answer("digest", 0.9);
	const r = await s.pi.emit("tool_result", TR(BIG), s.ctx);
	expect(r).toBeUndefined();
	s.cleanup();
});

// ----------------------------------------------------------------- routing removal

test("no routing handlers are registered: before_agent_start and model_select absent", () => {
	const s = setup();
	expect(s.pi.handlers.has("before_agent_start")).toBe(false);
	expect(s.pi.handlers.has("model_select")).toBe(false);
	s.cleanup();
});

test("model_select event is inert: no handlers, nothing recorded", async () => {
	const s = setup();
	await s.pi.emit("model_select", { model: { provider: "x", id: "y" }, source: "set" }, s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().failures).toBe(0);
	s.cleanup();
});

test("plain input is captured as the task anchor without consulting laya", async () => {
	const s = setup();
	const r = await s.pi.emit("input", INPUT("fix the failing build"), s.ctx);
	expect(r).toBeUndefined();
	expect(s.client.predictCalls.length).toBe(0);
	s.cleanup();
});

test("slash, extension, and steering inputs are ignored", async () => {
	const s = setup();
	await s.pi.emit("input", INPUT("/skill:foo"), s.ctx);
	await s.pi.emit("input", INPUT("ext", { source: "extension" }), s.ctx);
	await s.pi.emit("input", INPUT("steer", { streamingBehavior: "steer" }), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	s.cleanup();
});

test("trusted project overlay is honored at session_start", async () => {
	const pi = new FakePi();
	const client = new FakeClient();
	const dir = mkdtempSync(join(tmpdir(), "laya-idx-"));
	const log = new RoutingLog(join(dir, "r.jsonl"), () => 1);
	const projectCfg = cfg({ contextSupervision: { ...DEFAULT_CONFIG.contextSupervision, minBytes: 9999 } });
	const deps: RouterDeps = {
		config: cfg(),
		client,
		log,
		reconfigure: (p) => (p ? { config: projectCfg, client } : null),
	};
	createRouter(pi as any, deps);
	const ctx = makeCtx({ isProjectTrusted: () => true });
	await pi.emit("session_start", { reason: "startup" }, ctx);
	await pi.commands.get("laya")!.handler("status", ctx);
	expect(ctx.ui.notified.some((m) => m.includes("minBytes=9999"))).toBe(true);
	rmSync(dir, { recursive: true, force: true });
});

test("untrusted project overlay is ignored", async () => {
	const s = setup();
	(s.deps as RouterDeps).reconfigure = (p) =>
		p ? { config: cfg({ contextSupervision: { ...DEFAULT_CONFIG.contextSupervision, minBytes: 9999 } }), client: s.client } : null;
	const ctx = makeCtx({ isProjectTrusted: () => false });
	await s.pi.emit("session_start", { reason: "startup" }, ctx);
	await s.pi.commands.get("laya")!.handler("status", ctx);
	expect(ctx.ui.notified.some((m) => m.includes("minBytes=2048"))).toBe(true);
	s.cleanup();
});

test("config enabled:false disables supervision", async () => {
	const s = setup({ enabled: false });
	await s.pi.commands.get("laya")!.handler("status", s.ctx);
	expect(s.ctx.ui.notified.some((m) => m.includes("supervision: disabled"))).toBe(true);
	s.cleanup();
});

test("contextSupervision.enabled:false disables supervision", async () => {
	const s = setup({ contextSupervision: { ...DEFAULT_CONFIG.contextSupervision, enabled: false } });
	await s.pi.commands.get("laya")!.handler("status", s.ctx);
	expect(s.ctx.ui.notified.some((m) => m.includes("supervision: disabled"))).toBe(true);
	s.cleanup();
});

test("/laya off disables supervision at runtime; /laya on re-enables", async () => {
	const s = setup();
	await s.pi.commands.get("laya")!.handler("off", s.ctx);
	await s.pi.commands.get("laya")!.handler("status", s.ctx);
	expect(s.ctx.ui.notified.some((m) => m.includes("supervision: disabled"))).toBe(true);
	await s.pi.commands.get("laya")!.handler("on", s.ctx);
	await s.pi.commands.get("laya")!.handler("status", s.ctx);
	expect(s.ctx.ui.notified.some((m) => m.includes("supervision: enabled"))).toBe(true);
	s.cleanup();
});

test("/laya start runs systemctl explicitly", async () => {
	const s = setup();
	await s.pi.commands.get("laya")!.handler("start", s.ctx);
	expect(s.pi.execCalls).toEqual([{ cmd: "systemctl", args: ["--user", "start", "laya.service"] }]);
	s.cleanup();
});

test("/laya status reports health and counters", async () => {
	const s = setup();
	await s.pi.commands.get("laya")!.handler("", s.ctx);
	expect(s.ctx.ui.notified.some((m) => m.includes("ready"))).toBe(true);
	expect(s.ctx.ui.notified.some((m) => m.includes("gated="))).toBe(true);
	s.cleanup();
});

test("/laya stats reports the gate counters", async () => {
	const s = setup();
	await s.pi.commands.get("laya")!.handler("stats", s.ctx);
	const m = s.ctx.ui.notified[0];
	expect(m).toContain("gated=0");
	expect(m).toContain("reclaimedBytes=0");
	expect(m).toContain("reReadAfterDigest=0");
	s.cleanup();
});
