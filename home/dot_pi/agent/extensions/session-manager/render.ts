// home/dot_pi/agent/extensions/session-manager/render.ts

import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { applyColor, colorize } from "./config.ts";
import { relativeTime } from "./tree.ts";
import type { FlatItem, SessionMeta, SMConfig, Scope } from "./types.ts";

interface RenderItemOptions {
  item: FlatItem;
  index: number;
  width: number;
  cursorIndex: number;
  selectedPaths: Set<string>;
  currentSessionFile: string | undefined;
  scope: Scope;
  cwd: string;
  config: SMConfig;
  showHidden: boolean;
}

export function renderItemLine(opts: RenderItemOptions): string[] {
  const { item, index, width, cursorIndex, selectedPaths, currentSessionFile, scope, cwd, config } = opts;
  const isCursor = index === cursorIndex;
  const isSelected = selectedPaths.has(item.session.path);
  const isCurrent = item.session.path === currentSessionFile;
  const hasName = !!item.session.name;
  const isHidden = hasName && item.session.name!.startsWith(".");
  const isSubagentWorker = hasName && item.session.name!.startsWith("subagent-worker-");
  const isOutside = item.session.cwd && item.session.cwd !== cwd;
  const isInCwd = item.session.cwd && item.session.cwd === cwd;
  const isRecent = (Date.now() - item.session.modified.getTime()) < 3600000;

  // Tree prefix
  let prefix = "";
  if (item.depth > 0) {
    prefix += item.ancestors[1] ? "     " : "  │  ";
    for (let d = 1; d < item.depth - 1; d++) {
      prefix += item.ancestors[d + 1] ? "   " : "│  ";
    }
    if (item.depth === 1) {
      prefix = item.isLast ? "  └─ " : "  ├─ ";
    } else {
      prefix += item.isLast ? "└─ " : "├─ ";
    }
  }

  // Markers
  const marker = isSelected
    ? "✕ "
    : isCurrent
      ? "◆ "
      : isRecent
        ? "◇ "
        : scope === "all" && isOutside
          ? "○ "
          : scope === "all" && isInCwd
            ? "● "
            : "  ";

  const name =
    item.session.name ??
    item.session.firstMessage?.replace(/\n/g, " ").slice(0, 60) ??
    "(empty session)";

  const childTag = isSelected && item.childCount > 0 ? ` [+${item.childCount}]` : "";
  const time = relativeTime(item.session.modified);

  const shortPath =
    scope === "all" && item.session.cwd
      ? item.session.cwd.split("/").slice(-2).join("/")
      : "";

  const contentRaw = `${marker}${prefix}${name}${childTag}`;
  const pathRaw = shortPath ? ` ${shortPath} ` : "";
  const rightRaw = ` ${time} `;
  const chevronStr = isCursor ? "❯ " : "  ";
  const availForContent = width - 2 - visibleWidth(pathRaw) - visibleWidth(rightRaw);
  const contentTrunc = truncateToWidth(contentRaw, Math.max(availForContent, 10));
  const contentW = visibleWidth(contentTrunc);
  const gap = Math.max(1, width - 2 - contentW - visibleWidth(pathRaw) - visibleWidth(rightRaw));

  const colorKey = isSelected
    ? "error"
    : isHidden
      ? "hidden"
      : isCurrent
        ? "active"
        : isRecent
          ? "gold"
          : isSubagentWorker
            ? "subagent"
            : hasName
              ? "text"
              : "unnamed";

  const color = config.colors[colorKey as keyof typeof config.colors] ?? config.colors.text;
  const dimColor = config.colors.muted;

  const coloredBody = shortPath
    ? colorize(contentTrunc + " ".repeat(gap), color) +
      colorize(pathRaw, dimColor) +
      colorize(rightRaw, color)
    : colorize(contentTrunc + " ".repeat(gap) + rightRaw, color);

  const coloredChevron = isCursor ? applyColor(chevronStr, "gold", config) : "  ";
  const fullLine = coloredChevron + coloredBody;
  const mainLine = isCursor ? `\x1b[48;5;236m${fullLine}\x1b[49m` : fullLine;

  return [mainLine];
}

interface RenderCreateOptions {
  index: number;
  width: number;
  cursorIndex: number;
  query: string;
  config: SMConfig;
}

