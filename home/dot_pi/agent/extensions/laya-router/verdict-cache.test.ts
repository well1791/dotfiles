import { test, expect } from "bun:test";
import { VerdictCache, verdictKey, type VerdictEntry } from "./verdict-cache";

const LONG = "x".repeat(5000);

function entry(verdict: VerdictEntry["verdict"] = "digest"): VerdictEntry {
	return { verdict, confidence: 0.9, bytesIn: 5000, bytesOut: 40 };
}

test("verdictKey is 16 hex chars and stable", () => {
	const a = verdictKey("bash", "some output");
	expect(a).toMatch(/^[0-9a-f]{16}$/);
	expect(verdictKey("bash", "some output")).toBe(a);
});

test("verdictKey differs for different tool name, text, or text tail beyond 4000 chars", () => {
	const base = verdictKey("bash", LONG);
	expect(verdictKey("read", LONG)).not.toBe(base);
	expect(verdictKey("bash", LONG + "!")).not.toBe(base);
	expect(verdictKey("bash", "y".repeat(5000))).not.toBe(base);
});

test("set/get roundtrip returns the stored entry", () => {
	const c = new VerdictCache(2);
	const e = entry("compress");
	c.set("k", e);
	expect(c.get("k")).toEqual(e);
	expect(c.size()).toBe(1);
});

test("get on missing key returns undefined", () => {
	const c = new VerdictCache(2);
	expect(c.get("nope")).toBeUndefined();
});

test("bound is respected: oldest entry evicted at capacity", () => {
	const c = new VerdictCache(2);
	c.set("a", entry());
	c.set("b", entry());
	c.set("c", entry());
	expect(c.size()).toBe(2);
	expect(c.get("a")).toBeUndefined();
	expect(c.get("b")).toBeDefined();
	expect(c.get("c")).toBeDefined();
});

test("get refreshes recency: touched entry survives eviction", () => {
	const c = new VerdictCache(2);
	c.set("a", entry());
	c.set("b", entry());
	expect(c.get("a")).toBeDefined(); // touch a -> b is now LRU
	c.set("c", entry());
	expect(c.get("a")).toBeDefined();
	expect(c.get("b")).toBeUndefined();
	expect(c.get("c")).toBeDefined();
});

test("set on existing key updates in place without growing", () => {
	const c = new VerdictCache(2);
	c.set("a", entry("digest"));
	c.set("a", entry("verbatim"));
	expect(c.size()).toBe(1);
	expect(c.get("a")?.verdict).toBe("verbatim");
});

test("entries never contain raw text", () => {
	const c = new VerdictCache(2);
	const rawMarker = "RAW-OUTPUT-MARKER-123456";
	c.set(verdictKey("bash", rawMarker), entry());
	const e = c.get(verdictKey("bash", rawMarker));
	expect(e).toBeDefined();
	expect(JSON.stringify(e)).not.toContain(rawMarker);
});
