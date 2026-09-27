/**
 * Gating telemetry: append-only JSONL + in-memory counters + bounded ring.
 * Telemetry must never break gating — every fs error is swallowed.
 * Privacy: raw prompts and tool output are never recorded (digest-only).
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Verdict } from "./verdict-cache";

export interface RoutingEvent {
	ts: number;
	promptDigest: string;
	consulted: boolean;
	/** "gate" — one representation classification of a tool result (spec §9). */
	kind?: "gate";
	tool?: string;
	verdict?: Verdict;
	confidence?: number;
	reason?: string;
	bytesIn?: number;
	bytesOut?: number;
	layaLatencyMs?: number;
	totalLatencyMs?: number;
	/** LayaFailure kind, health status, or skip reason. */
	failure?: string;
}

export type Counters = {
	consulted: number;
	failures: number;
	fallback: number;
	disabledSkips: number;
	gated: number;
	verbatim: number;
	compress: number;
	digest: number;
	reclaimedBytes: number;
	reReadAfterDigest: number;
};

const RING_MAX = 200;

export class RoutingLog {
	private readonly filePath: string;
	private readonly now: () => number;
	private readonly counters: Counters = {
		consulted: 0,
		failures: 0,
		fallback: 0,
		disabledSkips: 0,
		gated: 0,
		verbatim: 0,
		compress: 0,
		digest: 0,
		reclaimedBytes: 0,
		reReadAfterDigest: 0,
	};
	private readonly ring: RoutingEvent[] = [];

	constructor(filePath: string, now?: () => number) {
		this.filePath = filePath;
		this.now = now ?? (() => Date.now());
	}

	record(e: RoutingEvent): void {
		const event = { ...e, ts: e.ts ?? this.now() };
		try {
			mkdirSync(dirname(this.filePath), { recursive: true });
			appendFileSync(this.filePath, JSON.stringify(event) + "\n");
		} catch {
			// Telemetry must never break gating.
		}
		if (event.consulted) this.counters.consulted++;
		if (event.kind === "gate") {
			this.counters.gated++;
			if (event.verdict === "verbatim") this.counters.verbatim++;
			else if (event.verdict === "compress") this.counters.compress++;
			else if (event.verdict === "digest") this.counters.digest++;
			if (typeof event.bytesIn === "number" && typeof event.bytesOut === "number") {
				this.counters.reclaimedBytes += Math.max(0, event.bytesIn - event.bytesOut);
			}
		}
		if (event.failure) {
			this.counters.failures++;
			if (event.failure === "disabled") this.counters.disabledSkips++;
			else this.counters.fallback++;
		}
		this.ring.push(event);
		if (this.ring.length > RING_MAX) this.ring.shift();
	}

	/** A digest/compress verdict was re-observed (agent re-ran the tool) — quality signal (spec §9). */
	markReRead(): void {
		this.counters.reReadAfterDigest++;
	}

	snapshot(): Counters {
		return { ...this.counters };
	}

	recent(n: number): RoutingEvent[] {
		return this.ring.slice(-n);
	}
}

/** Short deterministic prompt fingerprint (privacy: raw prompts never logged). */
export function digest(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16);
}