export function renderCreateLine(opts: RenderCreateOptions): string {
  const { index, width, cursorIndex, query, config } = opts;
  const isCursor = index === cursorIndex;
  const chevronStr = isCursor ? applyColor("❯ ", "gold", config) : "  ";
  const label = `  Create a new session named: "${query.trim()}"  (press enter)`;
  const full = truncateToWidth(label, width - 2);
  const coloredBody = isCursor ? applyColor(full, "text", config) : applyColor(full, "muted", config);
  const line = chevronStr + coloredBody;
  return isCursor ? `\x1b[48;5;236m${line}\x1b[49m` : line;
}

interface RenderStatusOptions {
  width: number;
  focusedItem: FlatItem | undefined;
  meta: SessionMeta | undefined;
  currentSessionFile: string | undefined;
  contextUsage: { percent: number | null } | undefined;
  config: SMConfig;
}

export function renderStatusLine(opts: RenderStatusOptions): string {
  const { width, focusedItem, meta, currentSessionFile, contextUsage, config } = opts;

  let left = "";
  if (focusedItem) {
    const msgCount = `${focusedItem.session.messageCount} msg`;

    let ctxPct = "--";
    const isActive = focusedItem.session.path === currentSessionFile;
    if (isActive && contextUsage?.percent != null) {
      ctxPct = `${contextUsage.percent.toFixed(1)}%`;
    } else if (meta && meta.estimatedTokens > 0) {
      const tokens = meta.estimatedTokens;
      const estimated = (tokens / 200000) * 100;
      const tokenLabel = tokens >= 1000000
        ? `${(tokens / 1000000).toFixed(1)}M`
        : `${Math.round(tokens / 1000)}k`;
      ctxPct = `~${estimated.toFixed(1)}%/${tokenLabel}`;
    }

    const modelName = meta?.model
      ? meta.model.split("/").pop() ?? "--"
      : "--";

    left = `  ${msgCount} · ${ctxPct} · ${modelName}`;
  }

  const leftW = visibleWidth(left);
  const padding = Math.max(1, width - leftW);

  return applyColor(left, "muted", config) + " ".repeat(padding);
}

export function renderPaginationLine(
  scrollOffset: number,
  itemsShown: number,
  displayCount: number,
  hiddenCount: number,
  config: SMConfig,
): string {
  let label = `  ${scrollOffset + 1}-${scrollOffset + itemsShown} of ${displayCount}`;
  if (hiddenCount > 0) label += ` \u00b7 ${hiddenCount} hidden`;
  return applyColor(label, "muted", config);
}

interface RenderHelpOptions {
  width: number;
  config: SMConfig;
  renameMode: boolean;
}

export function renderHelpLine(opts: RenderHelpOptions): string {
  const { config, renameMode } = opts;
  const keyColor = config.colors.shortcutKey;
  const mutedColor = config.colors.muted;

  if (renameMode) {
    return "  " +
      colorize("type", mutedColor) + " " +
      colorize("new name", mutedColor) + "  " +
      colorize("enter", keyColor) + " " +
      colorize("save", mutedColor) + "  " +
      colorize("esc", keyColor) + " " +
      colorize("cancel", mutedColor);
  }

  return "  " +
    colorize("tab", keyColor) + " " + colorize("sel", mutedColor) + "  " +
    colorize("^R", keyColor) + " " + colorize("rename", mutedColor) + "  " +
    colorize("^F", keyColor) + " " + colorize("fork", mutedColor) + "  " +
    colorize("^M", keyColor) + " " + colorize("scope", mutedColor) + "  " +
    colorize("^D", keyColor) + " " + colorize("s-del", mutedColor) + "  " +
    colorize("^X", keyColor) + " " + colorize("h-del", mutedColor) + "  " +
    colorize("^H", keyColor) + " " + colorize("hidden", mutedColor);
}

interface RenderTopBarOptions {
  width: number;
  scope: Scope;
  renameMode: boolean;
  query: string;
  qCursor: number;
  config: SMConfig;
}

export function renderTopBar(opts: RenderTopBarOptions): string[] {
  const { width, scope, renameMode, query, qCursor, config } = opts;
  const lines: string[] = [];

  lines.push(applyColor("─".repeat(width), "border", config));

  const scopeLabel = scope === "project" ? "Current Folder" : "All";
  const modeLabel = renameMode ? " Rename Session " : " Session Manager ";
  lines.push(
    applyColor(modeLabel, "border", config) +
    applyColor(`[${scopeLabel}]`, "muted", config),
  );

  const before = query.slice(0, qCursor);
  const cursorChar = query[qCursor] ?? " ";
  const after = query.slice(qCursor + 1);
  const inputDisplay = `  > ${before}\x1b[7m${cursorChar}\x1b[27m${after}`;
  lines.push(applyColor(inputDisplay, "text", config));
  lines.push("");

  return lines;
}
