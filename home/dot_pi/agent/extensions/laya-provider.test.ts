/**
 * Acceptance tests for the laya provider extension.
 *
 * Source-only: excluded from deploy via .chezmoiignore (deployed .ts files in
 * ~/.pi/agent/extensions load as extensions, and the bun:test import would
 * break every pi session).
 *
 * - Unit cases cover the laya.env parsing helper and its deploy-time path,
 *   the registration shape, the classifier-impl resolution, and the factory's
 *   fail-soft behavior on a missing env file.
 * - The integration case performs ONE real classify against the live strict
 *   laya-serve instance (http://127.0.0.1:8082, systemd user unit laya-serve)
 *   using the real key read from ~/.local/share/laya/laya.env. Only
 *   non-secret fields are asserted or printed; the key never appears in
 *   output.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ClassifierModel, ClassifierResult } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig } from "@earendil-works/pi-coding-agent";
import {
	LAYA_BASE_URL,
	LAYA_CLASSIFIER_API,
	LAYA_CLASSIFIER_MODELS,
	LAYA_PROVIDER_ID,
	buildLayaProviderConfig,
	default as layaProvider,
	layaEnvFile,
	readLayaApiKey,
	systemOneClassify,
	type LayaClassifyFn,
	type LayaModuleLoader,
} from "./laya-provider.ts";

/** The pi-ai entry point pi aliases for extensions, at its real install location. */
const piAiProvidersAllPath = path.join(
	os.homedir(),
	".bun/install/global/node_modules/@earendil-works/pi-ai/dist/providers/all.js",
);
const loadProvidersAll: LayaModuleLoader = () => import(piAiProvidersAllPath);

