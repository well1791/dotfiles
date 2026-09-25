import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LayaError, type LayaHealth, type LayaPredictResult } from "./client";
import { DEFAULT_CONFIG, type LayaRouterConfig } from "./config";
import { RoutingLog } from "./log";
import { createRouter, type RouterDeps } from "./index";

// ----------------------------------------------------------------- fakes

class FakeClient {
	healthOk = true;
	healthStatus = "ready";
	predictImpl: (state: unknown, questions: Record<string, unknown>) => LayaPredictResult = () => {
		throw new LayaError("unreachable", "not configured");
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
	entries: { customType: string; data?: unknown }[] = [];
	setModelCalls: any[] = [];
	execCalls: { cmd: string; args: string[] }[] = [];
	model: any = { provider: "zai", id: "glm-5.3" };

	on(ev: string, h: (e: any, ctx: any) => any) {
		this.handlers.set(ev, h);
		return () => {};
	}
	registerCommand(name: string, opts: { handler: (args: string, ctx: any) => any }) {
		this.commands.set(name, opts as any);
	}
	registerEntryRenderer() {}
	appendEntry(customType: string, data?: unknown) {
		this.entries.push({ customType, data });
	}
	async setModel(model: any) {
		this.setModelCalls.push(model);
		this.model = model;
		// Real pi emits model_select from inside setModel while the caller awaits.
		await this.handlers.get("model_select")?.({ model, previousModel: this.model, source: "set" }, makeCtx());
		return true;
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
		model: { provider: "zai", id: "glm-5.3" },
		modelRegistry: {
			find: (p: string, id: string) => (p === "missing" ? undefined : { provider: p, id }),
		},
		sessionManager: { getEntries: () => [] as any[] },
		getContextUsage: () => ({ tokens: 1000 }),
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

function setup(over: Record<string, unknown> = {}, argv: string[] = []) {
	const pi = new FakePi();
	const client = new FakeClient();
	const dir = mkdtempSync(join(tmpdir(), "laya-idx-"));
	const log = new RoutingLog(join(dir, "r.jsonl"), () => 1);
	const deps: RouterDeps = { config: cfg(over), client, log, argv, now: () => 1 };
	createRouter(pi as any, deps);
	return { pi, client, log, ctx: makeCtx(), deps, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function noul(v: number, confidence = 0.9): { type: "noul"; noul: number; confidence: number } {
	return { type: "noul", noul: v, confidence };
}

function smallAnswer(conf = 0.95): LayaPredictResult {
	return {
		answers: {
			trivial: noul(0.9, conf),
			coding: noul(0.05),
			decision: noul(0.1),
			sensitive: noul(0.03),
		},
		latencyMs: 100,
	};
}

function frontierAnswer(conf = 0.95): LayaPredictResult {
	return {
		answers: {
			trivial: noul(0.0),
			coding: noul(0.8, conf),
			decision: noul(0.1),
			sensitive: noul(0.03),
		},
		latencyMs: 100,
	};
}

function layaAnswer(conf = 0.9): LayaPredictResult {
	return {
		answers: {
			trivial: noul(0.1),
			coding: noul(0.3),
			decision: noul(0.85, conf),
			sensitive: noul(0.0),
		},
		latencyMs: 100,
	};
}

const INPUT = (text: string, over: Record<string, unknown> = {}) => ({ text, source: "interactive", ...over });

// ----------------------------------------------------------------- tests

test("trusted project overlay is honored at session_start", async () => {
	const pi = new FakePi();
	const client = new FakeClient();
	const dir = mkdtempSync(join(tmpdir(), "laya-idx-"));
	const log = new RoutingLog(join(dir, "r.jsonl"), () => 1);
	const projectCfg = cfg({ routes: { laya: null, small: "llamacpp/minicpm5-2b", frontier: null } });
	const deps: RouterDeps = {
		config: cfg(),
		client,
		log,
		reconfigure: (p) => (p ? { config: projectCfg, client } : null),
	};
	createRouter(pi as any, deps);
	const ctx = makeCtx({ isProjectTrusted: () => true });
	await pi.emit("session_start", { reason: "startup" }, ctx);
	client.predictImpl = () => smallAnswer();
	await pi.emit("input", INPUT("hi"), ctx);
	await pi.emit("before_agent_start", { prompt: "hi" }, ctx);
	expect(pi.setModelCalls.at(-1)).toEqual({ provider: "llamacpp", id: "minicpm5-2b" });
	rmSync(dir, { recursive: true, force: true });
});

test("untrusted project overlay is ignored", async () => {
	const s = setup();
	(s.deps as RouterDeps).reconfigure = (p) => (p ? { config: cfg({ routes: { laya: null, small: "llamacpp/minicpm5-2b", frontier: null } }), client: s.client } : null);
	const ctx = makeCtx({ isProjectTrusted: () => false });
	await s.pi.emit("session_start", { reason: "startup" }, ctx);
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hi"), ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, ctx);
	expect(s.pi.setModelCalls.at(-1)).toEqual({ provider: "zai", id: "glm-5.3-flash" });
	s.cleanup();
});

test("disabled config: input skips consult, logs disabled skip", async () => {
	const s = setup({ enabled: false });
	const r = await s.pi.emit("input", INPUT("hello"), s.ctx);
	expect(r).toEqual({ action: "continue" });
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().disabledSkips).toBe(1);
	s.cleanup();
});

test("explicit model_select pins the session; later prompts skip routing", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("model_select", { model: { provider: "x", id: "y" }, source: "set" }, s.ctx);
	const r = await s.pi.emit("input", INPUT("hello"), s.ctx);
	expect(r).toEqual({ action: "continue" });
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().pinnedSkips).toBe(1);
	s.cleanup();
});

test("--model in argv pins from load", async () => {
	const s = setup({}, ["--model", "zai/glm-5.3"]);
	const r = await s.pi.emit("input", INPUT("hello"), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.snapshot().pinnedSkips).toBe(1);
	s.cleanup();
});

test("self-initiated setModel does not pin; next prompt still routes", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hello"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hello" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(1); // routed to small
	s.client.predictImpl = () => frontierAnswer();
	const r = await s.pi.emit("input", INPUT("hello again"), s.ctx);
	expect(r).toEqual({ action: "continue" });
	expect(s.client.predictCalls.length).toBe(2); // not pinned — consulted again (cache reused for bas)
	s.cleanup();
});

test("small route switches to routes.small and sets footer status", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(1);
	expect(s.pi.setModelCalls[0]).toEqual({ provider: "zai", id: "glm-5.3-flash" });
	expect(s.ctx.ui.status.some(([k, v]) => k === "laya" && v.includes("small"))).toBe(true);
	const e = s.log.recent(1)[0];
	expect(e.route).toBe("small");
	expect(e.model).toBe("zai/glm-5.3-flash");
	expect(e.confidence).toBe(0.95);
	s.cleanup();
});

