/**
 * ask_laya tool — the Level 10 "ask_jev" pattern (ten-levels-of-jev) ported
 * onto pi's classifier registry and the laya provider (laya-serve on
 * 127.0.0.1:8082, registered by laya-provider.ts).
 *
 * One tool. The agent passes its own state, paths for code to read, a command
 * for code to run, and its question block. Code assembles one state and makes
 * one laya classify call. A command runs through the Level 6 bash gate first
 * (irreversible/destructive blocks, gate fails closed on classifier errors).
 * Over the token budget, the error names the parts and a split that fits.
 * Questions use pi's classifier shapes (choice/score/bool — bool answers come
 * back as `probability`); jev-style shapes are rejected with conversion
 * guidance. Every call lands in a spend ledger reported at agent_end.
 *
 * Load: pi -e ~/.pi/agent/extensions/ask-laya.ts --tools read,ask_laya
 */

import { exec } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { Type } from "typebox";
import type { ClassifierQuestion } from "@earendil-works/pi-ai";

// ---------------------------------------------------------------------------
// Ported constants (source: ten-levels-of-jev)
// ---------------------------------------------------------------------------

/** assemble.ts: STATE_TOKEN_BUDGET = LIMITS.TOTAL_TOKEN_BUDGET - 4000 (= 6000 slim). */
export const STATE_TOKEN_BUDGET = 6000;
/** assemble.ts: a single situation, not a corpus. */
export const MAX_FILES_PER_CALL = 20;
/** assemble.ts: the agent's own note is for context, not pasting content. */
export const MAX_OWN_STATE_CHARS = 8000;
/** ask-jev.ts extension: COMMAND_TIMEOUT_MS. */
export const COMMAND_TIMEOUT_MS = 60_000;
/** ask-jev.ts extension: MAX_OUTPUT_CHARS. */
export const MAX_OUTPUT_CHARS = 200_000;
/** A file that alone busts the call budget is skipped, not truncated (slim port of read-state/prune limits). */
export const MAX_FILE_CHARS = STATE_TOKEN_BUDGET * 4;

/** bash-gate.ts: BASH_THRESHOLDS. */
export const GATE_THRESHOLDS = { irreversible: 0.6, destructive: 0.7 } as const;

/** bash-gate.ts: BLOCK_NOTICE, copied verbatim. */
export const BLOCK_NOTICE =
	"This block is final. Do not try to work around it with another command, another tool, a different path, or an encoding that does the same thing. Stop and tell the user what was blocked and why.";

/** The spike's approved default model (laya/english). */
export const DEFAULT_MODEL: "english" | "typed-decisions" = "english";

export const NUDGE =
	"You have ask_laya. When you need a classification, a risk score, or a yes or no with a confidence, " +
	"prefer it over reasoning it out yourself. Give it paths or a command instead of pasting content. " +
	"It answers locally in milliseconds and costs nothing.";

export const ASK_LAYA_DESCRIPTION =
	"Ask the local laya classifier typed questions (choice / score / bool) about state you describe, files at `paths`, or the output of a `command`. " +
	"Code assembles the state, runs the command through a safety gate, and makes one call; you see only the typed answers with confidences. " +
	"questions_json is an object keyed by question id; each question is {type:\"choice\", instructions, criteria:{label:meaning...}}, " +
	"{type:\"score\", instructions, criteria:[lowest...highest]}, or {type:\"bool\", instructions, criteria:{true:..., false:...}}. " +
	"Pass paths or command instead of pasting content; your own state is for short context only.";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The slim ClassifyFn: one laya call, state + questions in, answers out. */
export type ClassifyFn = (
	state: Record<string, unknown>,
	questions: Record<string, ClassifierQuestion>,
) => Promise<{ answers: Record<string, unknown>; stopReason: string; errorMessage?: string }>;

export interface CommandOutput {
	command: string;
	exit_code: number | null;
	stdout: string;
	stderr: string;
}

export type RunCommand = (command: string, cwd: string) => Promise<CommandOutput>;

export interface AssembleInput {
	state?: string | Record<string, unknown>;
	paths?: string[];
	command?: string;
}

export interface Skipped {
	path: string;
	reason: string;
}

