/**
 * Acceptance tests for the ask_laya tool extension (Level 10 pattern on the
 * laya classifier).
 *
 * Source-only: excluded from deploy via .chezmoiignore (deployed .ts files in
 * ~/.pi/agent/extensions load as extensions, and the bun:test import would
 * break every pi session).
 *
 * All cases are offline: the classifier is a mocked ClassifyFn, the registry
 * is a stub, and no network, key material, or live laya-serve instance is
 * touched.
 */

import { describe, expect, test, mock } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// pi maps `import { Type } from "typebox"` to its own bundled copy at
// extension load (docs/extensions.md §imports), but plain `bun test` has no
// such mapping and no node_modules above this file. Stub it before the
// dynamic import below; the parameters schema is never compiled in these
// offline tests (execute is called directly).
mock.module("typebox", () => ({
	Type: {
		Object: (properties: unknown) => ({ type: "object", properties }),
		String: (description?: unknown) => ({ type: "string", description }),
		Optional: (schema: unknown) => schema,
		Array: (items: unknown) => ({ type: "array", items }),
		Union: (anyOf: unknown[]) => ({ anyOf }),
		Literal: (value: unknown) => ({ const: value }),
	},
}));

const mod = await import("./ask-laya.ts");
const {
	ASK_LAYA_DESCRIPTION,
	BLOCK_NOTICE,
	COMMAND_TIMEOUT_MS,
	DEFAULT_MODEL,
	GATE_THRESHOLDS,
	MAX_FILES_PER_CALL,
	MAX_OWN_STATE_CHARS,
	MAX_OUTPUT_CHARS,
	NUDGE,
	STATE_TOKEN_BUDGET,
	assembleState,
	gateCommand,
	parseQuestions,
	parseState,
} = mod;
const askLaya = mod.default;
import type { AssembleInput, ClassifyFn, GateDecision, RunCommand } from "./ask-laya.ts";

const noRun: RunCommand = async (command) => ({
	command,
	exit_code: 0,
	stdout: "",
	stderr: "",
});

