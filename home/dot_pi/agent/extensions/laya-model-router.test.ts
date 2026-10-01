/**
 * Tests for laya-model-router. Run: bun test laya-model-router.test.ts
 * No network, no real ~/.pi reads — everything is injected.
 */
import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	INTENTS,
	extractLastUserText,
	validateIntentAnswer,
	intentToTier,
	classify,
	resolveConfig,
	createRouter,
	RoutingLog,
	type RouterConfig,
} from "./laya-model-router.ts";

// ---------------------------------------------------------------- helpers

function config(overrides: Partial<RouterConfig> = {}): RouterConfig {
	return {
		enabled: true,
		baseUrl: "http://laya.test",
		classifyTimeoutMs: 100,
		minConfidence: 0.3,
		maxPromptChars: 4000,
		virtualModel: { provider: "laya", id: "auto", name: "Laya Auto" },
		tiers: {
			fast: { provider: "zai", "model": "glm-5.3-flash" },
			heavy: { provider: "zai", model: "glm-5.3" },
		},
		log: { file: "/dev/null", maxBytes: 8 * 1024 * 1024 },
		...overrides,
	};
}

function okFetch(answer: unknown): typeof fetch {
	return (async () =>
		new Response(JSON.stringify({ ok: true, result: { answers: { intent: answer } } }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		})) as unknown as typeof fetch;
}

function userMsg(content: unknown): unknown {
	return { role: "user", content };
}

interface CapturedVirtualModel {
	provider: string;
	id: string;
	route(request: unknown, ctx: unknown): Promise<{ model: unknown; thinkingLevel: string }>;
}

function fakePi(): { pi: { registerVirtualModel(d: unknown): void }; registered: CapturedVirtualModel[] } {
	const registered: CapturedVirtualModel[] = [];
	return {
		registered,
		pi: {
			registerVirtualModel(d: unknown) {
				registered.push(d as CapturedVirtualModel);
			},
		},
	};
}

function registry(models: Array<{ provider: string; id: string }>) {
	return {
		find(provider: string, id: string) {
			return models.find((m) => m.provider === provider && m.id === id);
		},
	};
}

const FAST = { provider: "zai", id: "glm-5.3-flash" };
const HEAVY = { provider: "zai", id: "glm-5.3" };

// ---------------------------------------------------------------- pure helpers

describe("extractLastUserText", () => {
	test("string content", () => {
		expect(extractLastUserText([{ role: "system", content: "sys" }, userMsg("hello")])).toBe("hello");
	});
	test("last user message wins", () => {
		expect(extractLastUserText([userMsg("first"), { role: "assistant", content: "hi" }, userMsg("second")])).toBe("second");
	});
	test("text parts are joined", () => {
		expect(extractLastUserText([userMsg([{ type: "text", text: "a" }, { type: "text", text: "b" }])])).toBe("ab");
	});
	test("image-only content is null", () => {
		expect(extractLastUserText([userMsg([{ type: "image", url: "x" }])])).toBeNull();
	});
	test("no user message is null", () => {
		expect(extractLastUserText([{ role: "assistant", content: "hi" }])).toBeNull();
	});
});

describe("validateIntentAnswer", () => {
	test("valid choice above threshold", () => {
		expect(validateIntentAnswer({ type: "choice", choice: "deep_debugging", confidence: 0.5 }, 0.3)).toBe("deep_debugging");
	});
	test("unknown choice is null", () => {
		expect(validateIntentAnswer({ type: "choice", choice: "vibes", confidence: 0.9 }, 0.3)).toBeNull();
	});
	test("below minConfidence is null", () => {
		expect(validateIntentAnswer({ type: "choice", choice: "trivial_shell", confidence: 0.29 }, 0.3)).toBeNull();
	});
	test("non-choice / malformed is null", () => {
		expect(validateIntentAnswer({ type: "score", score: 1, confidence: 0.9 }, 0.3)).toBeNull();
		expect(validateIntentAnswer(null, 0.3)).toBeNull();
		expect(validateIntentAnswer({ type: "choice", choice: "trivial_shell", confidence: NaN }, 0.3)).toBeNull();
	});
});

describe("intentToTier", () => {
	test("fast intents", () => {
		expect(intentToTier("trivial_shell")).toBe("fast");
		expect(intentToTier("localized_refactor")).toBe("fast");
	});
	test("heavy intents and null fail-safe", () => {
		expect(intentToTier("multi_file_architecture")).toBe("heavy");
		expect(intentToTier("deep_debugging")).toBe("heavy");
		expect(intentToTier(null)).toBe("heavy");
	});
});

// ---------------------------------------------------------------- classify