export interface Assembled {
	state: Record<string, unknown>;
	summary: {
		own_fields: string[];
		files: string[];
		output: string | null;
		skipped: Skipped[];
		tokens: number;
	};
}

export interface GateDecision {
	block: boolean;
	reason: string;
}

export class AskStateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AskStateError";
	}
}

// ---------------------------------------------------------------------------
// Question parsing (pi classifier shapes; jev shapes rejected with guidance)
// ---------------------------------------------------------------------------

const JEV_GUIDANCE =
	'Unsupported question shape. pi classifier questions use {type:"choice"|"score"|"bool", instructions, criteria}: ' +
	'choice maps each label to what it means (criteria object, not an options list), score lists level descriptions lowest-first, ' +
	'bool uses criteria {true, false} (answers come back as `probability`, the jev noul). See docs/codemode.md §Classify.';

function validateOne(id: string, q: unknown, warnings: string[]): void {
	if (!q || typeof q !== "object" || Array.isArray(q)) throw new Error(`question "${id}" must be an object with type, instructions, criteria. ${JEV_GUIDANCE}`);
	const question = q as Record<string, unknown>;
	if (typeof question.instructions !== "string" || !question.instructions.trim()) {
		throw new Error(`question "${id}" needs a non-empty instructions string`);
	}
	switch (question.type) {
		case "choice": {
			const criteria = question.criteria as unknown;
			if (!criteria || typeof criteria !== "object" || Array.isArray(criteria)) throw new Error(`choice question "${id}" needs a criteria object mapping each label to its meaning. ${JEV_GUIDANCE}`);
			const labels = Object.keys(criteria as object);
			if (!labels.length) throw new Error(`choice question "${id}" has an empty criteria map`);
			for (const label of labels) {
				if (typeof (criteria as Record<string, unknown>)[label] !== "string" || !String((criteria as Record<string, unknown>)[label]).trim()) {
					throw new Error(`choice question "${id}" needs a description for label "${label}"`);
				}
			}
			if (labels.length > MAX_FILES_PER_CALL) {
				warnings.push(`choice question "${id}" has ${labels.length} options; laya answers best with ${MAX_FILES_PER_CALL} or fewer — narrow the criteria`);
			}
			return;
		}
		case "score": {
			const criteria = question.criteria as unknown;
			if (!Array.isArray(criteria) || criteria.length < 2 || criteria.some((level) => typeof level !== "string" || !level.trim())) {
				throw new Error(`score question "${id}" needs criteria: an array of at least two non-empty level descriptions, lowest first`);
			}
			return;
		}
		case "bool": {
			const criteria = question.criteria as Record<string, unknown> | undefined;
			if (!criteria || typeof criteria !== "object" || typeof criteria.true !== "string" || typeof criteria.false !== "string") {
				throw new Error(`bool question "${id}" needs criteria {true: "...", false: "..."}`);
			}
			return;
		}
		default:
			throw new Error(`question "${id}" has unsupported type ${JSON.stringify(question.type)}. ${JEV_GUIDANCE}`);
	}
}