test("frontier with null route restores the base model captured at session_start", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("session_start", { reason: "startup" }, s.ctx); // base = glm-5.3
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx); // -> flash
	expect(s.pi.model.id).toBe("glm-5.3-flash");
	s.client.predictImpl = () => frontierAnswer();
	await s.pi.emit("input", INPUT("hard task"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hard task" }, makeCtx({ model: s.pi.model }));
	expect(s.pi.setModelCalls.at(-1)).toEqual({ provider: "zai", id: "glm-5.3" }); // base restored
	s.cleanup();
});

test("resume onto the small model restores baseModel from the session entry", async () => {
	const s = setup();
	const ctx = makeCtx({
		model: { provider: "zai", id: "glm-5.3-flash" },
		sessionManager: {
			getEntries: () => [{ type: "custom", customType: "laya-base-model", data: { provider: "zai", id: "glm-5.3" } }],
		},
	});
	await s.pi.emit("session_start", { reason: "resume" }, ctx);
	s.client.predictImpl = () => frontierAnswer();
	await s.pi.emit("input", INPUT("hard"), ctx);
	await s.pi.emit("before_agent_start", { prompt: "hard" }, ctx);
	expect(s.pi.setModelCalls.at(-1)).toEqual({ provider: "zai", id: "glm-5.3" });
	s.cleanup();
});

