/**
 * Bounded LRU verdict cache for tool-result representation gating
 * (spec 2026-09-26 §4): keyed by a digest of toolName + result text as
 * received, so identical results are never re-classified. Entries carry the
 * verdict, confidence, and byte counts — never raw text.
 */
import { createHash } from "node:crypto";

export type Verdict = "verbatim" | "compress" | "digest";

export interface VerdictEntry {
	verdict: Verdict;
	confidence: number;
	bytesIn: number;
	bytesOut: number;
}

/** Verdict-cache key: sha256(toolName + "\n" + text), 16 hex chars. */
export function verdictKey(toolName: string, text: string): string {
	return createHash("sha256").update(`${toolName}\n${text}`).digest("hex").slice(0, 16);
}

export class VerdictCache {
	private readonly maxEntries: number;
	private readonly map = new Map<string, VerdictEntry>();

	constructor(maxEntries: number) {
		this.maxEntries = maxEntries;
	}

	get(key: string): VerdictEntry | undefined {
		const e = this.map.get(key);
		if (e === undefined) return undefined;
		// Map preserves insertion order; delete+set moves the key to the end (most recent).
		this.map.delete(key);
		this.map.set(key, e);
		return e;
	}

	set(key: string, entry: VerdictEntry): void {
		if (this.map.has(key)) this.map.delete(key);
		this.map.set(key, entry);
		while (this.map.size > this.maxEntries) {
			const oldest = this.map.keys().next().value;
			if (oldest === undefined) break;
			this.map.delete(oldest);
		}
	}

	size(): number {
		return this.map.size;
	}
}