/** Parse and validate questions_json into pi classifier questions plus non-fatal warnings. */
export function parseQuestions(json: string): { questions: Record<string, ClassifierQuestion>; warnings: string[] } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(json);
	} catch (err) {
		throw new Error(`questions_json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error("questions_json must be an object keyed by question id");
	}
	const warnings: string[] = [];
	for (const [id, q] of Object.entries(parsed as Record<string, unknown>)) validateOne(id, q, warnings);
	return { questions: parsed as Record<string, ClassifierQuestion>, warnings };
}

// ---------------------------------------------------------------------------
// State parsing / assembly (slim port of level10 ask.ts + assemble.ts)
// ---------------------------------------------------------------------------

/** A JSON string becomes structured state; anything else is sent as the string it is. */
export function parseState(raw: string | Record<string, unknown>): Record<string, unknown> | string {
	if (typeof raw !== "string") return raw;
	const t = raw.trim();
	if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
		try {
			return JSON.parse(t) as Record<string, unknown>;
		} catch {
			/* not JSON after all, send the text */
		}
	}
	return raw;
}

/** Roughly four characters per token, same estimate as the reference. */
export const tokensOf = (text: string) => Math.ceil(text.length / 4);

const fmtK = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(t)) + " tokens";

interface Part {
	name: string;
	tokens: number;
	kind: "own" | "file" | "output";
}

/** Greedy first fit, largest first (assemble.ts suggestSplit). */
export function suggestSplit(parts: Part[], budget: number): Part[][] {
	const bins: { total: number; items: Part[] }[] = [];
	for (const part of [...parts].sort((a, b) => b.tokens - a.tokens)) {
		const bin = bins.find((b) => b.total + part.tokens <= budget);
		if (bin) {
			bin.items.push(part);
			bin.total += part.tokens;
		} else bins.push({ total: part.tokens, items: [part] });
	}
	return bins.map((b) => b.items);
}

function describe(parts: Part[]): string {
	const files = parts.filter((p) => p.kind === "file").map((p) => p.name);
	const bits: string[] = [];
	if (parts.some((p) => p.kind === "own")) bits.push("your state");
	if (files.length) bits.push(`paths [${files.join(", ")}]`);
	if (parts.some((p) => p.kind === "output")) bits.push("the command");
	const total = parts.reduce((n, p) => n + p.tokens, 0);
	return `${bits.join(" + ")} (${fmtK(total)})`;
}

/** The message the agent reads when one call cannot hold the situation (assemble.ts overflowMessage). */
export function overflowMessage(parts: Part[], budget: number): string {
	const total = parts.reduce((n, p) => n + p.tokens, 0);
	const groups = suggestSplit(parts, budget);
	const oversize = parts.filter((p) => p.tokens > budget);
	const lines = [
		`ask_laya: the state is ${fmtK(total)}, the limit per call is ${fmtK(budget)}.`,
		`Parts: ${[...parts]
			.sort((a, b) => b.tokens - a.tokens)
			.map((p) => `${p.name} ${fmtK(p.tokens)}`)
			.join(", ")}.`,
	];
	if (oversize.length) {
		lines.push(
			`Too large for any single call: ${oversize.map((p) => p.name).join(", ")}. Narrow it (a smaller file, a command with less output) or leave it out.`,
		);
	}
	if (groups.length > 1 && !oversize.length) {
		lines.push(`Split into ${groups.length} calls with the same questions_json: ${groups.map((g, i) => `call ${i + 1}: ${describe(g)}`).join("; ")}.`);
	}
	return lines.join(" ");
}

const SKIP_DIRS = new Set(["node_modules", ".git", ".sessions", "dist", "build", "coverage", ".pi"]);
const GLOB_CHARS = /[*?[\]{}]/;
const BINARY_RE = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|tgz|woff2?|ttf|mp[34]|mov|lock)$/i;
const looksBinary = (buf: Uint8Array) => buf.subarray(0, 8192).includes(0);

/** Slim port of prune.ts expandPatterns using Bun.Glob (pi runs on bun). */
async function expandPatterns(patterns: string[], cwd: string): Promise<string[]> {
	const out = new Set<string>();
	for (const raw of patterns) {
		const pattern = raw.trim();
		if (!pattern) continue;
		if (GLOB_CHARS.test(pattern)) {
			for await (const p of new Bun.Glob(pattern).scan({ cwd })) out.add(p);
			continue;
		}
		const full = isAbsolute(pattern) ? pattern : resolve(cwd, pattern);
		let info;
		try {
			info = await stat(full);
		} catch {
			out.add(pattern); // let the read step report it
			continue;
		}
		if (info.isFile()) {
			out.add(pattern);
			continue;
		}
		for await (const p of new Bun.Glob(`${pattern.replace(/\/+$/, "")}/**/*`).scan({ cwd })) out.add(p);
	}
	return [...out].sort();
}

/**
 * Build the state (slim port of assemble.ts): own state first, then files
 * (pruned: skip dirs, binaries, oversize, cap 20), then the command's output.
 * Nothing is truncated: over the budget the call is refused with a split.
 */
export async function assembleState(input: AssembleInput, cwd: string, run: RunCommand): Promise<Assembled> {
	const own = input.state === undefined || (typeof input.state === "string" && input.state.trim() === "") ? {} : parseState(input.state);
	const base: Record<string, unknown> = typeof own === "string" ? { text: own } : Array.isArray(own) ? { items: own } : { ...own };
	const ownText = JSON.stringify(base);
	if (ownText.length > MAX_OWN_STATE_CHARS) {
		throw new AskStateError(
			`ask_laya: your state is ${fmtK(tokensOf(ownText))}; the limit for your own state is ${fmtK(tokensOf("x".repeat(MAX_OWN_STATE_CHARS)))}. Do not paste file contents or command output; pass paths or command instead and code fetches them.`,
		);
	}
	const parts: Part[] = [];
	if (Object.keys(base).length) parts.push({ name: "your state", tokens: tokensOf(ownText), kind: "own" });

	const skipped: Skipped[] = [];
	const files: Record<string, string> = {};
	if (input.paths?.length) {
		const expanded = await expandPatterns(input.paths, cwd);
		for (const path of expanded) {
			const full = isAbsolute(path) ? path : resolve(cwd, path);
			const rel = relative(cwd, full);
			if (rel.startsWith("..")) {
				skipped.push({ path, reason: "outside the repo" });
				continue;
			}
			if (rel.split(sep).some((part) => SKIP_DIRS.has(part))) {
				skipped.push({ path, reason: "skipped directory" });
				continue;
			}
			let info;
			try {
				info = await stat(full);
			} catch {
				skipped.push({ path, reason: "not found" });
				continue;
			}
			if (!info.isFile()) continue;
			if (info.size === 0) {
				skipped.push({ path, reason: "empty" });
				continue;
			}
			if (info.size > MAX_FILE_CHARS) {
				skipped.push({ path, reason: `too large, ${info.size} bytes` });
				continue;
			}
			if (BINARY_RE.test(path)) {
				skipped.push({ path, reason: "binary or lock file" });
				continue;
			}
			if (Object.keys(files).length >= MAX_FILES_PER_CALL) {
				skipped.push({ path, reason: `over the ${MAX_FILES_PER_CALL} file cap; narrow the pattern` });
				continue;
			}
			try {
				const buf = await readFile(full);
				if (looksBinary(buf)) {
					skipped.push({ path, reason: "binary" });
					continue;
				}
				const content = buf.toString("utf8");
				files[path] = content;
				parts.push({ name: path, tokens: tokensOf(content), kind: "file" });
			} catch (err) {
				skipped.push({ path, reason: err instanceof Error ? err.message : String(err) });
			}
		}
		if (Object.keys(files).length > MAX_FILES_PER_CALL) {
			throw new AskStateError(
				`ask_laya: paths expanded to more than ${MAX_FILES_PER_CALL} files. This tool judges one situation in one call. Narrow the paths or make one call per file.`,
			);
		}
	}

	let output: CommandOutput | null = null;
	if (input.command?.trim()) {
		output = await run(input.command.trim(), cwd);
		parts.push({ name: `output of \`${output.command}\``, tokens: tokensOf(output.stdout + output.stderr), kind: "output" });
	}

	if (!parts.length) {
		if (skipped.length) {
			// Every path was pruned (oversize, binary, not found...). Name them so the
			// agent can act; nothing was silently truncated.
			throw new AskStateError(
					`ask_laya: nothing usable to judge — every path was skipped: ${skipped.map((s) => `${s.path} (${s.reason})`).join("; ")}. ` +
						`A single file over the ${fmtK(STATE_TOKEN_BUDGET)} call budget cannot be judged whole. Split it into parts with the same questions_json, excerpt the relevant section via command (e.g. \`head -n 40 <path>\`), or pass a short state instead.`,
			);
		}
		throw new AskStateError("ask_laya: nothing to judge. Pass state, paths, or command.");
	}

	const total = parts.reduce((n, p) => n + p.tokens, 0);
	if (total > STATE_TOKEN_BUDGET) throw new AskStateError(overflowMessage(parts, STATE_TOKEN_BUDGET));

	const state: Record<string, unknown> = { ...base };
	if (Object.keys(files).length) state.files = files;
	if (output) state.output = output;

	return {
		state,
		summary: {
			own_fields: Object.keys(base),
			files: Object.keys(files),
			output: output ? `${output.command}, exit ${output.exit_code}, ${fmtK(tokensOf(output.stdout + output.stderr))}` : null,
			skipped,
			tokens: total,
		},
	};
}

