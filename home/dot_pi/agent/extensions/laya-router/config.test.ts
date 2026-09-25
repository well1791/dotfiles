import { test, expect } from "bun:test";
import { DEFAULT_CONFIG, loadConfig } from "./config";

const noFile = () => null;

function env(over: Record<string, string> = {}): NodeJS.ProcessEnv {
	return { ...over } as NodeJS.ProcessEnv;
}

test("defaults are exact", () => {
	expect(DEFAULT_CONFIG).toEqual({
		enabled: true,
		baseUrl: "http://127.0.0.1:8082",
		timeoutMs: 5000,
		healthTimeoutMs: 1500,
		healthCacheMs: { ready: 60000, failed: 30000 },
		minConfidence: 0.7,
		escalate: { sensitive: true },
		signals: { coding: 0.5, decision: 0.75, trivial: 0.6, sensitive: 0.5 },
		routes: { laya: null, small: "zai/glm-5.3-flash", frontier: null },
		layaOnly: { enabled: true, minConfidence: 0.8 },
		smallRouteMaxContextTokens: 24000,
		state: { maxPromptChars: 4000 },
		showStatus: true,
		log: { file: "~/.local/share/pi-laya/routing.jsonl" },
	});
});

test("missing files yield defaults without warnings", () => {
	const r = loadConfig(env(), noFile, "/global/laya.json", "/project/.pi/laya.json");
	expect(r.config).toEqual(DEFAULT_CONFIG);
	expect(r.warnings).toEqual([]);
});

test("global file deep-merges over defaults", () => {
	const file = JSON.stringify({ minConfidence: 0.8, routes: { small: "llamacpp/minicpm5-2b" } });
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.minConfidence).toBe(0.8);
	expect(r.config.routes.small).toBe("llamacpp/minicpm5-2b");
	expect(r.config.routes.frontier).toBe(null);
	expect(r.config.layaOnly.minConfidence).toBe(0.8);
	expect(r.config.timeoutMs).toBe(5000);
});

test("project file overrides global", () => {
	const global = JSON.stringify({ minConfidence: 0.8, enabled: false });
	const project = JSON.stringify({ minConfidence: 0.6 });
	const r = loadConfig(env(), (p) => (p === "/g" ? global : p === "/p" ? project : null), "/g", "/p");
	expect(r.config.minConfidence).toBe(0.6);
	expect(r.config.enabled).toBe(false);
});

test("PI_LAYA_DISABLE=1 forces enabled false even when files say true", () => {
	const file = JSON.stringify({ enabled: true });
	const r = loadConfig(env({ PI_LAYA_DISABLE: "1" }), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.enabled).toBe(false);
	const r2 = loadConfig(env({ PI_LAYA_DISABLE: "true" }), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r2.config.enabled).toBe(false);
});

test("invalid scalar types fall back to defaults with a warning", () => {
	const file = JSON.stringify({ minConfidence: "abc", timeoutMs: -3, routes: "nope", enabled: 42 });
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.minConfidence).toBe(0.7);
	expect(r.config.timeoutMs).toBe(5000);
	expect(r.config.routes.small).toBe("zai/glm-5.3-flash");
	expect(r.config.enabled).toBe(true);
	expect(r.warnings.length).toBe(4);
});

test("unparseable JSON yields defaults with a warning and no throw", () => {
	const r = loadConfig(env(), (p) => (p === "/g" ? "{not json" : null), "/g", null);
	expect(r.config).toEqual(DEFAULT_CONFIG);
	expect(r.warnings.length).toBe(1);
	expect(r.warnings[0]).toContain("parse");
});

test("returned config is frozen", () => {
	const r = loadConfig(env(), noFile, "/g", null);
	expect(Object.isFrozen(r.config)).toBe(true);
});
