/**
 * Configuration for the laya-router pi extension.
 *
 * Precedence: built-in defaults → ~/.pi/agent/laya.json → trusted .pi/laya.json
 * → PI_LAYA_DISABLE=1 kill-switch (forces enabled:false; benchmark A-side and
 * emergency off). loadConfig never throws; invalid values fall back to the
 * default for that key and are reported in `warnings` (surfaced by /laya).
 */

export interface LayaRouterConfig {
	enabled: boolean;
	baseUrl: string;
	timeoutMs: number;
	healthTimeoutMs: number;
	healthCacheMs: { ready: number; failed: number };
	minConfidence: number;
	escalate: { sensitive: boolean };
	/** Signal cut-offs for route composition (validated live 2026-09-23; see spec amendment). */
	signals: { coding: number; decision: number; trivial: number; sensitive: number };
	routes: { laya: null; small: string | null; frontier: string | null };
	layaOnly: { enabled: boolean; minConfidence: number };
	smallRouteMaxContextTokens: number;
	state: { maxPromptChars: number };
	showStatus: boolean;
	log: { file: string };
}

/**
 * Threshold rationale (spec §6, docs/superpowers/specs/2026-09-22-laya-pi-routing-design.md):
 * - minConfidence 0.70: at 0.70 the chosen class is ≥2.3x more probable than all
 *   others combined; misroute cost is asymmetric (wrong-cheap = quality loss,
 *   wrong-expensive = only money), so escalate below it.
 * - layaOnly.minConfidence 0.80: a laya-only answer ships with no model fallback.
 * - smallRouteMaxContextTokens 24000: beyond this, switching back to frontier
 *   re-pays full-context input; flash savings no longer dominate.
 */
export const DEFAULT_CONFIG: LayaRouterConfig = {
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
};

export interface LoadResult {
	config: LayaRouterConfig;
	warnings: string[];
}

type Reader = (path: string) => string | null;

function isPlainObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Plain objects recurse; everything else (arrays, scalars) replaces. */
export function deepMerge<T>(base: T, over: unknown): T {
	if (!isPlainObject(over)) return base as T;
	if (!isPlainObject(base)) return over as T;
	const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
	for (const [k, v] of Object.entries(over)) {
		out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
	}
	return out as T;
}

