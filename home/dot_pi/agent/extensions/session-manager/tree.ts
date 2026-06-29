// home/dot_pi/agent/extensions/session-manager/tree.ts

import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import type { FlatItem, SessionMeta } from "./types.ts";

export function buildTree(sessions: SessionInfo[]): FlatItem[] {
  const byPath = new Map<string, SessionInfo>();
  for (const s of sessions) byPath.set(s.path, s);

  const childrenOf = new Map<string, SessionInfo[]>();
  const roots: SessionInfo[] = [];

  for (const s of sessions) {
    const parentPath = s.parentSessionPath;
    if (parentPath && byPath.has(parentPath)) {
      const list = childrenOf.get(parentPath) ?? [];
      list.push(s);
      childrenOf.set(parentPath, list);
    } else {
      roots.push(s);
    }
  }

  // Memoized: newest modification time in a session's entire subtree
  const newestCache = new Map<string, number>();
  function newestInGroup(path: string): number {
    if (newestCache.has(path)) return newestCache.get(path)!;
    const s = byPath.get(path);
    let newest = s ? s.modified.getTime() : 0;
    for (const kid of childrenOf.get(path) ?? []) {
      newest = Math.max(newest, newestInGroup(kid.path));
    }
    newestCache.set(path, newest);
    return newest;
  }

  roots.sort((a, b) => newestInGroup(b.path) - newestInGroup(a.path));

  const sortByRecent = (a: SessionInfo, b: SessionInfo) =>
    b.modified.getTime() - a.modified.getTime();

  // Memoized descendant count
  const descendantCache = new Map<string, number>();
  function countDescendants(path: string): number {
    if (descendantCache.has(path)) return descendantCache.get(path)!;
    const kids = childrenOf.get(path) ?? [];
    const count = kids.reduce((sum, c) => sum + 1 + countDescendants(c.path), 0);
    descendantCache.set(path, count);
    return count;
  }

  const result: FlatItem[] = [];

  function walk(s: SessionInfo, depth: number, isLast: boolean, ancestors: boolean[]) {
    result.push({
      session: s,
      depth,
      isLast,
      childCount: countDescendants(s.path),
      ancestors,
    });
    const kids = (childrenOf.get(s.path) ?? []).sort(sortByRecent);
    const nextAncestors = [...ancestors, isLast];
    for (let i = 0; i < kids.length; i++) {
      walk(kids[i], depth + 1, i === kids.length - 1, nextAncestors);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], 0, i === roots.length - 1, []);
  }
  return result;
}

/**
 * Load metadata for a single session (model + token estimate).
 * This opens and parses the session file — call lazily per viewport.
 */
export function loadSessionMeta(sessionPath: string): SessionMeta {
  try {
    const sm = SessionManager.open(sessionPath);
    const entries = sm.getEntries();
    let model: string | null = null;

    // Scan backwards for the most recent ModelChangeEntry
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.type === "model_change") {
        const mc = entry as { provider: string; modelId: string };
        model = `${mc.provider}/${mc.modelId}`;
        break;
      }
    }

    // Estimate tokens from message content
    let totalChars = 0;
    for (const entry of entries) {
      if (entry.type === "message") {
        const msg = (entry as any).message;
        if (msg?.content) {
          if (typeof msg.content === "string") {
            totalChars += msg.content.length;
          } else if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
              if (block.type === "text") totalChars += block.text?.length ?? 0;
            }
          }
        }
      }
    }

    return { model, estimatedTokens: Math.ceil(totalChars / 4) };
  } catch {
    return { model: null, estimatedTokens: 0 };
  }
}

/** Collect all descendant session paths (for cascading delete) */
export function collectDescendantPaths(
  sessionPath: string,
  allItems: FlatItem[],
): string[] {
  const paths: string[] = [];
  const targetPaths = new Set<string>([sessionPath]);
  for (const item of allItems) {
    const pp = item.session.parentSessionPath;
    if (pp && targetPaths.has(pp)) {
      paths.push(item.session.path);
      targetPaths.add(item.session.path);
    }
  }
  return paths;
}

/** Relative time without "ago" */
export function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}
