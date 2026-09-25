/**
 * Isolated HTTP client for the local Laya decision-engine service
 * (see docs/laya-service.md in the chezmoi repo).
 *
 * All Laya protocol knowledge lives here: /healthz readiness with TTL caching,
 * /v1/predict typed questions, strict response validation, single-attempt
 * semantics (no retries — callers fall back to normal pi behavior), and
 * AbortController timeouts. Every failure surfaces as LayaError with a
 * machine-readable `failure` kind.
 */

export type LayaFailure = "unreachable" | "timeout" | "http" | "malformed" | "schema";

export class LayaError extends Error {
	readonly failure: LayaFailure;
	readonly status?: number;
	constructor(failure: LayaFailure, message: string, status?: number) {
		super(message);
		this.name = "LayaError";
		this.failure = failure;
		this.status = status;
	}
}

export interface LayaHealth {
	ok: boolean;
	status: string; // "ready" | "initializing" | "failed" | "unreachable" | "timeout" | "http"
	layaVersion?: string;
	error?: string;
	cached: boolean;
}

export interface LayaAnswer {
	type: "choice" | "noul" | "score";
	choice?: string;
	noul?: number;
	score?: number;
	confidence: number;
	probabilities?: Record<string, number>;
}

export interface LayaPredictResult {
	answers: Record<string, LayaAnswer>;
	latencyMs: number; // measured client-side
	serviceLatencyMs?: number;
	usage?: unknown;
}

const MAX_RESPONSE_BYTES = 1024 * 1024;

export interface ClientOptions {
	baseUrl: string;
	timeoutMs: number;
	healthTimeoutMs: number;
	healthCacheMs: { ready: number; failed: number };
	fetchImpl?: typeof fetch;
	now?: () => number;
}

export class LayaServiceClient {
	private readonly baseUrl: string;
	private readonly timeoutMs: number;
	private readonly healthTimeoutMs: number;
	private readonly healthCacheMs: { ready: number; failed: number };
	private readonly fetchImpl: typeof fetch;
	private readonly now: () => number;
	private cache: { health: LayaHealth; at: number } | null = null;

	constructor(opts: ClientOptions) {
		this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
		this.timeoutMs = opts.timeoutMs;
		this.healthTimeoutMs = opts.healthTimeoutMs;
		this.healthCacheMs = opts.healthCacheMs;
		this.fetchImpl = opts.fetchImpl ?? fetch;
		this.now = opts.now ?? (() => Date.now());
	}

	/** Readiness probe. TTL-cached; `force` bypasses the cache. Never throws. */
	async health(force = false): Promise<LayaHealth> {
		const t = this.now();
		if (!force && this.cache) {
			const ttl = this.cache.health.ok ? this.healthCacheMs.ready : this.healthCacheMs.failed;
			if (t - this.cache.at < ttl) return { ...this.cache.health, cached: true };
		}
		const health = await this.probe();
		this.cache = { health, at: this.now() };
		return { ...health, cached: false };
	}

	private async probe(): Promise<LayaHealth> {
		const started = this.now();
		let response: Response;
		try {
			response = await this.fetchImpl(`${this.baseUrl}/healthz`, {
				method: "GET",
				signal: this.abortAfter(this.healthTimeoutMs),
			});
		} catch (e) {
			return this.networkFailure(e);
		}
		let body: Record<string, unknown>;
		try {
			body = (await this.readJson(response)) as Record<string, unknown>;
		} catch (e) {
			return { ok: false, status: "malformed", error: (e as Error).message, cached: false };
		}
		const status = typeof body.status === "string" ? body.status : String(response.status);
		const ok = response.status === 200 && body.ok === true;
		return {
			ok,
			status: ok ? (body.status as string) : status,
			layaVersion: typeof body.laya_version === "string" ? body.laya_version : undefined,
			error: typeof body.error === "string" ? body.error : undefined,
			cached: false,
		};
	}

	/**
	 * Typed-decision request. Validates that every requested question id has an
	 * answer with a numeric confidence. Throws LayaError on any failure.
	 */
	async predict(state: unknown, questions: Record<string, unknown>): Promise<LayaPredictResult> {
		const started = this.now();
		let response: Response;
		try {
			response = await this.fetchImpl(`${this.baseUrl}/v1/predict`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ state, questions }),
				signal: this.abortAfter(this.timeoutMs),
			});
		} catch (e) {
			throw this.networkError(e);
		}
		if (!response.ok) {
			const text = await this.safeText(response);
			throw new LayaError("http", `laya ${response.status}: ${text.slice(0, 200)}`, response.status);
		}
		let payload: Record<string, unknown>;
		try {
			payload = (await this.readJson(response)) as Record<string, unknown>;
		} catch (e) {
			throw new LayaError("malformed", (e as Error).message);
		}
		if (payload.ok !== true) {
			throw new LayaError("schema", `predict envelope not ok: ${JSON.stringify(payload).slice(0, 120)}`);
		}
		const result = payload.result as Record<string, unknown> | undefined;
		const answers = result?.answers as Record<string, Record<string, unknown>> | undefined;
		if (!answers || typeof answers !== "object") {
			throw new LayaError("schema", "predict result missing answers object");
		}
		for (const qid of Object.keys(questions)) {
			const a = answers[qid];
			if (!a || typeof a !== "object") throw new LayaError("schema", `missing answer for question "${qid}"`);
			if (typeof a.confidence !== "number" || !Number.isFinite(a.confidence)) {
				throw new LayaError("schema", `answer "${qid}" confidence is not a finite number`);
			}
		}
		const parsed: Record<string, LayaAnswer> = {};
		for (const [qid, a] of Object.entries(answers)) {
			parsed[qid] = {
				type: (a.type as LayaAnswer["type"]) ?? "choice",
				choice: typeof a.choice === "string" ? a.choice : undefined,
				noul: typeof a.noul === "number" ? a.noul : undefined,
				score: typeof a.score === "number" ? a.score : undefined,
				confidence: a.confidence as number,
				probabilities:
					a.probabilities && typeof a.probabilities === "object"
						? (a.probabilities as Record<string, number>)
						: undefined,
			};
		}
		return {
			answers: parsed,
			latencyMs: this.now() - started,
			serviceLatencyMs: typeof payload.latency_ms === "number" ? payload.latency_ms : undefined,
			usage: result?.usage,
		};
	}

	// ---------------------------------------------------------------- helpers

	private abortAfter(ms: number): AbortSignal {
		return AbortSignal.timeout(ms);
	}

	private async readJson(response: Response): Promise<unknown> {
		const text = await this.safeText(response);
		if (text.length > MAX_RESPONSE_BYTES) throw new Error(`response body too large (${text.length} bytes)`);
		return JSON.parse(text);
	}

	private async safeText(response: Response): Promise<string> {
		try {
			return await response.text();
		} catch {
			return "";
		}
	}

	private networkFailure(e: unknown): LayaHealth {
		return { ok: false, status: this.isAbort(e) ? "timeout" : "unreachable", error: (e as Error).message, cached: false };
	}

	private networkError(e: unknown): LayaError {
		return this.isAbort(e)
			? new LayaError("timeout", `laya request timed out`)
			: new LayaError("unreachable", `laya unreachable: ${(e as Error).message}`);
	}

	private isAbort(e: unknown): boolean {
		return e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
	}
}