/** Validate/coerce one file's overlay, dropping invalid values with a warning. */
function sanitize(overlay: unknown, warnings: string[]): Partial<LayaRouterConfig> | null {
	if (!isPlainObject(overlay)) return null;
	const out: Record<string, unknown> = {};

	const num = (key: string, min: number): void => {
		const v = overlay[key];
		if (v === undefined) return;
		if (typeof v === "number" && Number.isFinite(v) && v >= min) out[key] = v;
		else warnings.push(`invalid value for "${key}" ignored: ${JSON.stringify(v)}`);
	};
	const bool = (key: string): void => {
		const v = overlay[key];
		if (v === undefined) return;
		if (typeof v === "boolean") out[key] = v;
		else warnings.push(`invalid value for "${key}" ignored: ${JSON.stringify(v)}`);
	};

	bool("enabled");
	if (overlay.baseUrl !== undefined) {
		if (typeof overlay.baseUrl === "string" && /^https?:\/\//.test(overlay.baseUrl)) out.baseUrl = overlay.baseUrl;
		else warnings.push(`invalid value for "baseUrl" ignored`);
	}
	num("timeoutMs", 1);
	num("healthTimeoutMs", 1);
	num("minConfidence", 0);
	num("smallRouteMaxContextTokens", 0);
	if (overlay.state !== undefined) {
		if (isPlainObject(overlay.state)) {
			const s: Record<string, unknown> = {};
			if (overlay.state.maxPromptChars !== undefined) {
				if (typeof overlay.state.maxPromptChars === "number" && overlay.state.maxPromptChars > 0)
					s.maxPromptChars = overlay.state.maxPromptChars;
				else warnings.push(`invalid value for "state.maxPromptChars" ignored`);
			}
			if (Object.keys(s).length > 0) out.state = s;
		} else warnings.push(`invalid value for "state" ignored`);
	}
	if (overlay.healthCacheMs !== undefined) {
		if (isPlainObject(overlay.healthCacheMs)) {
			const h: Record<string, unknown> = {};
			for (const k of ["ready", "failed"] as const) {
				const v = overlay.healthCacheMs[k];
				if (v === undefined) continue;
				if (typeof v === "number" && v >= 0) h[k] = v;
				else warnings.push(`invalid value for "healthCacheMs.${k}" ignored`);
			}
			if (Object.keys(h).length > 0) out.healthCacheMs = h;
		} else warnings.push(`invalid value for "healthCacheMs" ignored`);
	}
	if (overlay.escalate !== undefined) {
		if (isPlainObject(overlay.escalate)) {
			const e: Record<string, unknown> = {};
			if (overlay.escalate.sensitive !== undefined) {
				if (typeof overlay.escalate.sensitive === "boolean") e.sensitive = overlay.escalate.sensitive;
				else warnings.push(`invalid value for "escalate.sensitive" ignored`);
			}
			if (Object.keys(e).length > 0) out.escalate = e;
		} else warnings.push(`invalid value for "escalate" ignored`);
	}
	if (overlay.signals !== undefined) {
		if (isPlainObject(overlay.signals)) {
			const s: Record<string, unknown> = {};
			for (const k of ["coding", "decision", "trivial", "sensitive"] as const) {
				const v = overlay.signals[k];
				if (v === undefined) continue;
				if (typeof v === "number" && v >= 0 && v <= 1) s[k] = v;
				else warnings.push(`invalid value for "signals.${k}" ignored (expected 0..1)`);
			}
			if (Object.keys(s).length > 0) out.signals = s;
		} else warnings.push(`invalid value for "signals" ignored`);
	}
	if (overlay.layaOnly !== undefined) {
		if (isPlainObject(overlay.layaOnly)) {
			const l: Record<string, unknown> = {};
			if (overlay.layaOnly.enabled !== undefined) {
				if (typeof overlay.layaOnly.enabled === "boolean") l.enabled = overlay.layaOnly.enabled;
				else warnings.push(`invalid value for "layaOnly.enabled" ignored`);
			}
			if (overlay.layaOnly.minConfidence !== undefined) {
				if (typeof overlay.layaOnly.minConfidence === "number" && overlay.layaOnly.minConfidence >= 0)
					l.minConfidence = overlay.layaOnly.minConfidence;
				else warnings.push(`invalid value for "layaOnly.minConfidence" ignored`);
			}
			if (Object.keys(l).length > 0) out.layaOnly = l;
		} else warnings.push(`invalid value for "layaOnly" ignored`);
	}
	if (overlay.routes !== undefined) {
		if (isPlainObject(overlay.routes)) {
			const r: Record<string, unknown> = {};
			for (const k of ["small", "frontier"] as const) {
				const v = overlay.routes[k];
				if (v === undefined) continue;
				if (v === null || (typeof v === "string" && v.includes("/"))) r[k] = v;
				else warnings.push(`invalid value for "routes.${k}" ignored (expected "provider/model" or null)`);
			}
			// routes.laya is reserved: laya terminates at the service itself.
			if (overlay.routes.laya !== undefined && overlay.routes.laya !== null)
				warnings.push(`"routes.laya" is reserved (must be null) — value ignored`);
			if (Object.keys(r).length > 0) out.routes = r;
		} else warnings.push(`invalid value for "routes" ignored`);
	}
	if (overlay.showStatus !== undefined) bool("showStatus");
	if (overlay.log !== undefined) {
		if (isPlainObject(overlay.log) && typeof overlay.log.file === "string") out.log = { file: overlay.log.file };
		else warnings.push(`invalid value for "log" ignored`);
	}
	return out as Partial<LayaRouterConfig>;
}

export function loadConfig(
	env: NodeJS.ProcessEnv,
	readFile: Reader,
	globalPath: string,
	projectPath: string | null,
): LoadResult {
	const warnings: string[] = [];
	let overlay: unknown = {};
	for (const path of [globalPath, projectPath]) {
		if (!path) continue;
		const raw = readFile(path);
		if (raw === null) continue;
		try {
			const parsed: unknown = JSON.parse(raw);
			overlay = deepMerge(overlay, parsed);
		} catch {
			warnings.push(`cannot parse ${path}; ignored`);
		}
	}
	const clean = sanitize(overlay, warnings);
	let config = deepMerge(DEFAULT_CONFIG, clean);
	const kill = env.PI_LAYA_DISABLE;
	if (kill === "1" || kill === "true") config = { ...config, enabled: false };
	return { config: Object.freeze(config), warnings };
}