/** Run a command for the state (ask-jev.ts runCommand). Output is captured, never streamed to the agent. */
export function runCommand(command: string, cwd: string): Promise<CommandOutput> {
	return new Promise((resolve) => {
		exec(
			command,
			{ cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_CHARS * 4, env: { ...process.env, CI: "1" } },
			(err, stdout, stderr) => {
				const code = err && typeof (err as unknown as { code?: unknown }).code === "number" ? (err as unknown as { code: number }).code : err ? null : 0;
				resolve({
					command,
					exit_code: code,
					stdout: String(stdout).slice(0, MAX_OUTPUT_CHARS),
					stderr: String(stderr).slice(0, MAX_OUTPUT_CHARS),
				});
			},
		);
	});
}

// ---------------------------------------------------------------------------
// Bash gate (level06 bash-gate.ts): one classify call, two questions
// ---------------------------------------------------------------------------

const GATE_QUESTIONS: Record<string, ClassifierQuestion> = {
	effect: {
		type: "choice",
		instructions: "What does running `command` in `cwd` do to the machine?",
		criteria: {
			read_only: "Lists, reads, searches, tests, builds into a scratch directory; nothing durable changes",
			reversible: "Changes files or state that git or a reinstall can restore: edits, installs, generated output",
			irreversible: "Deletes or overwrites things with no way back: removing directories, force pushing, dropping data, rewriting history",
		},
	},
	destructive_intent: {
		type: "bool",
		instructions: "Does `command` aim to remove or wipe something rather than build or inspect?",
		criteria: {
			true: "rm -rf, drop, purge, force, reset --hard, truncate, overwriting real data",
			false: "Reading, listing, testing, installing, generating, or editing in place",
		},
	},
};

