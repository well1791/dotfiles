/**
 * Laya provider extension
 *
 * Registers the local laya-serve decision engine (http://127.0.0.1:8082, see
 * the laya-serve systemd user unit) as pi provider "laya" with two System One
 * classifier models: laya/english and laya/typed-decisions. Registration is
 * declarative — the factory never connects to the server; classify requests
 * happen on demand.
 *
 * Auth: LAYA_API_KEY is read once from the 0600 deploy-time file
 * ~/.local/share/laya/laya.env and handed to pi as a literal apiKey (pi
 * resolves it into the Bearer header at request time). The key value is never
 * logged. When the file is missing or the variable is absent, the provider
 * still registers with an empty key: pi sessions keep working everywhere and
 * laya/classify just fails with a clear authentication error (fail-soft).
 *
 * Why the classifier implementation comes from the built-in TypeSafe
 * provider: extensions load through pi's extension loader, whose alias table
 * rewrites every "@earendil-works/pi-ai/…" subpath onto the compat
 * entrypoint file — a direct import of
 * "@earendil-works/pi-ai/api/typesafe-system-one.lazy" (the form pi's
 * bundled llama.cpp provider uses from inside the package) cannot resolve
 * from a user extension. The aliased "@earendil-works/pi-ai/providers/all"
 * entry point exposes builtinProviders(), whose "typesafe" entry carries
 * exactly that typesafeSystemOneApi() implementation; it dispatches purely on
 * model.api and uses the requesting model's baseUrl and key, so it serves
 * laya models unchanged.
 */

import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
	ClassifierContext,
	ClassifierModel,
	ClassifierOptions,
	ClassifierResult,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI, ProviderConfig, ProviderModelConfig } from "@earendil-works/pi-coding-agent";

/** Provider id and endpoint pinned by the Phase 1 spike. */
export const LAYA_PROVIDER_ID = "laya";
export const LAYA_BASE_URL = "http://127.0.0.1:8082/v1";

/** Wire-level System One API both laya models speak. */
export const LAYA_CLASSIFIER_API = "typesafe-system-one";

/** The classifier implementation signature pi's `classifiers` map expects. */
export type LayaClassifyFn = (
	model: ClassifierModel<string>,
	context: ClassifierContext,
	options?: ClassifierOptions,
) => Promise<ClassifierResult>;

/** Shape of the aliased "@earendil-works/pi-ai/providers/all" entry point. */
interface ProvidersAllModule {
	builtinProviders: () => Array<{
		id: string;
		classify?: LayaClassifyFn;
	}>;
}

export type LayaModuleLoader = () => Promise<ProvidersAllModule>;

const defaultLoadProvidersAll: LayaModuleLoader = () =>
	import("@earendil-works/pi-ai/providers/all") as Promise<ProvidersAllModule>;

/** Deploy-time env file written by the laya-serve install script (0600). */
export function layaEnvFile(): string {
	return path.join(os.homedir(), ".local", "share", "laya", "laya.env");
}

/**
 * Reads LAYA_API_KEY from the env file, same parse as
 * `grep '^LAYA_API_KEY=' "$file" | cut -d= -f2-` over `KEY=value` lines.
 * Returns null when the file is missing, unreadable, or the variable is
 * absent or empty. Never logs the value.
 */
export function readLayaApiKey(envFile: string = layaEnvFile()): string | null {
	let content: string;
	try {
		content = readFileSync(envFile, "utf8");
	} catch {
		return null;
	}
	const line = content.split("\n").find((entry) => entry.startsWith("LAYA_API_KEY="));
	if (!line) return null;
	const value = line.slice("LAYA_API_KEY=".length).trim();
	return value.length > 0 ? value : null;
}

/**
 * The built-in TypeSafe provider carries the shared System One classify
 * implementation; dispatch is purely by model.api, so it serves laya models.
 * Returns null when the provider is absent from the catalog.
 */
export function systemOneClassify(module: ProvidersAllModule): LayaClassifyFn | null {
	return module.builtinProviders().find((provider) => provider.id === "typesafe")?.classify ?? null;
}

/** The two English classifier models, exactly as registered with pi. */
export const LAYA_CLASSIFIER_MODELS: ProviderModelConfig[] = [
	{
		type: "classifier",
		id: "english",
		name: "Laya English",
		api: LAYA_CLASSIFIER_API,
		input: ["text"],
		contextWindow: 8192,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
	{
		type: "classifier",
		id: "typed-decisions",
		name: "Laya Typed Decisions",
		api: LAYA_CLASSIFIER_API,
		input: ["text"],
		contextWindow: 8192,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	},
];

/** Builds the provider registration; exported so tests assert the real shape. */
export function buildLayaProviderConfig(apiKey: string, classify: LayaClassifyFn | null): ProviderConfig {
	return {
		name: "Laya",
		baseUrl: LAYA_BASE_URL,
		apiKey,
		models: LAYA_CLASSIFIER_MODELS,
		classifiers: classify ? { [LAYA_CLASSIFIER_API]: { classify } } : {},
	};
}

/**
 * Extension entry point. pi calls it with only `pi`; the optional `envFile`
 * and `loadProvidersAll` parameters exist for the colocated test.
 */
export default async function layaProvider(
	pi: ExtensionAPI,
	envFile: string = layaEnvFile(),
	loadProvidersAll: LayaModuleLoader = defaultLoadProvidersAll,
) {
	let classify: LayaClassifyFn | null = null;
	try {
		classify = systemOneClassify(await loadProvidersAll());
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`laya: System One classifier implementation unavailable (${message}); laya classify will error until this resolves`);
	}
	const apiKey = readLayaApiKey(envFile);
	if (apiKey === null) {
		console.warn(`laya: ${envFile} missing or without LAYA_API_KEY — registering provider "laya" anyway; classify requests will fail authentication`);
	}
	pi.registerProvider(LAYA_PROVIDER_ID, buildLayaProviderConfig(apiKey ?? "", classify));
}
