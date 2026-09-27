/**
 * Pure representation-gating policy (spec 2026-09-26 §4–§6): the laya question
 * set, classification state construction, answer validation, the deterministic
 * verdict rules, and the rendering of compressed/digested tool output.
 * No I/O, no pi imports.
 */
import type { Verdict } from "./verdict-cache";

/** Single choice question, wording load-bearing (spec §5). */
export const REPRESENTATION_QUESTIONS = {
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
} as const;

const VALID_VERDICTS: ReadonlySet<string> = new Set(["verbatim", "compress", "digest"]);

/** Classification state: task anchor + tool + output capped at maxChars (spec §5). */
export function buildGateState(task: string, tool: string, output: string, maxChars: number): {
	task: string;
	tool: string;
	output: string;
} {
	return { task, tool, output: output.length > maxChars ? output.slice(0, maxChars) : output };
}

/**
 * Validate a laya answer into a verdict. Non-null only for a choice answer
 * whose choice is a known verdict with finite confidence ≥ minConfidence
 * (spec §4: low-confidence → verbatim fallback).
 */
export function validateVerdict(answer: unknown, minConfidence: number): Verdict | null {
	if (typeof answer !== "object" || answer === null) return null;
	const a = answer as { type?: unknown; choice?: unknown; confidence?: unknown };
	if (a.type !== "choice") return null;
	if (typeof a.choice !== "string" || !VALID_VERDICTS.has(a.choice)) return null;
	if (typeof a.confidence !== "number" || !Number.isFinite(a.confidence)) return null;
	if (a.confidence < minConfidence) return null;
	return a.choice as Verdict;
}

/**
 * Deterministic verdict rules (spec §6):
 * 1. utf8 bytes ≤ minBytes → verbatim (never consult laya — defensive here).
 * 3. no verdict (null/undefined/evicted) → verbatim.
 * 4. compress on a result smaller than compressHeadChars (chars) → verbatim.
 */
export function effectiveVerdict(
	text: string,
	verdict: Verdict | null,
	minBytes: number,
	compressHeadChars: number,
): Verdict {
	if (Buffer.byteLength(text, "utf8") <= minBytes) return "verbatim";
	if (verdict === null || verdict === undefined) return "verbatim";
	if (verdict === "compress" && text.length < compressHeadChars) return "verbatim";
	return verdict;
}

/**
 * Render a gated representation (spec §4). Exact copy: the recovery pointers
 * tell the model how to get the content back.
 */
export function renderVerdict(
	toolName: string,
	text: string,
	isError: boolean,
	verdict: "compress" | "digest",
	compressHeadChars: number,
): string {
	const status = isError ? "error" : "ok";
	if (verdict === "compress") {
		const head = text.slice(0, compressHeadChars);
		const omitted = text.length - head.length;
		return `${head}[…laya: compressed, ${omitted} chars total omitted; re-run the tool or read the source for the full output]`;
	}
	return `[laya: ${toolName} ${status} — output classified irrelevant to the current task; ${text.length} chars omitted]`;
}