/** Block or allow; a classifier error blocks too — the gate fails closed. */
export async function gateCommand(command: string, cwd: string, classify: ClassifyFn): Promise<GateDecision> {
	let result: Awaited<ReturnType<ClassifyFn>>;
	try {
		result = await classify({ command, cwd }, GATE_QUESTIONS);
	} catch (err) {
		return { block: true, reason: `ask_laya gate failed closed (classifier error: ${err instanceof Error ? err.message : String(err)}). ${BLOCK_NOTICE}` };
	}
	if (result.stopReason === "error") {
		return { block: true, reason: `ask_laya gate failed closed (classifier stopReason "error"${result.errorMessage ? `: ${result.errorMessage}` : ""}). ${BLOCK_NOTICE}` };
	}
	const effect = result.answers.effect as { choice?: string; confidence?: number } | undefined;
	const destructive = result.answers.destructive_intent as { probability?: number } | undefined;
	if (!effect || typeof effect.choice !== "string" || typeof effect.confidence !== "number" || !destructive || typeof destructive.probability !== "number") {
		return { block: true, reason: `ask_laya gate failed closed (malformed gate answers). ${BLOCK_NOTICE}` };
	}
	if (effect.choice === "irreversible" && effect.confidence >= GATE_THRESHOLDS.irreversible) {
		return {
			block: true,
			reason: `irreversible (${effect.confidence.toFixed(2)}): nothing would restore what this removes or overwrites. ${BLOCK_NOTICE} ask_laya commands should only read.`,
		};
	}
	if (destructive.probability >= GATE_THRESHOLDS.destructive) {
		return {
			block: true,
			reason: `destructive intent (${destructive.probability.toFixed(2)}): this command aims to wipe something. ${BLOCK_NOTICE} ask_laya commands should only read.`,
		};
	}
	return { block: false, reason: `${effect.choice} (${effect.confidence.toFixed(2)}), destructive ${destructive.probability.toFixed(2)}` };
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

interface Ledger {
	calls: number;
	questions: number;
	input_tokens: number;
	output_tokens: number;
}

const emptyLedger = (): Ledger => ({ calls: 0, questions: 0, input_tokens: 0, output_tokens: 0 });

const ok = (payload: unknown) => ({ content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], details: payload });