/** Writes KEY=value content to a temp file, runs `run`, then removes the file. */
function withTempEnvFile(content: string, run: (file: string) => void): void {
	const dir = mkdtempSync(path.join(os.tmpdir(), "laya-env-test-"));
	const file = path.join(dir, "laya.env");
	writeFileSync(file, content);
	try {
		run(file);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** Records registerProvider calls instead of touching a pi runtime. */
function recordingPi(): { pi: ExtensionAPI; calls: Array<{ name: string; config: ProviderConfig }> } {
	const calls: Array<{ name: string; config: ProviderConfig }> = [];
	const pi = {
		registerProvider: (name: string, config: ProviderConfig) => {
			calls.push({ name, config });
		},
	} as unknown as ExtensionAPI;
	return { pi, calls };
}

/** Captures console.warn during `run`, restoring it afterwards. */
function captureWarn(run: () => Promise<void> | void): Promise<string[]> {
	const warnings: string[] = [];
	const originalWarn = console.warn;
	console.warn = (message?: unknown) => {
		warnings.push(String(message));
	};
	const done = run();
	return Promise.resolve(done).finally(() => {
		console.warn = originalWarn;
	}).then(() => warnings);
}

describe("readLayaApiKey", () => {
	test("points at the deploy-time env file under $HOME", () => {
		expect(layaEnvFile()).toBe(
			path.join(os.homedir(), ".local", "share", "laya", "laya.env"),
		);
	});

	test("returns null for a missing file (fail-soft)", () => {
		expect(readLayaApiKey(path.join(os.tmpdir(), `laya-no-such-env-${process.pid}`))).toBeNull();
	});

	test("parses LAYA_API_KEY from KEY=value lines like cut -d= -f2-", () => {
		withTempEnvFile("LAYA_HOST=127.0.0.1\nLAYA_API_KEY=test-key-value\nLAYA_PORT=8082\n", (file) => {
			expect(readLayaApiKey(file)).toBe("test-key-value");
		});
	});

	test("returns null when the variable is absent or empty", () => {
		withTempEnvFile("LAYA_HOST=127.0.0.1\nLAYA_API_KEY=\n", (file) => {
			expect(readLayaApiKey(file)).toBeNull();
		});
		withTempEnvFile("LAYA_HOST=127.0.0.1\n", (file) => {
			expect(readLayaApiKey(file)).toBeNull();
		});
	});
});

describe("buildLayaProviderConfig", () => {
	test("registers both classifier models on the pinned endpoint with zero cost", () => {
		const config = buildLayaProviderConfig("unused-here", null);
		expect(config.name).toBe("Laya");
		expect(config.baseUrl).toBe(LAYA_BASE_URL);
		expect(config.models).toHaveLength(2);
		expect(config.models?.map((model) => model.id)).toEqual(["english", "typed-decisions"]);
		for (const model of config.models ?? []) {
			expect(model.type).toBe("classifier");
			expect((model as { api?: string }).api).toBe(LAYA_CLASSIFIER_API);
			expect((model as { contextWindow?: number }).contextWindow).toBe(8192);
			expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
			expect(model.input).toEqual(["text"]);
		}
	});

	test("keys the classifier implementation by the System One api; empty key marks failing auth", () => {
		const classify: LayaClassifyFn = async () => {
			throw new Error("not used");
		};
		const withImpl = buildLayaProviderConfig("unused-here", classify);
		expect(Object.keys(withImpl.classifiers ?? {})).toEqual([LAYA_CLASSIFIER_API]);

		const withoutImpl = buildLayaProviderConfig("", null);
		expect(withoutImpl.classifiers).toEqual({});
		expect(withoutImpl.apiKey).toBe("");
	});
});

describe("systemOneClassify", () => {
	test("takes the classify implementation from the built-in typesafe provider", async () => {
		const classify = systemOneClassify(await loadProvidersAll());
		expect(classify).toBeTypeOf("function");
	});

	test("returns null when the typesafe provider is absent", () => {
		expect(systemOneClassify({ builtinProviders: () => [{ id: "other" }] })).toBeNull();
	});
});

describe("layaProvider factory", () => {
	test("missing env file: warns and registers with an empty key and no classifier impl", async () => {
		const { pi, calls } = recordingPi();
		const warnings = await captureWarn(() =>
			layaProvider(
				pi,
				path.join(os.tmpdir(), `laya-no-such-env-${process.pid}`),
				async () => {
					throw new Error("module load unavailable");
				},
			)
		);
		expect(calls).toHaveLength(1);
		expect(calls[0].name).toBe(LAYA_PROVIDER_ID);
		expect(calls[0].config.apiKey).toBe("");
		expect(calls[0].config.classifiers).toEqual({});
		expect(warnings).toHaveLength(2);
		expect(warnings[0]).toContain("classifier implementation unavailable");
		expect(warnings[1]).toContain("missing or without LAYA_API_KEY");
	});

	test("real env file: registers with a non-empty key and the System One classifier, silently", async () => {
		const { pi, calls } = recordingPi();
		const warnings = await captureWarn(() => layaProvider(pi, undefined, loadProvidersAll));
		expect(calls).toHaveLength(1);
		expect(calls[0].config.apiKey).not.toBe("");
		expect(Object.keys(calls[0].config.classifiers ?? {})).toEqual([LAYA_CLASSIFIER_API]);
		expect(warnings).toEqual([]);
	});
});

describe("live classify against laya-serve", () => {
	/**
	 * One real classify through the exact implementation and model shape the
	 * extension registers (Phase 3 gate 1). Requires the laya-serve user unit
	 * to be active and laya.env to carry the real LAYA_API_KEY.
	 */
	test(`${LAYA_PROVIDER_ID}/english answers a bool question with usage`, async () => {
		const classify = systemOneClassify(await loadProvidersAll());
		expect(classify).not.toBeNull();

		const apiKey = readLayaApiKey();
		expect(apiKey).not.toBeNull();

		// Same projection the provider composer applies to classifier definitions.
		const definition = LAYA_CLASSIFIER_MODELS.find((model) => model.id === "english");
		expect(definition).toBeDefined();
		const model = {
			...definition,
			provider: LAYA_PROVIDER_ID,
			baseUrl: LAYA_BASE_URL,
			headers: undefined,
		};

		const result: ClassifierResult = await classify!(
			model as unknown as ClassifierModel<string>,
			{
				state: { text: "The quick brown fox jumps over the lazy dog." },
				questions: {
					is_english: {
						type: "bool",
						instructions: "Decide whether the state text is an English sentence.",
						criteria: {
							true: "The text is a grammatical English sentence.",
							false: "The text is not English or not a sentence.",
						},
					},
				},
			},
			{ apiKey: apiKey ?? undefined },
		);

		// Non-secret fields only.
		expect(result.stopReason).toBe("stop");
		expect(result.errorMessage).toBeUndefined();
		const answer = result.answers.is_english;
		expect(answer?.type).toBe("bool");
		const probability = (answer as { probability?: number }).probability;
		expect(typeof probability).toBe("number");
		expect(probability as number).toBeGreaterThanOrEqual(0);
		expect(probability as number).toBeLessThanOrEqual(1);
		expect(result.usage).toBeDefined();
		console.log(
			`laya/english: stopReason=${result.stopReason} answer.type=${answer?.type} probability=${(probability as number).toFixed(3)} usage.totalTokens=${result.usage?.totalTokens ?? "n/a"}`,
		);
	});
});
