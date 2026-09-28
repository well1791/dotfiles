import { test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LayaHealth, LayaPredictResult } from "./client";
import { DEFAULT_CONFIG, type LayaRouterConfig } from "./config";
import { RoutingLog } from "./log";
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
