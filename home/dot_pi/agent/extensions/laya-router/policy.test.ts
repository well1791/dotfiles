import { test, expect } from "bun:test";
import { DEFAULT_CONFIG } from "./config";
import { decide, buildRoutingState, buildLayaOnlyQuestions, ROUTING_QUESTIONS } from "./policy";
import type { LayaAnswer } from "./client";

/**
 * answers() builds the v2 noul answer set: each signal is {value, confidence}.
 * Omitted signals are omitted from the answers map (invalid-decision tests).
 */
function answers(
	sig: { trivial?: number; coding?: number; decision?: number; sensitive?: number },
	conf: { trivial?: number; coding?: number; decision?: number; sensitive?: number } = {},
): Record<string, LayaAnswer> {
	const out: Record<string, LayaAnswer> = {};
	for (const k of ["trivial", "coding", "decision", "sensitive"] as const) {
		if (sig[k] === undefined) continue;
		out[k] = { type: "noul", noul: sig[k], confidence: conf[k] ?? 0.9 };
	}
	return out;
}

const cfg = DEFAULT_CONFIG;

test("coding signal routes to frontier", () => {
	const d = decide({ answers: answers({ trivial: 0, coding: 0.72, decision: 0.1, sensitive: 0 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "frontier", escalated: false, reason: "coding" });
	expect(d.confidence).toBe(0.9); // driving question confidence
});

test("decision signal routes to laya", () => {
	const d = decide({ answers: answers({ trivial: 0.1, coding: 0.3, decision: 0.85, sensitive: 0 }, { decision: 0.85 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "laya", escalated: false, reason: "decision" });
	expect(d.confidence).toBe(0.85);
});

test("trivial signal routes to small", () => {
	const d = decide({ answers: answers({ trivial: 0.74, coding: 0.08, decision: 0.1, sensitive: 0 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "small", escalated: false, reason: "trivial" });
});

test("unknown prompts default to frontier", () => {
	const d = decide({ answers: answers({ trivial: 0.19, coding: 0.11, decision: 0.29, sensitive: 0 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "frontier", escalated: false, reason: "default-frontier" });
});

test("coding above cut-off blocks a decision route", () => {
	const d = decide({ answers: answers({ trivial: 0, coding: 0.7, decision: 0.9, sensitive: 0 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "frontier", reason: "coding" });
});

test("sensitive escalates to frontier and marks escalation over cheaper picks", () => {
	const a = decide({ answers: answers({ trivial: 0, coding: 0.2, decision: 0.2, sensitive: 0.9 }), config: cfg });
	expect(a).toMatchObject({ kind: "route", route: "frontier", escalated: false, reason: "sensitive" });
	const b = decide({ answers: answers({ trivial: 0.9, coding: 0.1, decision: 0.1, sensitive: 0.9 }), config: cfg });
	expect(b).toMatchObject({ kind: "route", route: "frontier", escalated: true, reason: "sensitive" });
});

test("escalate.sensitive=false lets the cascade proceed", () => {
	const d = decide({
		answers: answers({ trivial: 0.9, coding: 0.1, decision: 0.1, sensitive: 0.9 }),
		config: { ...cfg, escalate: { ...cfg.escalate, sensitive: false } },
	});
	expect(d).toMatchObject({ kind: "route", route: "small", reason: "trivial" });
});

test("low driving confidence escalates small and laya to frontier", () => {
	const a = decide({ answers: answers({ trivial: 0.74, coding: 0.08, decision: 0.1, sensitive: 0 }, { trivial: 0.5 }), config: cfg });
	expect(a).toMatchObject({ kind: "route", route: "frontier", escalated: true, reason: "low-confidence" });
	const b = decide({ answers: answers({ trivial: 0.05, coding: 0.3, decision: 0.85, sensitive: 0 }, { decision: 0.6 }), config: cfg });
	expect(b).toMatchObject({ kind: "route", route: "frontier", escalated: true, reason: "low-confidence" });
});

test("driving confidence exactly at minConfidence is accepted", () => {
	const d = decide({ answers: answers({ trivial: 0.74, coding: 0.08, decision: 0.1, sensitive: 0 }, { trivial: 0.7 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "small", reason: "trivial" });
});

test("frontier routes are never confidence-escalated (already max)", () => {
	const d = decide({ answers: answers({ trivial: 0, coding: 0.55, decision: 0.1, sensitive: 0 }, { coding: 0.3 }), config: cfg });
	expect(d).toMatchObject({ kind: "route", route: "frontier", reason: "coding" });
});

test("context guard: small kept at/below cap, escalated above", () => {
	const at = decide({ answers: answers({ trivial: 0.9, coding: 0, decision: 0, sensitive: 0 }), config: cfg, contextTokens: 24000 });
	expect(at).toMatchObject({ kind: "route", route: "small", reason: "trivial" });
	const above = decide({ answers: answers({ trivial: 0.9, coding: 0, decision: 0, sensitive: 0 }), config: cfg, contextTokens: 24001 });
	expect(above).toMatchObject({ kind: "route", route: "frontier", escalated: true, reason: "context-guard" });
});

test("configurable signal cut-offs are respected", () => {
	const c = { ...cfg, signals: { ...cfg.signals, coding: 0.6, trivial: 0.8 } };
	expect(decide({ answers: answers({ trivial: 0, coding: 0.55, decision: 0, sensitive: 0 }), config: c })).toMatchObject({ route: "frontier", reason: "default-frontier" });
	expect(decide({ answers: answers({ trivial: 0.74, coding: 0, decision: 0, sensitive: 0 }), config: c })).toMatchObject({ route: "frontier", reason: "default-frontier" });
	expect(decide({ answers: answers({ trivial: 0.85, coding: 0, decision: 0, sensitive: 0 }), config: c })).toMatchObject({ route: "small" });
});

test("invalid: any required signal answer missing", () => {
	const d = decide({ answers: answers({ trivial: 0.9, coding: 0 }), config: cfg }); // decision + sensitive missing
	expect(d).toMatchObject({ kind: "invalid" });
});

test("invalid: noul value not a finite number", () => {
	const a = answers({ trivial: 0.9, coding: 0.1, decision: 0.1, sensitive: 0 });
	a.coding = { type: "noul", noul: Number.NaN, confidence: 0.9 };
	expect(decide({ answers: a, config: cfg })).toMatchObject({ kind: "invalid" });
});

test("signals carry noul values for observability", () => {
	const d = decide({ answers: answers({ trivial: 0.74, coding: 0.08, decision: 0.33, sensitive: 0.05 }), config: cfg });
	expect((d as any).signals).toEqual({ trivial: 0.74, coding: 0.08, decision: 0.33, sensitive: 0.05 });
});

test("buildRoutingState truncates to a single request field", () => {
	const s = buildRoutingState("x".repeat(5000), 4000);
	expect(Object.keys(s)).toEqual(["request"]);
	expect(s.request.length).toBe(4000);
});

test("buildLayaOnlyQuestions: explicit short options become a choice", () => {
	const q = buildLayaOnlyQuestions("Use jest or vitest for this repo?");
	const answer = q!.answer as { type: string; instructions: string; criteria: Record<string, string> };
	expect(answer.type).toBe("choice");
	expect(Object.keys(answer.criteria).sort()).toEqual(["jest", "vitest"]);
	expect(answer.instructions).toContain("request");
});

test("buildLayaOnlyQuestions: yes/no question becomes noul", () => {
	const q = buildLayaOnlyQuestions("Is the CI gate red right now?");
	expect((q!.answer as { type: string }).type).toBe("noul");
});

test("buildLayaOnlyQuestions: generative prompts return null", () => {
	expect(buildLayaOnlyQuestions("Write a poem about routing")).toBe(null);
	expect(buildLayaOnlyQuestions("Explain how transformers work")).toBe(null);
});

test("buildLayaOnlyQuestions: more than four options returns null", () => {
	const q = buildLayaOnlyQuestions("Pick a, b, c, d, or e as the answer?");
	expect(q).toBe(null);
});

test("ROUTING_QUESTIONS is the v2 noul set", () => {
	expect(Object.keys(ROUTING_QUESTIONS).sort()).toEqual(["coding", "decision", "sensitive", "trivial"]);
	for (const q of Object.values(ROUTING_QUESTIONS)) {
		expect((q as { type: string }).type).toBe("noul");
	}
});
