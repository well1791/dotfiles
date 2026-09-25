import { test, expect } from "bun:test";
import { LayaServiceClient, LayaError } from "./client";

const SAMPLE_PREDICT = {
	ok: true,
	latency_ms: 312.4,
	result: {
		model: "laya-rl-agent",
		answers: {
			route: {
				type: "choice",
				choice: "frontier",
				probabilities: { frontier: 0.93, small: 0.05, laya: 0.02 },
				confidence: 0.93,
				action: { act_probability: 1.0 },
			},
			difficulty: {
				type: "score",
				score: 3,
				confidence: 0.81,
				action: { act_probability: 1.0 },
			},
			needs_tools: { type: "noul", noul: 0.9, confidence: 0.9, action: { act_probability: 1.0 } },
			is_sensitive: { type: "noul", noul: 0.02, confidence: 0.02, action: { act_probability: 1.0 } },
		},
		usage: { input_tokens: 129, output_tokens: 0 },
	},
};

function jsonResponse(status: number, body: unknown) {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function neverResolvingFetch(): typeof fetch {
	return ((_url: unknown, opts?: { signal?: AbortSignal }) =>
		new Promise((_res, rej) => {
			opts?.signal?.addEventListener("abort", () => {
				const e = new Error("The operation was aborted");
				e.name = "AbortError";
				rej(e);
			});
		})) as unknown as typeof fetch;
}

function makeClient(fetchImpl: typeof fetch, now?: () => number) {
	return new LayaServiceClient({
		baseUrl: "http://laya.test",
		timeoutMs: 50,
		healthTimeoutMs: 30,
		healthCacheMs: { ready: 1000, failed: 500 },
		fetchImpl,
		now,
	});
}

const QUESTIONS = {
	route: { type: "choice", instructions: "r", criteria: {} },
	needs_tools: { type: "noul", instructions: "n" },
};

test("health: 200 ready parses status and version", async () => {
	let calls = 0;
	const c = makeClient(async () => {
		calls++;
		return jsonResponse(200, { ok: true, status: "ready", laya_version: "0.3.5" });
	});
	const h = await c.health();
	expect(h.ok).toBe(true);
	expect(h.status).toBe("ready");
	expect(h.layaVersion).toBe("0.3.5");
	expect(h.cached).toBe(false);
	expect(calls).toBe(1);
});

test("health: 503 initializing reports not-ok without throwing", async () => {
	const c = makeClient(async () => jsonResponse(503, { ok: false, status: "initializing", error: null }));
	const h = await c.health();
	expect(h.ok).toBe(false);
	expect(h.status).toBe("initializing");
});

test("health: 503 failed carries the error string", async () => {
	const c = makeClient(async () =>
		jsonResponse(503, { ok: false, status: "failed", error: "model loading failed after 3 attempts" }),
	);
	const h = await c.health();
	expect(h.ok).toBe(false);
	expect(h.status).toBe("failed");
	expect(h.error).toContain("model loading failed");
});

test("health: unreachable maps to not-ok unreachable", async () => {
	const c = makeClient(async () => {
		throw new TypeError("fetch failed");
	});
	const h = await c.health();
	expect(h.ok).toBe(false);
	expect(h.status).toBe("unreachable");
});

test("health: timeout maps to not-ok timeout", async () => {
	const c = makeClient(neverResolvingFetch() as typeof fetch);
	const h = await c.health();
	expect(h.ok).toBe(false);
	expect(h.status).toBe("timeout");
});

test("health: cached within TTL, force bypasses, failed TTL expires", async () => {
	let calls = 0;
	let t = 0;
	const c = makeClient(async () => {
		calls++;
		return calls === 1
			? jsonResponse(200, { ok: true, status: "ready" })
			: jsonResponse(503, { ok: false, status: "failed", error: "x" });
	}, () => t);

	const first = await c.health();
	expect(first.cached).toBe(false);
	const second = await c.health();
	expect(second.cached).toBe(true); // ready TTL 1000
	expect(calls).toBe(1);

	t = 1001; // ready TTL expired; fetch now fails
	const third = await c.health();
	expect(third.cached).toBe(false);
	expect(third.ok).toBe(false);
	const fourth = await c.health();
	expect(fourth.cached).toBe(true); // failed TTL 500
	t = 1601;
	const fifth = await c.health();
	expect(fifth.cached).toBe(false); // failed TTL expired

	const forced = await c.health(true);
	expect(forced.cached).toBe(false);
});

test("predict: parses answers for every requested question id", async () => {
	let t = 1000;
	const c = makeClient(
		async () => jsonResponse(200, SAMPLE_PREDICT),
		() => (t += 10),
	);
	const r = await c.predict({ request: "hello" }, QUESTIONS);
	expect(r.answers.route.choice).toBe("frontier");
	expect(r.answers.route.confidence).toBe(0.93);
	expect(r.answers.route.probabilities).toEqual({ frontier: 0.93, small: 0.05, laya: 0.02 });
	expect(r.answers.difficulty.score).toBe(3);
	expect(r.answers.needs_tools.noul).toBe(0.9);
	expect(r.latencyMs).toBe(10); // one clock tick across the call
	expect(r.serviceLatencyMs).toBe(312.4);
});

test("predict: posts state and questions to /v1/predict", async () => {
	let seen: { url: string; init: RequestInit } | null = null;
	const c = makeClient(async (url, init) => {
		seen = { url: String(url), init: init as RequestInit };
		return jsonResponse(200, SAMPLE_PREDICT);
	});
	await c.predict({ request: "hello" }, QUESTIONS);
	expect(seen!.url).toBe("http://laya.test/v1/predict");
	const body = JSON.parse(String(seen!.init.body));
	expect(body.state).toEqual({ request: "hello" });
	expect(body.questions.route.type).toBe("choice");
});

test("predict: ok:false envelope is a schema failure", async () => {
	const c = makeClient(async () => jsonResponse(200, { ok: false, error: "boom" }));
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect(e).toBeInstanceOf(LayaError);
		expect((e as LayaError).failure).toBe("schema");
	}
});

