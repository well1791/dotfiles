/**
 * Routing question set v2 and the deterministic composition policy.
 * Pure module: no I/O, no pi imports.
 *
 * Design (empirically validated against the installed Laya service,
 * 2026-09-23 — see the spec amendment): a direct 3-way route `choice` produced
 * near-uniform low-confidence distributions, while short guard-style `noul`
 * questions over a single `request` state field are discriminative and
 * calibrated. The route is therefore COMPOSED from signal cut-offs:
 *
 *   1. sensitive ≥ signals.sensitive          → frontier (escalated if a
 *      cheaper signal (decision/trivial) also fired)
 *   2. coding    ≥ signals.coding             → frontier
 *   3. decision  ≥ signals.decision           → laya
 *   4. trivial   ≥ signals.trivial            → small
 *   5. else                                     → frontier (conservative default)
 *
 * Confidence = the driving question's calibrated confidence. Any non-frontier
 * route whose driving confidence < minConfidence escalates straight to
 * frontier (composed routes have no safe "one step up" neighbor).
 */
import type { LayaRouterConfig } from "./config";
import type { LayaAnswer } from "./client";

export type RouteClass = "laya" | "small" | "frontier";

/** Guard-style noul questions (wording is load-bearing — validated live). */
export const ROUTING_QUESTIONS = {
	trivial: {
		type: "noul",
		instructions: "Is `request` casual chat, a greeting, thanks, or a one-line lookup?",
	},
	coding: {
		type: "noul",
		instructions: "Does `request` ask for coding, file changes, commands, debugging, or system design?",
	},
	decision: {
		type: "noul",
		instructions: "Is `request` a yes/no question or a choice between two named options?",
	},
	sensitive: {
		type: "noul",
		instructions: "Could a wrong answer to `request` cause money, legal, medical, or safety harm?",
	},
} as const;

export interface PolicyInput {
	answers: Record<string, LayaAnswer>;
	config: LayaRouterConfig;
	contextTokens?: number;
}

export interface PolicySignals {
	trivial?: number;
	coding?: number;
	decision?: number;
	sensitive?: number;
}

export interface PolicyDecision {
	kind: "route";
	route: RouteClass;
	confidence: number;
	escalated: boolean;
	reason: "sensitive" | "coding" | "decision" | "trivial" | "low-confidence" | "context-guard" | "default-frontier";
	signals?: PolicySignals;
}

export interface PolicyInvalid {
	kind: "invalid";
	reason: string;
}

const REQUIRED = ["trivial", "coding", "decision", "sensitive"] as const;

export function decide(input: PolicyInput): PolicyDecision | PolicyInvalid {
	const { answers, config } = input;
	const values: PolicySignals = {};
	for (const k of REQUIRED) {
		const a = answers[k];
		if (!a || typeof a.noul !== "number" || !Number.isFinite(a.noul)) {
			return { kind: "invalid", reason: `answer "${k}" missing or noul not a finite number` };
		}
		if (typeof a.confidence !== "number" || !Number.isFinite(a.confidence)) {
			return { kind: "invalid", reason: `answer "${k}" confidence not a finite number` };
		}
		values[k] = a.noul;
	}
	const cut = config.signals;
	const trivial = values.trivial ?? 0;
	const coding = values.coding ?? 0;
	const decision = values.decision ?? 0;
	const sensitive = values.sensitive ?? 0;

	const done = (route: RouteClass, confidence: number, escalated: boolean, reason: PolicyDecision["reason"]): PolicyDecision => ({
		kind: "route",
		route,
		confidence,
		escalated,
		reason,
		signals: values,
	});

	// 1. sensitive — safety dominates everything
	if (config.escalate.sensitive && sensitive >= cut.sensitive) {
		const overrodeCheap = decision >= cut.decision || trivial >= cut.trivial;
		return done("frontier", answers.sensitive!.confidence, overrodeCheap, "sensitive");
	}
	// 2. coding
	if (coding >= cut.coding) return done("frontier", answers.coding!.confidence, false, "coding");
	// 3. decision
	if (decision >= cut.decision) {
		const conf = answers.decision!.confidence;
		if (conf < config.minConfidence) return done("frontier", conf, true, "low-confidence");
		return done("laya", conf, false, "decision");
	}
	// 4. trivial
	if (trivial >= cut.trivial) {
		const conf = answers.trivial!.confidence;
		if (conf < config.minConfidence) return done("frontier", conf, true, "low-confidence");
		if ((input.contextTokens ?? 0) > config.smallRouteMaxContextTokens)
			return done("frontier", conf, true, "context-guard");
		return done("small", conf, false, "trivial");
	}
	// 5. conservative default
	return done("frontier", 1, false, "default-frontier");
}

export function buildRoutingState(prompt: string, maxChars: number): { request: string } {
	return { request: prompt.length > maxChars ? prompt.slice(0, maxChars) : prompt };
}

/**
 * Construct laya-only questions for a request the router classified as a typed
 * decision. Returns null when the prompt is neither a short-option choice nor
 * a question (laya cannot answer generative prompts — spec §4 Mode A).
 */
const OPTION_PREFIX_RE = /^(the|a|an|use|pick|choose|should we|should i|do we|do i|prefer)\s+/i;
const OPTION_SUFFIX_RE = /\s+(for|in|on|at|with|as|to)\b.+$/i;

export function buildLayaOnlyQuestions(prompt: string): Record<string, unknown> | null {
	const trimmed = prompt.trim();
	if (!trimmed || trimmed.length > 500) return null;

	// Explicit short options: "use jest or vitest?", "tabs vs spaces?"
	const lowered = trimmed.toLowerCase();
	if (/\bor\b|\bvs\.?\b/.test(lowered)) {
		const rawParts = trimmed.split(/\s+or\s+|\s+vs\.?\s+/i);
		// Comma enumerations ("a, b, c, or d") are not two clean options.
		if (rawParts.some((p) => p.includes(","))) return null;
		const parts = rawParts
			.map((p) => p.replace(/[?.!,;:]+$/, "").trim())
			.map((p) => p.replace(OPTION_PREFIX_RE, "").trim())
			.map((p) => p.replace(OPTION_SUFFIX_RE, "").trim())
			.filter((p) => p.length > 0 && p.length <= 24);
		const unique = [...new Set(parts.map((p) => p.toLowerCase()))];
		if (unique.length >= 2 && unique.length <= 4) {
			const criteria: Record<string, string> = {};
			for (const p of parts) criteria[p.toLowerCase()] = p;
			return {
				answer: {
					type: "choice",
					instructions: "Which option in `request` is the correct answer?",
					criteria,
				},
			};
		}
		if (unique.length > 4) return null;
	}

	if (trimmed.includes("?")) {
		return {
			answer: {
				type: "noul",
				instructions: "Is the correct answer to the question in `request` yes/affirmative?",
			},
		};
	}
	return null;
}