test("route target missing from registry: no switch, target-unavailable logged", async () => {
	const s = setup({ routes: { laya: null, small: "missing/missing-model", frontier: null } });
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(0);
	const e = s.log.recent(1)[0];
	expect(e.route).toBe("fallback");
	expect(e.failure).toBe("target-unavailable");
	s.cleanup();
});

test("predict failure after healthy cache: fallback, no switch, no retry", async () => {
	const s = setup();
	s.client.healthOk = true;
	s.client.predictImpl = () => {
		throw new LayaError("timeout", "laya request timed out");
	};
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(0);
	const e = s.log.recent(2).find((x) => x.failure);
	expect(e?.failure).toBe("timeout");
	expect(e?.route).toBe("fallback");
	s.cleanup();
});

test("unhealthy service: fallback without predict", async () => {
	const s = setup();
	s.client.healthOk = false;
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.recent(1)[0].route).toBe("fallback");
	s.cleanup();
});

test("print mode: Mode A skipped, routing still switches models, no UI calls", async () => {
	const s = setup();
	const ctx = makeCtx({ mode: "print", hasUI: false });
	s.client.predictImpl = () => layaAnswer();
	const r = await s.pi.emit("input", INPUT("Is the CI gate red right now?"), ctx);
	expect(r).toEqual({ action: "continue" }); // NOT handled in print mode
	expect(ctx.ui.notified.length).toBe(0);
	await s.pi.emit("before_agent_start", { prompt: "Is the CI gate red right now?" }, ctx);
	expect(s.pi.setModelCalls.length).toBe(1); // laya missed → small
	expect(s.pi.setModelCalls[0].id).toBe("glm-5.3-flash");
	expect(ctx.ui.status.length).toBe(0);
	s.cleanup();
});

test("steering messages (mid-run) are not routed at the input hook", async () => {
	const s = setup();
	const r = await s.pi.emit("input", INPUT("steer this", { streamingBehavior: "steer" }), s.ctx);
	expect(r).toEqual({ action: "continue" });
	expect(s.client.predictCalls.length).toBe(0);
	s.cleanup();
});

test("slash-prefixed input passes through silently", async () => {
	const s = setup();
	const r = await s.pi.emit("input", INPUT("/skill:foo"), s.ctx);
	expect(r).toEqual({ action: "continue" });
	expect(s.client.predictCalls.length).toBe(0);
	expect(s.log.recent(1).length).toBe(0);
	s.cleanup();
});

test("decision cache is reused: one consult across input + before_agent_start", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	expect(s.pi.setModelCalls.length).toBe(1);
	s.cleanup();
});

test("cache miss (skill-expanded prompt) consults fresh in before_agent_start", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("/do-thing"), s.ctx); // skipped at input
	await s.pi.emit("before_agent_start", { prompt: "expanded skill content" }, s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	expect(s.pi.setModelCalls.length).toBe(1);
	s.cleanup();
});