test("predict: malformed JSON body is a malformed failure", async () => {
	const c = makeClient(async () => new Response("{not json", { status: 200 }));
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("malformed");
	}
});

test("predict: missing requested answer is a schema failure", async () => {
	const c = makeClient(async () =>
		jsonResponse(200, { ok: true, result: { answers: { route: SAMPLE_PREDICT.result.answers.route } } }),
	);
	try {
		await c.predict({}, QUESTIONS); // needs_tools missing
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("schema");
		expect((e as LayaError).message).toContain("needs_tools");
	}
});

test("predict: non-numeric confidence is a schema failure", async () => {
	const bad = JSON.parse(JSON.stringify(SAMPLE_PREDICT));
	bad.result.answers.route.confidence = "0.93";
	const c = makeClient(async () => jsonResponse(200, bad));
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("schema");
	}
});

test("predict: HTTP 500 is an http failure carrying status", async () => {
	const c = makeClient(async () => jsonResponse(500, { ok: false, error: "inference failed: kaboom" }));
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("http");
		expect((e as LayaError).status).toBe(500);
		expect((e as LayaError).message).toContain("inference failed");
	}
});

test("predict: timeout aborts once, no retries", async () => {
	let calls = 0;
	const fetchImpl = ((_u: unknown, opts?: { signal?: AbortSignal }) => {
		calls++;
		return new Promise((_res, rej) => {
			opts?.signal?.addEventListener("abort", () => {
				const e = new Error("aborted");
				e.name = "AbortError";
				rej(e);
			});
		});
	}) as unknown as typeof fetch;
	const c = makeClient(fetchImpl);
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("timeout");
		expect(calls).toBe(1);
	}
});

test("predict: unreachable classifies without retry", async () => {
	let calls = 0;
	const c = makeClient(async () => {
		calls++;
		throw new TypeError("fetch failed");
	});
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("unreachable");
		expect(calls).toBe(1);
	}
});

test("predict: oversize response body is rejected as malformed", async () => {
	const huge = { ok: true, result: { answers: {} }, pad: "x".repeat(2 * 1024 * 1024) };
	const c = makeClient(async () => jsonResponse(200, huge));
	try {
		await c.predict({}, QUESTIONS);
		expect.unreachable();
	} catch (e) {
		expect((e as LayaError).failure).toBe("malformed");
	}
});