const SERVER_DOWN_HINT =
	"laya-serve looks unreachable — check `systemctl --user status laya-serve` (it should listen on 127.0.0.1:8082) and that the laya provider extension is loaded.";

/** First words of the NUDGE — a marker that cannot appear in the prompt for unrelated reasons (tool declarations mention "ask_laya", never this sentence). */
const NUDGE_MARKER = "You have ask_laya";

export default function askLaya(pi: any) {
	let ledger = emptyLedger();

	pi.on("before_agent_start", async (event: any) => {
		const systemPrompt = event.systemPrompt ?? "";
		if (systemPrompt.includes(NUDGE_MARKER)) return;
		return { systemPrompt: `${systemPrompt}\n\n${NUDGE}` };
	});

	pi.registerTool({
		name: "ask_laya",
		label: "Ask Laya",
		description: ASK_LAYA_DESCRIPTION,
		parameters: Type.Object({
			questions_json: Type.String({ description: "The question block, a JSON object keyed by question id" }),
			state: Type.Optional(Type.String({ description: "Your own state: plain text, or a JSON object as a string. Short. Not for pasting files or output." })),
			paths: Type.Optional(Type.Array(Type.String(), { description: "Files or globs for code to read into files[\"path\"]. Up to 20 files." })),
			command: Type.Optional(Type.String({ description: "A command for code to run in the repo; its result goes into output. Runs through the bash gate." })),
			model: Type.Optional(Type.Union([Type.Literal("english"), Type.Literal("typed-decisions")], { description: "laya model (default english)" })),
		}),
		async execute(_id: string, p: any, signal: AbortSignal | undefined, _u: any, ctx: any) {
			try {
				const { questions, warnings } = parseQuestions(p.questions_json);
				const classify: ClassifyFn = async (state, qs) => {
					const model = ctx.modelRegistry.findOfType("classifier", "laya", p.model ?? DEFAULT_MODEL);
					if (!model) throw new AskStateError('no laya classifier model found — is the laya provider extension loaded? (pi.registerProvider "laya")');
					const result = await ctx.modelRegistry.classify(model, { state, questions: qs }, { signal });
					return { answers: result.answers as Record<string, unknown>, stopReason: result.stopReason, errorMessage: result.errorMessage };
				};
				const run: RunCommand = async (command, cwd) => {
					const gate = await gateCommand(command, cwd, classify);
					if (gate.block) throw new AskStateError(`ask_laya: the command was refused by the bash gate: ${gate.reason}`);
					return runCommand(command, cwd);
				};
				const { state, summary } = await assembleState({ state: p.state, paths: p.paths, command: p.command }, ctx.cwd, run);
				const result = await classify(state, questions);
				if (result.stopReason === "error") {
					const message = `ask_laya error: classifier stopReason "error"${result.errorMessage ? `: ${result.errorMessage}` : ""}. ${SERVER_DOWN_HINT}`;
					pi.appendEntry?.("laya-error", { message });
					return { content: [{ type: "text", text: message }], isError: true };
				}
				const usageTokens = summary.tokens;
				ledger = { calls: ledger.calls + 1, questions: ledger.questions + Object.keys(questions).length, input_tokens: ledger.input_tokens + usageTokens, output_tokens: ledger.output_tokens };
				const allWarnings = [...warnings, ...summary.skipped.map((s) => `skipped ${s.path}: ${s.reason}`)];
				return ok({ answers: result.answers, state_summary: summary, usage: { estimated_input_tokens: usageTokens }, model: `laya/${p.model ?? DEFAULT_MODEL}`, warnings: allWarnings });
			} catch (err) {
				const text = err instanceof AskStateError ? err.message : `ask_laya error: ${err instanceof Error ? err.message : String(err)}`;
				pi.appendEntry?.("laya-error", { message: text });
				return { content: [{ type: "text", text }], isError: true };
			}
		},
	});

	pi.on("agent_end", async () => {
		if (ledger.calls) pi.appendEntry?.("laya-ledger", { ...ledger, note: "ask_laya spend this run" });
	});
}