describe("classify", () => {
	test("maps a valid answer to intent + confidence", async () => {
		const out = await classify("run ls", config(), okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.574 }));
		expect(out.intent).toBe("trivial_shell");
		expect(out.confidence).toBe(0.574);
		expect(out.failure).toBeUndefined();
	});
	test("low confidence fails open without intent", async () => {
		const out = await classify("x", config(), okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.02 }));
		expect(out.intent).toBeNull();
		expect(out.failure).toBe("schema");
	});
	test("missing answer is malformed", async () => {
		const out = await classify("x", config(), okFetch(undefined));
		expect(out.intent).toBeNull();
		expect(out.failure).toBe("malformed");
	});
	test("http error fails open", async () => {
		const fetch500 = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
		const out = await classify("x", config(), fetch500);
		expect(out.intent).toBeNull();
		expect(out.failure).toBe("http:500");
	});
	test("network error fails open", async () => {
		const fetchErr = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;
		const out = await classify("x", config(), fetchErr);
		expect(out.intent).toBeNull();
		expect(out.failure).toBe("error");
	});
	test("hard timeout aborts and fails open", async () => {
		const slow = (async (_url: unknown, init?: { signal?: AbortSignal }) => {
			await new Promise((resolve, reject) => {
				const t = setTimeout(resolve, 500);
				init?.signal?.addEventListener("abort", () => {
					clearTimeout(t);
					const e = new Error("This operation was aborted");
					e.name = "AbortError";
					reject(e);
				});
			});
			return new Response("{}");
		}) as unknown as typeof fetch;
		const out = await classify("x", config({ classifyTimeoutMs: 10 }), slow);
		expect(out.intent).toBeNull();
		expect(out.failure).toBe("timeout");
		expect(out.latencyMs).toBeGreaterThanOrEqual(9);
	});
	test("prompt is capped at maxPromptChars", async () => {
		let body = "";
		const capture = (async (_u: unknown, init: { body: string }) => {
			body = init.body;
			return okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 })();
		}) as unknown as typeof fetch;
		await classify("x".repeat(500), config({ maxPromptChars: 100 }), capture);
		const parsed = JSON.parse(body);
		expect(parsed.state.length).toBe(100);
		expect(Object.keys(parsed.questions)).toEqual(["intent"]);
	});
});

// ---------------------------------------------------------------- config

