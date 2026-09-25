/**
 * Routing telemetry: append-only JSONL + in-memory counters + bounded ring.
 * Telemetry must never break routing — every fs error is swallowed.
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { LayaFailure } from "./client";
import type { RouteClass } from "./policy";

export interface RoutingEvent {
	ts: number;
	promptDigest: string;
	consulted: boolean;
	route?: RouteClass | "fallback";
	confidence?: number;
	escalated?: boolean;
	reason?: string;
	model?: string;
	layaLatencyMs?: number;
	totalLatencyMs?: number;
	/** LayaFailure kind, health status ("initializing"/"failed"/…), or routing-skip reason. */
	failure?: string;
}

export type Counters = {
	consulted: number;
	laya: number;
	small: number;
	frontier: number;
	escalated: number;
	fallback: number;
	failures: number;
	pinnedSkips: number;
	disabledSkips: number;
};

const RING_MAX = 200;

export class RoutingLog {
	private readonly filePath: string;
	private readonly now: () => number;
	private readonly counters: Counters = {
		consulted: 0,
		laya: 0,
		small: 0,
		frontier: 0,
		escalated: 0,
		fallback: 0,
		failures: 0,
		pinnedSkips: 0,
		disabledSkips: 0,
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
			// Telemetry must never break routing.
		}
		if (event.consulted) this.counters.consulted++;
		if (event.route === "laya") this.counters.laya++;
		else if (event.route === "small") this.counters.small++;
		else if (event.route === "frontier") this.counters.frontier++;
		else if (event.route === "fallback") this.counters.fallback++;
		if (event.escalated) this.counters.escalated++;
		if (event.failure) {
			this.counters.failures++;
			if (event.failure === "pinned") this.counters.pinnedSkips++;
			else if (event.failure === "disabled") this.counters.disabledSkips++;
			else if (event.route !== "fallback") this.counters.fallback++;
		}
		this.ring.push(event);
		if (this.ring.length > RING_MAX) this.ring.shift();
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