test("Mode A: laya route answers at laya, no model call, entry appended", async () => {
	const s = setup();
	s.client.predictImpl = (state, questions) => {
		if ("answer" in questions) {
			return {
				answers: { answer: { type: "noul", noul: 0.91, confidence: 0.91 } },
				latencyMs: 50,
			};
		}
		return layaAnswer();
	};
	const r = await s.pi.emit("input", INPUT("Is the CI gate red right now?"), s.ctx);
	expect(r).toEqual({ action: "handled" });
	expect(s.pi.setModelCalls.length).toBe(0);
	expect(s.pi.entries.some((e) => e.customType === "laya-answer")).toBe(true);
	expect(s.ctx.ui.notified.some((m) => m.includes("yes"))).toBe(true);
	const e = s.log.recent(1)[0];
	expect(e.route).toBe("laya");
	expect(e.model).toBe("laya");
	s.cleanup();
});

test("Mode A: low-confidence ANSWER aborts to the small route", async () => {
	const s = setup();
	s.client.predictImpl = (state, questions) => {
		if ("answer" in questions) {
			return {
				answers: { answer: { type: "choice", choice: "jest", confidence: 0.21, probabilities: {} } },
				latencyMs: 50,
			};
		}
		return layaAnswer();
	};
	const r = await s.pi.emit("input", INPUT("Use jest or vitest for this repo?"), s.ctx);
	expect(r).toEqual({ action: "continue" }); // handled aborted — answer untrustworthy
	expect(s.pi.entries.filter((e) => e.customType === "laya-answer")).toEqual([]);
	await s.pi.emit("before_agent_start", { prompt: "Use jest or vitest for this repo?" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(1);
	expect(s.pi.setModelCalls[0].id).toBe("glm-5.3-flash");
	s.cleanup();
});

test("Mode A answer failure falls back to the small route", async () => {
	const s = setup();
	s.client.predictImpl = (state, questions) => {
		if ("answer" in questions) throw new LayaError("http", "laya 500: boom", 500);
		return layaAnswer();
	};
	const r = await s.pi.emit("input", INPUT("Is the CI gate red right now?"), s.ctx);
	expect(r).toEqual({ action: "continue" }); // handled abandoned
	await s.pi.emit("before_agent_start", { prompt: "Is the CI gate red right now?" }, s.ctx);
	expect(s.pi.setModelCalls.length).toBe(1);
	expect(s.pi.setModelCalls[0].id).toBe("glm-5.3-flash");
	expect(s.log.recent(5).some((e) => e.failure === "laya-only-failed")).toBe(true);
	s.cleanup();
});

test("context guard escalates small to frontier on big contexts", async () => {
	const s = setup();
	await s.pi.emit("session_start", { reason: "startup" }, s.ctx); // base = glm-5.3
	s.client.predictImpl = () => smallAnswer();
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	await s.pi.emit("before_agent_start", { prompt: "hi" }, s.ctx); // -> flash
	expect(s.pi.model.id).toBe("glm-5.3-flash");
	const bigCtx = makeCtx({ getContextUsage: () => ({ tokens: 30000 }), model: { ...s.pi.model } });
	await s.pi.emit("input", INPUT("hi again"), bigCtx);
	await s.pi.emit("before_agent_start", { prompt: "hi again" }, bigCtx);
	expect(s.pi.setModelCalls.at(-1)).toEqual({ provider: "zai", id: "glm-5.3" }); // frontier = base
	const e = s.log.recent(1)[0];
	expect(e.route).toBe("frontier");
	expect(e.reason).toBe("context-guard");
	s.cleanup();
});

test("/laya off disables routing at runtime; /laya on re-enables", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.commands.get("laya")!.handler("off", s.ctx);
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	expect(s.client.predictCalls.length).toBe(0);
	await s.pi.commands.get("laya")!.handler("on", s.ctx);
	await s.pi.emit("input", INPUT("hi"), s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	s.cleanup();
});

test("/laya test consults and reports the decision", async () => {
	const s = setup();
	s.client.predictImpl = () => smallAnswer();
	await s.pi.commands.get("laya")!.handler("test what model for this?", s.ctx);
	expect(s.client.predictCalls.length).toBe(1);
	expect(s.ctx.ui.notified.some((m) => m.includes("small"))).toBe(true);
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
	s.cleanup();
});
