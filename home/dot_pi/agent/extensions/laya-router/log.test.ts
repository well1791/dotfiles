import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoutingLog, digest } from "./log";

function tmpDir(): string {
	return mkdtempSync(join(tmpdir(), "laya-log-"));
}

const base = { ts: 1, promptDigest: "abc", consulted: true } as const;

test("record appends parseable JSONL lines", () => {
	const dir = tmpDir();
	const file = join(dir, "sub", "routing.jsonl"); // exercises mkdir -p
	const log = new RoutingLog(file, () => 1);
	log.record({ ...base, route: "small", confidence: 0.9, model: "zai/glm-5.3-flash" });
	log.record({ ...base, promptDigest: "def", route: "frontier", confidence: 0.95, model: "zai/glm-5.3" });
	const lines = readFileSync(file, "utf8").trim().split("\n");
	expect(lines.length).toBe(2);
	expect(JSON.parse(lines[0]).route).toBe("small");
	expect(JSON.parse(lines[1]).model).toBe("zai/glm-5.3");
	rmSync(dir, { recursive: true, force: true });
});

test("counters accumulate per class, escalation, fallback, failure, skips", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	log.record({ ...base, route: "laya" });
	log.record({ ...base, promptDigest: "d2", route: "small", escalated: true });
	log.record({ ...base, promptDigest: "d3", route: "frontier" });
	log.record({ ...base, promptDigest: "d4", consulted: false, route: "fallback", failure: "timeout" });
	log.record({ ...base, promptDigest: "d5", consulted: false, failure: "pinned" });
	log.record({ ...base, promptDigest: "d6", consulted: false, failure: "disabled" });
	const s = log.snapshot();
	expect(s).toEqual({
		consulted: 3,
		laya: 1,
		small: 1,
		frontier: 1,
		escalated: 1,
		fallback: 1,
		failures: 3,
		pinnedSkips: 1,
		disabledSkips: 1,
	});
});

test("recent returns newest-last ring bounded to 200", () => {
	const log = new RoutingLog(join(tmpDir(), "x.jsonl"), () => 1);
	for (let i = 0; i < 205; i++) {
		log.record({ ...base, promptDigest: `d${i}` });
	}
	const ring = log.recent(10);
	expect(ring.length).toBe(10);
	expect(ring[0].promptDigest).toBe("d195");
	expect(ring[9].promptDigest).toBe("d204");
	expect(log.recent(500).length).toBe(200);
});

test("unwritable path never throws", () => {
	const log = new RoutingLog("/proc/definitely/not/writable/routing.jsonl", () => 1);
	expect(() => log.record({ ...base, route: "small" })).not.toThrow();
	expect(log.snapshot().small).toBe(1);
});

test("digest is deterministic sha256-prefix, 16 chars", () => {
	expect(digest("hello")).toBe(digest("hello"));
	expect(digest("hello")).toHaveLength(16);
	expect(digest("hello")).not.toBe(digest("hellp"));
});