describe("ask_laya", () => {
	test("rejects jev-style question shapes with guidance", () => {
		const noul = JSON.stringify({
			risk: { type: "noul", instructions: "Is it risky?", criteria: { true: "yes", false: "no" } },
		});
		expect(() => parseQuestions(noul)).toThrow(/noul/);
		expect(() => parseQuestions(noul)).toThrow(/bool/);

		const optionsList = JSON.stringify({
			pick: { type: "choice", instructions: "Pick one", options: ["a", "b"] },
		});
		expect(() => parseQuestions(optionsList)).toThrow(/choice.*criteria|criteria/s);

		expect(() => parseQuestions("not json")).toThrow(/valid JSON/);
		expect(() => parseQuestions(JSON.stringify([{ type: "bool", instructions: "x", criteria: { true: "t", false: "f" } }]))).toThrow(
			/object keyed by question id/,
		);
	});

	test("accepts bool/choice/score with criteria", () => {
		const { questions, warnings } = parseQuestions(
			JSON.stringify({
				is_doc: { type: "bool", instructions: "Does it describe a setup?", criteria: { true: "it does", false: "it does not" } },
				kind: {
					type: "choice",
					instructions: "What kind of repo?",
					criteria: { dotfiles: "managed with chezmoi", app: "application source" },
				},
				quality: { type: "score", instructions: "How clear?", criteria: ["muddled", "ok", "crisp"] },
			}),
		);
		expect(Object.keys(questions)).toEqual(["is_doc", "kind", "quality"]);
		expect(questions.is_doc).toEqual({ type: "bool", instructions: "Does it describe a setup?", criteria: { true: "it does", false: "it does not" } });
		expect(warnings).toEqual([]);
	});

	test("warns when choice exceeds 20 options", () => {
		const criteria: Record<string, string> = {};
		for (let i = 0; i < 25; i++) criteria[`opt_${i}`] = `option ${i}`;
		const { questions, warnings } = parseQuestions(
			JSON.stringify({ pick: { type: "choice", instructions: "Pick one", criteria } }),
		);
		// The call proceeds: the question is returned intact alongside the warning.
		expect(questions.pick).toBeDefined();
		expect(warnings.some((w) => /pick.*25.*20|pick.*options/s.test(w) || (w.includes("pick") && w.includes("20")))).toBe(true);
	});

	test("requires score level descriptions", () => {
		expect(() =>
			parseQuestions(JSON.stringify({ s: { type: "score", instructions: "Rate", criteria: [] } })),
		).toThrow(/score.*criteria|levels/s);
		expect(() =>
			parseQuestions(JSON.stringify({ s: { type: "score", instructions: "Rate", criteria: ["low", ""] } })),
		).toThrow(/score.*criteria|levels/s);
		expect(() => parseQuestions(JSON.stringify({ s: { type: "score", instructions: "Rate", criteria: "low" } }))).toThrow(
			/score.*criteria|levels/s,
		);
	});

	test("refuses empty state", async () => {
		await expect(assembleState({ state: "   " }, "/tmp", noRun)).rejects.toThrow(/nothing to judge|state is empty/);
		await expect(assembleState({}, "/tmp", noRun)).rejects.toThrow(/nothing to judge|state is empty/);
		expect(parseState("  {not json}  ")).toBe("  {not json}  ");
		expect(parseState('{"a":1}')).toEqual({ a: 1 });
	});

	test("refuses oversize state with split suggestion", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "ask-laya-"));
		try {
			writeFileSync(path.join(dir, "big1.txt"), "a".repeat(15_000));
			writeFileSync(path.join(dir, "big2.txt"), "b".repeat(15_000));
			await expect(assembleState({ paths: ["big1.txt", "big2.txt"] }, dir, noRun)).rejects.toThrow(/Split into 2 calls/);
			await expect(assembleState({ paths: ["big1.txt", "big2.txt"] }, dir, noRun)).rejects.toThrow(/6.0k tokens|6000 tokens/);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("gate blocks irreversible above threshold", async () => {
		const classify: ClassifyFn = async (state, questions) => {
			expect(Object.keys(questions)).toEqual(["effect", "destructive_intent"]);
			expect((state as Record<string, unknown>).command).toBe("rm -rf /");
			return {
				answers: {
					effect: { type: "choice", choice: "irreversible", confidence: 0.92, probabilities: { irreversible: 0.92, reversible: 0.06, read_only: 0.02 } },
					destructive_intent: { type: "bool", probability: 0.95 },
				},
				stopReason: "stop",
			};
		};
		const gate = await gateCommand("rm -rf /", "/repo", classify);
		expect(gate.block).toBe(true);
		expect(gate.reason).toContain("irreversible");
		expect(gate.reason).toContain("0.92");

		// Below both thresholds: allowed with the reason the agent reads.
		const mild: ClassifyFn = async () => ({
			answers: {
				effect: { type: "choice", choice: "read_only", confidence: 0.9, probabilities: { read_only: 0.9 } },
				destructive_intent: { type: "bool", probability: 0.05 },
			},
			stopReason: "stop",
		});
		const okGate = await gateCommand("ls", "/repo", mild);
		expect(okGate.block).toBe(false);
		expect(GATE_THRESHOLDS).toEqual({ irreversible: 0.6, destructive: 0.7 });
	});

	test("gate fails closed when classify errors", async () => {
		const throwing: ClassifyFn = async () => {
			throw new Error("connect ECONNREFUSED 127.0.0.1:8082");
		};
		const gate = await gateCommand("make check", "/repo", throwing);
		expect(gate.block).toBe(true);
		expect(gate.reason).toContain("fail");

		const errorStop: ClassifyFn = async () => ({ answers: {}, stopReason: "error", errorMessage: "boom" });
		const gate2 = await gateCommand("make check", "/repo", errorStop);
		expect(gate2.block).toBe(true);
	});

	test("surfaces classifier errors as isError results", async () => {
		const captured: Record<string, any> = {};
		const pi = {
			on: (event: string, handler: any) => {
				captured[event] = handler;
			},
			registerTool: (def: any) => {
				captured.tool = def;
			},
			appendEntry: () => {},
		};
		askLaya(pi);
		expect(captured.tool.name).toBe("ask_laya");
		expect(typeof ASK_LAYA_DESCRIPTION).toBe("string");
		expect(NUDGE).toContain("ask_laya");
		expect(DEFAULT_MODEL).toBe("english");

		const ctx = {
			cwd: "/repo",
			modelRegistry: {
				findOfType: () => ({ provider: "laya", id: DEFAULT_MODEL }),
				classify: async () => ({ answers: {}, stopReason: "error", errorMessage: "fetch failed" }),
			},
		};
		const result = await captured.tool.execute(
			"id",
			{ questions_json: JSON.stringify({ q: { type: "bool", instructions: "x?", criteria: { true: "t", false: "f" } } }), state: "some context" },
			undefined,
			undefined,
			ctx,
		);
		expect(result.isError).toBe(true);
		expect(result.content[0].text).toContain("laya-serve");
		expect(result.content[0].text).toContain("8082");
	});

	test("nudge injected once", async () => {
		const captured: Record<string, any> = {};
		const pi = { on: (e: string, h: any) => (captured[e] = h), registerTool: () => {}, appendEntry: () => {} };
		askLaya(pi);
		const handler = captured.before_agent_start;
		expect(handler).toBeDefined();

		const first = await handler({ systemPrompt: "You are pi." });
		expect(first.systemPrompt).toContain("You are pi.");
		expect(first.systemPrompt).toContain(NUDGE);

		// (b) prompt already carrying the NUDGE → skipped, no double injection.
		const second = await handler({ systemPrompt: first.systemPrompt });
		expect(second).toBeUndefined();

		// (a) prompt mentioning "ask_laya" for unrelated reasons (tool declarations,
		// other snippets) but WITHOUT the NUDGE → injection must still happen.
		const unrelated = "Tools: read, ask_laya (ask the laya classifier). You are pi.";
		const injected = await handler({ systemPrompt: unrelated });
		expect(injected.systemPrompt).toBe(`${unrelated}\n\n${NUDGE}`);

		const empty = await handler({ systemPrompt: "" });
		expect(empty.systemPrompt).toBe(`\n\n${NUDGE}`);
	});

	test("ported constants match the reference implementation", () => {
		expect(STATE_TOKEN_BUDGET).toBe(6000);
		expect(MAX_FILES_PER_CALL).toBe(20);
		expect(MAX_OWN_STATE_CHARS).toBe(8000);
		expect(COMMAND_TIMEOUT_MS).toBe(60_000);
		expect(MAX_OUTPUT_CHARS).toBe(200_000);
		expect(BLOCK_NOTICE).toContain("This block is final.");
	});

	test("assembleState slim port: files, pruning, cap, and output", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "ask-laya-slim-"));
		try {
			writeFileSync(path.join(dir, "readme.md"), "# hello\n");
			writeFileSync(path.join(dir, "blob.png"), "not really png");
			const run: RunCommand = async (command) => ({ command, exit_code: 0, stdout: "built ok", stderr: "" });
			const { state, summary } = await assembleState(
				{ state: "checking the readme", paths: ["readme.md", "blob.png", "missing.txt"], command: "make build" },
				dir,
				run,
			);
			expect((state as any).files["readme.md"]).toContain("# hello");
			expect((state as any).files["blob.png"]).toBeUndefined();
			expect((state as any).output.stdout).toBe("built ok");
			expect(summary.files).toEqual(["readme.md"]);
			expect(summary.skipped.some((s) => s.path === "blob.png" && /binary/.test(s.reason))).toBe(true);
			expect(summary.skipped.some((s) => s.path === "missing.txt" && /not found/.test(s.reason))).toBe(true);
			expect(summary.output).toContain("make build");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
