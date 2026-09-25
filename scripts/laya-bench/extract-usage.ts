#!/usr/bin/env bun
/**
 * Session usage extractor for the laya-router A/B benchmark.
 * Usage: bun scripts/laya-bench/extract-usage.ts <session.jsonl>
 * Prints one JSON line: per-model call counts, token totals, cost, wall time.
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) {
	console.error("usage: bun extract-usage.ts <session.jsonl>");
	process.exit(1);
}

interface Agg {
	calls: number;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: number;
}

const byModel = new Map<string, Agg>();
let turns = 0;
let toolCalls = 0;
let firstTs = Number.POSITIVE_INFINITY;
let lastTs = 0;

for (const line of readFileSync(file, "utf8").split("\n")) {
	if (!line.trim()) continue;
	let e: any;
	try {
		e = JSON.parse(line);
	} catch {
		continue;
	}
	if (typeof e.timestamp === "number") {
		firstTs = Math.min(firstTs, e.timestamp);
		lastTs = Math.max(lastTs, e.timestamp);
	}
	if (e.type !== "message") continue;
	const m = e.message ?? {};
	if (m.role === "assistant") {
		turns++;
		const key = `${m.provider ?? "?"}/${m.model ?? "?"}`;
		const u = m.usage ?? {};
		const c = u.cost ?? {};
		const agg =
			byModel.get(key) ??
			({ calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 } as Agg);
		agg.calls++;
		agg.input += u.input ?? 0;
		agg.output += u.output ?? 0;
		agg.cacheRead += u.cacheRead ?? 0;
		agg.cacheWrite += u.cacheWrite ?? 0;
		agg.totalTokens += u.totalTokens ?? 0;
		agg.cost += c.total ?? 0;
		byModel.set(key, agg);
	} else if (m.role === "toolResult") {
		toolCalls++;
	}
}

const models: Record<string, Agg> = {};
for (const [k, v] of byModel) models[k] = v;
console.log(
	JSON.stringify({
		file: file.split("/").pop(),
		turns,
		toolCalls,
		wallSeconds: Number.isFinite(firstTs) ? Number(((lastTs - firstTs) / 1000).toFixed(1)) : 0,
		totalCost: Number(Object.values(models).reduce((s, m) => s + m.cost, 0).toFixed(6)),
		models,
	}),
);
