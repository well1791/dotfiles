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
		contextSupervision: {
			enabled: true,
			minBytes: 2048,
			minConfidence: 0.7,
			compressHeadChars: 1500,
			verdictCacheEntries: 200,
		},
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
	const file = JSON.stringify({ contextSupervision: { minBytes: 4096, minConfidence: 0.8 } });
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.contextSupervision.minBytes).toBe(4096);
	expect(r.config.contextSupervision.minConfidence).toBe(0.8);
	expect(r.config.contextSupervision.compressHeadChars).toBe(1500);
	expect(r.config.contextSupervision.verdictCacheEntries).toBe(200);
	expect(r.config.timeoutMs).toBe(5000);
});

test("project file overrides global", () => {
	const global = JSON.stringify({ contextSupervision: { minConfidence: 0.8 }, enabled: false });
	const project = JSON.stringify({ contextSupervision: { minConfidence: 0.6 } });
	const r = loadConfig(env(), (p) => (p === "/g" ? global : p === "/p" ? project : null), "/g", "/p");
	expect(r.config.contextSupervision.minConfidence).toBe(0.6);
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
	const file = JSON.stringify({ timeoutMs: -3, enabled: 42, baseUrl: "ftp://x", showStatus: "no" });
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.timeoutMs).toBe(5000);
	expect(r.config.enabled).toBe(true);
	expect(r.config.baseUrl).toBe("http://127.0.0.1:8082");
	expect(r.config.showStatus).toBe(true);
	expect(r.warnings.length).toBe(4);
});

test("invalid contextSupervision values fall back to defaults with warnings", () => {
	const file = JSON.stringify({
		contextSupervision: {
			enabled: "yes",
			minBytes: 0,
			minConfidence: 2,
			compressHeadChars: "x",
			verdictCacheEntries: -1,
		},
	});
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config.contextSupervision).toEqual(DEFAULT_CONFIG.contextSupervision);
	expect(r.warnings.length).toBe(5);
});

test("stale routing keys produce one deprecation warning each and are ignored", () => {
	const file = JSON.stringify({
		routes: { small: "zai/glm-5.3-flash" },
		signals: { coding: 0.9 },
		escalate: { sensitive: false },
		minConfidence: 0.9,
		smallRouteMaxContextTokens: 100,
		layaOnly: { enabled: false },
	});
	const r = loadConfig(env(), (p) => (p === "/g" ? file : null), "/g", null);
	expect(r.config).toEqual(DEFAULT_CONFIG);
	const stale = ["routes", "signals", "escalate", "minConfidence", "smallRouteMaxContextTokens", "layaOnly"];
	for (const k of stale) expect(r.warnings).toContain(`"${k}" is no longer used; routing was removed`);
	expect(r.warnings.length).toBe(6);
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
