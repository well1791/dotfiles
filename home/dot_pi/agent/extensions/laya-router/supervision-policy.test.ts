import { test, expect } from "bun:test";
import {
	REPRESENTATION_QUESTIONS,
	buildGateState,
	validateVerdict,
	effectiveVerdict,
	renderVerdict,
} from "./supervision-policy";

test("REPRESENTATION_QUESTIONS matches spec §5 exactly", () => {
	expect(REPRESENTATION_QUESTIONS).toEqual({
		representation: {
			type: "choice",
			instructions: "How should this tool output be represented in the model's context for the current task?",
			criteria: {
				verbatim:
					"Contains information the task still needs exactly: code being changed, exact values or paths, errors under investigation, file contents likely to be referenced again.",
				compress:
					"Partially relevant; the head carries what matters and the rest is bulk (long listings, logs with a few relevant lines).",
				digest:
					"Irrelevant to the current task: empty or near-empty results, boilerplate, exhaustive listings of untouched files, duplicate output.",
			},
		},
	});
});

test("buildGateState truncates only the output field", () => {
	const long = "z".repeat(5000);
	const s = buildGateState("do the task", "bash", long, 4000);
	expect(s).toEqual({ task: "do the task", tool: "bash", output: "z".repeat(4000) });
	expect(buildGateState("t", "read", "short", 4000)).toEqual({ task: "t", tool: "read", output: "short" });
});

test("validateVerdict accepts each choice at or above threshold", () => {
	for (const v of ["verbatim", "compress", "digest"] as const) {
		expect(validateVerdict({ type: "choice", choice: v, confidence: 0.7 }, 0.7)).toBe(v);
		expect(validateVerdict({ type: "choice", choice: v, confidence: 0.9 }, 0.7)).toBe(v);
	}
});

test("validateVerdict rejects low confidence, unknown choice, wrong type, malformed shapes", () => {
	expect(validateVerdict({ type: "choice", choice: "digest", confidence: 0.69 }, 0.7)).toBeNull();
	expect(validateVerdict({ type: "choice", choice: "shred", confidence: 0.99 }, 0.7)).toBeNull();
	expect(validateVerdict({ type: "noul", noul: 0.9, confidence: 0.99 }, 0.7)).toBeNull();
	expect(validateVerdict(null, 0.7)).toBeNull();
	expect(validateVerdict({}, 0.7)).toBeNull();
	expect(validateVerdict({ type: "choice", choice: "digest" }, 0.7)).toBeNull();
	expect(validateVerdict({ type: "choice", choice: "digest", confidence: "high" }, 0.7)).toBeNull();
});

test("effectiveVerdict rule 1: bytes at or below minBytes is verbatim regardless of verdict", () => {
	const small = "a".repeat(2048); // exactly minBytes in utf8
	expect(effectiveVerdict(small, "digest", 2048, 1500)).toBe("verbatim");
	expect(effectiveVerdict(small, null, 2048, 1500)).toBe("verbatim");
	const justOver = "b".repeat(2049);
	expect(effectiveVerdict(justOver, "digest", 2048, 1500)).toBe("digest");
});

test("effectiveVerdict rule 3: null verdict is verbatim", () => {
	expect(effectiveVerdict("c".repeat(3000), null, 2048, 1500)).toBe("verbatim");
});

test("effectiveVerdict rule 4: compress shorter than head chars is verbatim; at or above stays compress", () => {
	expect(effectiveVerdict("d".repeat(2049), "compress", 2048, 1500)).toBe("compress"); // passes rule 1, chars ≥ head
	expect(effectiveVerdict("e".repeat(1600), "compress", 0, 1500)).toBe("compress");
	expect(effectiveVerdict("f".repeat(1499), "compress", 0, 1500)).toBe("verbatim"); // chars < head
	expect(effectiveVerdict("g".repeat(1500), "compress", 0, 1500)).toBe("compress"); // chars == head: not smaller
});

test("effectiveVerdict: digest is never demoted by rule 4", () => {
	expect(effectiveVerdict("h".repeat(100), "digest", 0, 1500)).toBe("digest");
});

test("renderVerdict compress: head verbatim plus exact marker", () => {
	const text = "A".repeat(2000);
	expect(renderVerdict("bash", text, false, "compress", 1500)).toBe(
		"A".repeat(1500) +
			"[…laya: compressed, 500 chars total omitted; re-run the tool or read the source for the full output]",
	);
});

test("renderVerdict digest: exact single-line body with ok status", () => {
	expect(renderVerdict("bash", "x".repeat(3000), false, "digest", 1500)).toBe(
		"[laya: bash ok — output classified irrelevant to the current task; 3000 chars omitted]",
	);
});

test("renderVerdict digest: error status word reflects isError", () => {
	expect(renderVerdict("read", "y".repeat(100), true, "digest", 1500)).toBe(
		"[laya: read error — output classified irrelevant to the current task; 100 chars omitted]",
	);
});

test("renderVerdict counts chars, not bytes (multibyte text)", () => {
	const text = "é".repeat(10); // 10 chars, 20 utf8 bytes
	expect(renderVerdict("bash", text, false, "digest", 1500)).toBe(
		"[laya: bash ok — output classified irrelevant to the current task; 10 chars omitted]",
	);
});
