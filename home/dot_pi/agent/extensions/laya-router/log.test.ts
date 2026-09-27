import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoutingLog, digest } from "./log";

function tmpDir(): string {
	return mkdtempSync(join(tmpdir(), "laya-log-"));
}

const base = { ts: 1, promptDigest: "abc", consulted: true } as const;

test("record appends parseable JSONL lines with gate fields", () => {
	const dir = tmpDir();
	const file = join(dir, "sub", "routing.jsonl"); // exercises mkdir -p
	const log = new RoutingLog(file, () => 1);
	log.record({ ...base, kind: "gate", tool: "bash", verdict: "digest", confidence: 0.9, bytesIn: 5000, bytesOut: 60 });
	const line = JSON.parse(readFileSync(file, "utf8").trim());
	expect(line.kind).toBe("gate");
	expect(line.tool).toBe("bash");
	expect(line.verdict).toBe("digest");
	expect(line.bytesIn).toBe(5000);
	expect(line.bytesOut).toBe(60);
	rmSync(dir, { recursive: true, force: true });
});

test("gate events increment gated, verdict counters, and reclaimedBytes", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.record({ ...base, kind: "gate", tool: "bash", verdict: "digest", bytesIn: 5000, bytesOut: 60 });
	log.record({ ...base, promptDigest: "d2", kind: "gate", tool: "read", verdict: "compress", bytesIn: 4000, bytesOut: 1600 });
	log.record({ ...base, promptDigest: "d3", kind: "gate", tool: "grep", verdict: "verbatim", bytesIn: 3000, bytesOut: 3000 });
	const s = log.snapshot();
	expect(s.gated).toBe(3);
	expect(s.digest).toBe(1);
	expect(s.compress).toBe(1);
	expect(s.verbatim).toBe(1);
	expect(s.reclaimedBytes).toBe((5000 - 60) + (4000 - 1600));
});

test("reclaimedBytes never goes negative when bytesOut exceeds bytesIn", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.record({ ...base, kind: "gate", tool: "bash", verdict: "compress", bytesIn: 100, bytesOut: 200 });
	expect(log.snapshot().reclaimedBytes).toBe(0);
});

test("failure entries increment failures and fallback; disabled skip counted", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.record({ ...base, kind: "gate", tool: "bash", failure: "timeout" });
	log.record({ ...base, promptDigest: "d2", consulted: false, kind: "gate", tool: "bash", failure: "disabled" });
	const s = log.snapshot();
	expect(s.failures).toBe(2);
	expect(s.fallback).toBe(1);
	expect(s.disabledSkips).toBe(1);
	expect(s.gated).toBe(2);
});

test("markReRead increments only reReadAfterDigest", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.markReRead();
	log.markReRead();
	const s = log.snapshot();
	expect(s.reReadAfterDigest).toBe(2);
	expect(s.gated).toBe(0);
	expect(s.failures).toBe(0);
});

test("route-class counters no longer exist", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.record({ ...base, kind: "gate", tool: "bash", verdict: "digest" } as never);
	const s = log.snapshot();
	expect(s).toEqual({
		consulted: 1,
		failures: 0,
		fallback: 0,
		disabledSkips: 0,
		gated: 1,
		verbatim: 0,
		compress: 0,
		digest: 1,
		reclaimedBytes: 0,
		reReadAfterDigest: 0,
	});
	expect(Object.keys(s)).not.toContain("laya");
	expect(Object.keys(s)).not.toContain("small");
	expect(Object.keys(s)).not.toContain("frontier");
	expect(Object.keys(s)).not.toContain("escalated");
	expect(Object.keys(s)).not.toContain("pinnedSkips");
});

test("recent returns newest-last ring bounded to 200", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	for (let i = 0; i < 205; i++) {
		log.record({ ...base, promptDigest: `d${i}`, kind: "gate", tool: "bash", verdict: "digest" });
	}
	const ring = log.recent(10);
	expect(ring.length).toBe(10);
	expect(ring[0].promptDigest).toBe("d195");
	expect(ring[9].promptDigest).toBe("d204");
	expect(log.recent(500).length).toBe(200);
});

test("unwritable path never throws", () => {
	const log = new RoutingLog("/proc/definitely/not/writable/routing.jsonl", () => 1);
	expect(() => log.record({ ...base, kind: "gate", tool: "bash", verdict: "digest" })).not.toThrow();
	expect(log.snapshot().gated).toBe(1);
});

test("digest is deterministic sha256-prefix, 16 chars", () => {
	expect(digest("hello")).toBe(digest("hello"));
	expect(digest("hello")).toHaveLength(16);
	expect(digest("hello")).not.toBe(digest("hellp"));
});

test("jsonl lines never contain raw tool output", () => {
	const dir = tmpDir();
	const file = join(dir, "x.jsonl");
	const log = new RoutingLog(file, () => 1);
	const rawMarker = "RAW-TOOL-OUTPUT-987654321";
	log.record({ ...base, kind: "gate", tool: "bash", verdict: "digest", bytesIn: rawMarker.length });
	expect(readFileSync(file, "utf8")).not.toContain(rawMarker);
	rmSync(dir, { recursive: true, force: true });
});
