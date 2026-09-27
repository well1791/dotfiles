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
	/** Tool-result representation gating (spec §7). */
	contextSupervision: {
		enabled: boolean;
		minBytes: number;
		minConfidence: number;
		compressHeadChars: number;
		verdictCacheEntries: number;
	};
	state: { maxPromptChars: number };
	showStatus: boolean;
	log: { file: string };
}

/**
 * Gating thresholds (spec 2026-09-26 §6–§7): minConfidence 0.7 — wrongly digesting
 * costs quality, wrongly keeping verbatim costs only tokens; minBytes 2048 —
 * below this a consult costs more than the tokens it could save.
 */
export const DEFAULT_CONFIG: LayaRouterConfig = {
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

/** Keys from the removed model-routing design: warn once each, ignore values (spec §7). */
const STALE_ROUTING_KEYS = [
	"routes",
	"signals",
	"escalate",
	"minConfidence",
	"smallRouteMaxContextTokens",
	"layaOnly",
] as const;

/** Validate/coerce one file's overlay, dropping invalid values with a warning. */
function sanitize(overlay: unknown, warnings: string[]): Partial<LayaRouterConfig> | null {
	if (!isPlainObject(overlay)) return null;
	for (const k of STALE_ROUTING_KEYS) {
		if (overlay[k] !== undefined) warnings.push(`"${k}" is no longer used; routing was removed`);
	}
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
	if (overlay.contextSupervision !== undefined) {
		if (isPlainObject(overlay.contextSupervision)) {
			const cs = overlay.contextSupervision;
			const c: Record<string, unknown> = {};
			if (cs.enabled !== undefined) {
				if (typeof cs.enabled === "boolean") c.enabled = cs.enabled;
				else warnings.push(`invalid value for "contextSupervision.enabled" ignored`);
			}
			if (cs.minBytes !== undefined) {
				if (typeof cs.minBytes === "number" && Number.isFinite(cs.minBytes) && cs.minBytes >= 1) c.minBytes = cs.minBytes;
				else warnings.push(`invalid value for "contextSupervision.minBytes" ignored`);
			}
			if (cs.minConfidence !== undefined) {
				if (typeof cs.minConfidence === "number" && cs.minConfidence >= 0 && cs.minConfidence <= 1) c.minConfidence = cs.minConfidence;
				else warnings.push(`invalid value for "contextSupervision.minConfidence" ignored`);
			}
			if (cs.compressHeadChars !== undefined) {
				if (typeof cs.compressHeadChars === "number" && Number.isFinite(cs.compressHeadChars) && cs.compressHeadChars >= 1) c.compressHeadChars = cs.compressHeadChars;
				else warnings.push(`invalid value for "contextSupervision.compressHeadChars" ignored`);
			}
			if (cs.verdictCacheEntries !== undefined) {
				if (typeof cs.verdictCacheEntries === "number" && Number.isFinite(cs.verdictCacheEntries) && cs.verdictCacheEntries >= 1) c.verdictCacheEntries = cs.verdictCacheEntries;
				else warnings.push(`invalid value for "contextSupervision.verdictCacheEntries" ignored`);
			}
			if (Object.keys(c).length > 0) out.contextSupervision = c;
		} else warnings.push(`invalid value for "contextSupervision" ignored`);
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