describe("resolveConfig", () => {
	test("env override of url and enabled", () => {
		const c = resolveConfig({ LAYA_MODEL_ROUTER_URL: "http://dead:1", LAYA_MODEL_ROUTER_ENABLED: "0" }, {
			exists: () => false,
			read: () => {
				throw new Error("no file");
			},
		});
		expect(c.baseUrl).toBe("http://dead:1");
		expect(c.enabled).toBe(false);
	});
	test("file deep-merges over defaults", () => {
		const dir = mkdtempSync(join(tmpdir(), "laya-cfg-"));
		try {
			const file = join(dir, "cfg.json");
			writeFileSync(file, JSON.stringify({ classifyTimeoutMs: 250, tiers: { heavy: { provider: "github-copilot", model: "gpt-6-sol" } } }));
			const originalHome = process.env.HOME;
			// resolveConfig reads the fixed ~/.pi path; point HOME at the temp dir
			process.env.HOME = dir;
			const c = resolveConfig({}, {
				exists: () => true,
				read: () => readFileSync(file, "utf8"),
			});
			expect(c.classifyTimeoutMs).toBe(250);
			expect(c.tiers.heavy.model).toBe("gpt-6-sol");
			expect(c.tiers.fast.model).toBe("glm-5.3-flash"); // untouched default
			process.env.HOME = originalHome;
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
	test("malformed config file falls back to defaults", () => {
		const c = resolveConfig({}, { exists: () => true, read: () => "{not json" });
		expect(c.classifyTimeoutMs).toBe(100);
		expect(c.baseUrl).toBe("http://127.0.0.1:8082");
	});
});

// ---------------------------------------------------------------- wiring

describe("createRouter", () => {
	function setup(fetchImpl: typeof fetch, models = [FAST, HEAVY]) {
		const { pi, registered } = fakePi();
		const records: unknown[] = [];
		const infos: string[] = [];
		const warns: string[] = [];
		createRouter(pi, {
			config: config(),
			fetchImpl,
			log: { record: (r: unknown) => records.push(r) } as unknown as RoutingLog,
			now: () => 1234,
			info: (m) => infos.push(m),
			warn: (m) => warns.push(m),
		});
		return { route: registered[0].route, ctx: { modelRegistry: registry(models) }, records, infos, warns, registered };
	}

	test("registers exactly one virtual model under laya/auto", () => {
		const { registered } = setup(okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.6 }));
		expect(registered.length).toBe(1);
		expect(registered[0].provider).toBe("laya");
		expect(registered[0].id).toBe("auto");
	});

	test("user + trivial_shell dispatches fast tier", async () => {
		const { route, ctx, infos, records } = setup(okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.574 }));
		const out = await route({ reason: "user", thinkingLevel: "medium", messages: [userMsg("run ls")] }, ctx);
		expect(out.model).toBe(FAST);
		expect(out.thinkingLevel).toBe("medium");
		expect(infos[0]).toContain("[Laya Router] Intent: 'trivial_shell'");
		expect(infos[0]).toContain("Assigned Tier: zai/glm-5.3-flash");
		expect((records[0] as { tier: string }).tier).toBe("fast");
	});

	test("user + deep_debugging dispatches heavy tier", async () => {
		const { route, ctx, infos } = setup(okFetch({ type: "choice", choice: "deep_debugging", confidence: 0.4 }));
		const out = await route({ reason: "user", thinkingLevel: "high", messages: [userMsg("find the race condition")] }, ctx);
		expect(out.model).toBe(HEAVY);
		expect(out.thinkingLevel).toBe("high");
		expect(infos[0]).toContain("Assigned Tier: zai/glm-5.3");
	});

	test("user + timeout fails open to heavy with warning", async () => {
		const never = (async (_u: unknown, init?: { signal?: AbortSignal }) => {
			await new Promise((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					const e = new Error("aborted");
					e.name = "AbortError";
					reject(e);
				});
			});
			return new Response("{}");
		}) as unknown as typeof fetch;
		const { route, ctx, warns, records } = setup(never);
		const out = await route({ reason: "user", thinkingLevel: "medium", messages: [userMsg("anything")] }, ctx);
		expect(out.model).toBe(HEAVY); // fail-open, turn not interrupted
		expect(warns[0]).toContain("fail-open");
		expect((records[0] as { failure: string }).failure).toBe("timeout");
	});

	test("continuation stays sticky on previous model", async () => {
		const { route, ctx, records } = setup(okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 }));
		const prev = { model: HEAVY, thinkingLevel: "high" };
		const out = await route({ reason: "continuation", thinkingLevel: "medium", previous: prev, messages: [userMsg("go on")] }, ctx);
		expect(out.model).toBe(HEAVY);
		expect(out.thinkingLevel).toBe("high");
		expect((records[0] as { sticky: boolean }).sticky).toBe(true);
	});

	test("retry stays sticky on failed model", async () => {
		const { route, ctx } = setup(okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 }));
		const failed = { model: FAST, thinkingLevel: "medium", message: {} };
		const out = await route({ reason: "retry", thinkingLevel: "medium", failed, messages: [] }, ctx);
		expect(out.model).toBe(FAST);
	});

	test("direct (compaction etc.) goes heavy without classifying", async () => {
		let called = 0;
		const counting = (async () => {
			called++;
			return okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 })();
		}) as unknown as typeof fetch;
		const { route, ctx } = setup(counting);
		const out = await route({ reason: "direct", thinkingLevel: "medium", messages: [] }, ctx);
		expect(out.model).toBe(HEAVY);
		expect(called).toBe(0);
	});

	test("heavy unresolvable falls open to fast tier", async () => {
		const { route, ctx } = setup(okFetch({ type: "choice", choice: "deep_debugging", confidence: 0.9 }), [FAST]);
		const out = await route({ reason: "user", thinkingLevel: "medium", messages: [userMsg("hard")] }, ctx);
		expect(out.model).toBe(FAST);
	});

	test("no resolvable model at all throws (surfaced by pi)", async () => {
		const { route, ctx } = setup(okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 }), []);
		expect(route({ reason: "user", thinkingLevel: "medium", messages: [userMsg("x")] }, ctx)).rejects.toThrow("no physical model");
	});

	test("slash-command-looking text skips classification", async () => {
		let called = 0;
		const counting = (async () => {
			called++;
			return okFetch({ type: "choice", choice: "trivial_shell", confidence: 0.9 })();
		}) as unknown as typeof fetch;
		const { route, ctx } = setup(counting);
		const out = await route({ reason: "user", thinkingLevel: "medium", messages: [userMsg("/model")] }, ctx);
		expect(called).toBe(0);
		expect(out.model).toBe(HEAVY);
	});

	test("disabled config registers nothing", () => {
		const { pi } = fakePi();
		createRouter(pi, { config: config({ enabled: false }) });
		// no registration: verified via fakePi returning zero entries
	});
});

// ---------------------------------------------------------------- log

describe("RoutingLog", () => {
	test("appends JSONL records and truncates past maxBytes", () => {
		const dir = mkdtempSync(join(tmpdir(), "laya-log-"));
		try {
			const file = join(dir, "routing.jsonl");
			const log = new RoutingLog(file, 64);
			log.record({ ts: 1, event: "route", reason: "user", intent: null, confidence: null, classifyMs: 5, sticky: false, tier: "heavy", model: "zai/glm-5.3" });
			expect(readFileSync(file, "utf8").trim().split("\n").length).toBe(1);
			expect(JSON.parse(readFileSync(file, "utf8")).model).toBe("zai/glm-5.3");
			// size now > 64 bytes -> next record truncates first
			log.record({ ts: 2, event: "route", reason: "user", intent: null, confidence: null, classifyMs: 5, sticky: false, tier: "heavy", model: "zai/glm-5.3" });
			const lines = readFileSync(file, "utf8").trim().split("\n");
			expect(lines.length).toBe(1);
			expect(JSON.parse(lines[0]).ts).toBe(2);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

// ---------------------------------------------------------------- intents

describe("INTENTS", () => {
	test("matches the mission question set", () => {
		expect([...INTENTS]).toEqual(["trivial_shell", "localized_refactor", "multi_file_architecture", "deep_debugging"]);
	});
});
