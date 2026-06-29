// home/dot_pi/agent/extensions/session-manager/types.ts

import type { SessionInfo } from "@earendil-works/pi-coding-agent";

export type Scope = "project" | "all";

export type ColorKey =
  | "active"
  | "recent"
  | "unnamed"
  | "hidden"
  | "subagent"
  | "border"
  | "text"
  | "muted"
  | "gold"
  | "error"
  | "shortcutKey";

export type ShortcutKey =
  | "delete"
  | "rename"
  | "fork"
  | "scope"
  | "toggleHidden"
  | "select";

export interface SMConfig {
  shortcuts: Record<ShortcutKey, string>;
  colors: Record<ColorKey, string>;
}

export interface FlatItem {
  session: SessionInfo;
  depth: number;
  isLast: boolean;
  childCount: number;
  ancestors: boolean[]; // ancestors[i] = true if ancestor at depth i isLast
}

/** Cached metadata extracted from session file (viewport-lazy loaded) */
export interface SessionMeta {
  model: string | null; // "provider/modelId" or null if never set
  estimatedTokens: number;
}
