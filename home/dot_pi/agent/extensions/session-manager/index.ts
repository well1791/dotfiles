import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import {
  matchesKey,
  Key,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";

// ── Types ──────────────────────────────────────────────────────────────

interface FlatItem {
  session: SessionInfo;
  depth: number;
  isLast: boolean;
  childCount: number;
  ancestors: boolean[]; // ancestors[i] = true if ancestor at depth i isLast (no continuation line needed)
}

type Scope = "project" | "all";

// ── Tree building ──────────────────────────────────────────────────────

function buildTree(sessions: SessionInfo[]): FlatItem[] {
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

  // Get the most recent modification time among a session and all its descendants
  function newestInGroup(path: string): number {
    const s = byPath.get(path);
    let newest = s ? s.modified.getTime() : 0;
    const kids = childrenOf.get(path) ?? [];
    for (const kid of kids) {
      newest = Math.max(newest, newestInGroup(kid.path));
    }
    return newest;
  }

  // Sort roots by the most recent activity in their entire group
  roots.sort((a, b) => newestInGroup(b.path) - newestInGroup(a.path));

  const sortByRecent = (a: SessionInfo, b: SessionInfo) =>
    b.modified.getTime() - a.modified.getTime();

  const result: FlatItem[] = [];

  function countDescendants(path: string): number {
    const kids = childrenOf.get(path) ?? [];
    return kids.reduce((sum, c) => sum + 1 + countDescendants(c.path), 0);
  }

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

// ── Time formatting ────────────────────────────────────────────────────

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Delete helpers ────────────────────────────────────────────────────────

function trashOrDelete(filePath: string): boolean {
  try {
    execSync(`which trash`, { stdio: "ignore" });
    execSync(`trash ${JSON.stringify(filePath)}`, { stdio: "ignore" });
    return true;
  } catch {
    try {
      execSync(`rm ${JSON.stringify(filePath)}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }
}

function collectDescendantPaths(
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

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("sm", {
    description: "Session manager -- browse, search, delete, create sessions",
    handler: async (_args, ctx) => {
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      // State
      let scope: Scope = "project";
      let allItems: FlatItem[] = [];
      let filteredItems: FlatItem[] = [];
      let selectedPaths = new Set<string>();
      let cursorIndex = 0;
      let scrollOffset = 0;
      let deleteConfirm = false;
      let query = "";
      let qCursor = 0; // text cursor position within query
      let loading = true;
      let statusMsg = "";
      let statusTimer: ReturnType<typeof setTimeout> | null = null;
      let renameMode = false;
      let savedQuery = "";
      let savedQCursor = 0;

      function applyFilter() {
        if (renameMode) return; // don't filter while renaming
        if (!query.trim()) {
          filteredItems = [...allItems];
        } else {
          // Strict substring matching: every space-separated token must appear
          const tokens = query.toLowerCase().trim().split(/\s+/);
          filteredItems = allItems.filter((item) => {
            const text = [
              item.session.name ?? "",
              item.session.firstMessage ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return tokens.every((token) => text.includes(token));
          });
        }
        // Clamp cursor
        cursorIndex = Math.min(cursorIndex, Math.max(0, getDisplayCount() - 1));
      }

      function getDisplayCount(): number {
        const hasCreate = query.trim() && filteredItems.length === 0;
        return filteredItems.length + (hasCreate ? 1 : 0);
      }

      function showStatus(msg: string) {
        statusMsg = msg;
        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(() => {
          statusMsg = "";
        }, 3000);
      }

      async function loadSessions() {
        loading = true;
        try {
          const sessions =
            scope === "project"
              ? await SessionManager.list(ctx.cwd)
              : await SessionManager.listAll();
          allItems = buildTree(sessions);
        } catch {
          allItems = [];
        }
        applyFilter();
        loading = false;
      }

      await loadSessions();

      // Focus on the active session by default
      if (currentSessionFile) {
        const activeIdx = filteredItems.findIndex(
          (item) => item.session.path === currentSessionFile,
        );
        if (activeIdx >= 0) cursorIndex = activeIdx;
      }

      const result = await ctx.ui.custom<
        | { action: "resume"; path: string }
        | { action: "create"; name: string }
        | null
      >((tui, theme, _kb, done) => {
        // ── Render helpers ──

        // ANSI color helpers
        const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
        const lightBlue = (s: string) => `\x1b[38;5;159m${s}\x1b[39m`;
        const lightOrange = (s: string) => `\x1b[38;5;217m${s}\x1b[39m`;
        const yellow = (s: string) => `\x1b[38;5;220m${s}\x1b[39m`;
        const teal = (s: string) => `\x1b[38;5;116m${s}\x1b[39m`;
        const white = (s: string) => `\x1b[97m${s}\x1b[39m`;
        const gray = (s: string) => `\x1b[90m${s}\x1b[39m`;
        const gold = (s: string) => `\x1b[38;5;222m${s}\x1b[39m`;

        const dimGray = (s: string) => `\x1b[38;5;242m${s}\x1b[39m`;

        function renderItemLine(
          item: FlatItem,
          index: number,
          width: number,
        ): string[] {
          const isCursor = index === cursorIndex;
          const isSelected = selectedPaths.has(item.session.path);
          const isCurrent = item.session.path === currentSessionFile;
          const hasName = !!item.session.name;
          const isSubagentWorker =
            hasName && item.session.name!.startsWith("subagent-worker-");

          // Tree prefix with recursive continuation lines (indented 2 spaces from parent)
          let prefix = "";
          if (item.depth > 0) {
            for (let d = 0; d < item.depth - 1; d++) {
              prefix += item.ancestors[d + 1] ? "     " : "  │  ";
            }
            prefix += item.isLast ? "  └─ " : "  ├─ ";
          }

          // Markers: ✕ for delete-selected, ◆ for active session, ○ for outside cwd
          const isOutside = item.session.cwd && item.session.cwd !== ctx.cwd;
          const marker = isSelected
            ? "✕ "
            : isCurrent
              ? "◆ "
              : isOutside
                ? "○ "
                : "  ";

          // Name
          const name =
            item.session.name ??
            item.session.firstMessage?.replace(/\n/g, " ").slice(0, 60) ??
            "(empty session)";

          // Child indicator
          const childTag =
            isSelected && item.childCount > 0 ? ` [+${item.childCount}]` : "";

          // Time
          const time = relativeTime(item.session.modified);

          // Short path for sessions outside cwd (last 2 segments)
          const shortPath =
            isOutside && item.session.cwd
              ? item.session.cwd.split("/").slice(-2).join("/")
              : "";

          // Build content (without chevron) to apply text color
          const contentRaw = `${marker}${prefix}${name}${childTag}`;
          const pathRaw = shortPath ? ` ${shortPath} ` : "";
          const rightRaw = ` ${time} `;
          // Chevron is 2 chars wide
          const chevronStr = isCursor ? "❯ " : "  ";
          const availForContent =
            width - 2 - visibleWidth(pathRaw) - visibleWidth(rightRaw); // 2 for chevron
          const contentTrunc = truncateToWidth(
            contentRaw,
            Math.max(availForContent, 10),
          );
          const contentW = visibleWidth(contentTrunc);
          const gap = Math.max(
            1,
            width - 2 - contentW - visibleWidth(pathRaw) - visibleWidth(rightRaw),
          );

          // Color function based on state
          const colorFn = isSelected
            ? red
            : isCurrent
              ? lightBlue
              : isSubagentWorker
                ? yellow
                : hasName
                  ? white
                  : lightOrange;

          // Build colored body: content + gap in session color, path in dimGray, time in session color
          const coloredBody = shortPath
            ? colorFn(contentTrunc + " ".repeat(gap)) +
              dimGray(pathRaw) +
              colorFn(rightRaw)
            : colorFn(contentTrunc + " ".repeat(gap) + rightRaw);

          // Chevron always gold
          const coloredChevron = isCursor ? gold(chevronStr) : "  ";

          // Combine
          const fullLine = coloredChevron + coloredBody;

          // Apply hover background (preserves text colors)
          const mainLine = isCursor
            ? theme.bg("selectedBg", fullLine)
            : fullLine;

          return [mainLine];
        }

        function renderCreateLine(index: number, width: number): string {
          const isCursor = index === cursorIndex;
          const chevronStr = isCursor ? gold("❯ ") : "  ";
          const label = `  Create a new session named: \"${query.trim()}\"  (press enter)`;
          const full = truncateToWidth(label, width - 2);
          const coloredBody = isCursor ? white(full) : theme.fg("muted", full);
          const line = chevronStr + coloredBody;
          if (isCursor) {
            return theme.bg("selectedBg", line);
          }
          return line;
        }

        return {
          render(width: number): string[] {
            const lines: string[] = [];

            // Top bar + title
            const scopeLabel = scope === "project" ? "Current Folder" : "All";
            lines.push(teal("─".repeat(width)));
            const modeLabel = renameMode ? ` Rename Session ` : ` Session Manager `;
            lines.push(teal(modeLabel) + gray(`[${scopeLabel}]`));

            // Search input line
            const before = query.slice(0, qCursor);
            const cursorChar = query[qCursor] ?? " ";
            const after = query.slice(qCursor + 1);
            const inputDisplay = `  > ${before}\x1b[7m${cursorChar}\x1b[27m${after}`;
            lines.push(white(inputDisplay));
            lines.push("");

            if (loading) {
              lines.push(theme.fg("muted", "  Loading..."));
            } else {
              const displayCount = getDisplayCount();
              const hasCreate = query.trim() && filteredItems.length === 0;

              if (displayCount === 0) {
                lines.push(theme.fg("muted", "  No sessions"));
              } else {
                // Viewport — fixed max 11 lines, simple follow scrolling
                const maxLines = 11;

                // Only scroll when cursor goes out of visible window
                if (cursorIndex < scrollOffset) {
                  scrollOffset = cursorIndex;
                } else if (cursorIndex >= scrollOffset + maxLines) {
                  scrollOffset = cursorIndex - maxLines + 1;
                }

                // Render items within the line budget
                let linesRendered = 0;
                let itemsShown = 0;
                for (let i = scrollOffset; i < displayCount; i++) {
                  let itemLines: string[];
                  if (hasCreate && i === filteredItems.length) {
                    itemLines = [renderCreateLine(i, width)];
                  } else {
                    itemLines = renderItemLine(filteredItems[i], i, width);
                  }
                  if (linesRendered + itemLines.length > maxLines && itemsShown > 0) break;
                  lines.push(...itemLines);
                  linesRendered += itemLines.length;
                  itemsShown++;
                }

                // Scroll indicator
                if (scrollOffset > 0 || scrollOffset + itemsShown < displayCount) {
                  lines.push(
                    theme.fg(
                      "dim",
                      `  ${scrollOffset + 1}-${scrollOffset + itemsShown} of ${displayCount}`,
                    ),
                  );
                }
              }
            }

            // Selection count
            if (selectedPaths.size > 0) {
              lines.push(red(`  ${selectedPaths.size} selected for deletion`));
            }

            lines.push("");

            // Confirm / status
            if (deleteConfirm) {
              let childrenIncluded = 0;
              for (const p of selectedPaths) {
                for (const d of collectDescendantPaths(p, allItems)) {
                  if (!selectedPaths.has(d)) childrenIncluded++;
                }
              }
              const childNote =
                childrenIncluded > 0 ? ` (+${childrenIncluded} children)` : "";
              lines.push(
                red(
                  `  Delete ${selectedPaths.size}${childNote}? ^X confirm, esc cancel`,
                ),
              );
            } else if (statusMsg) {
              lines.push(theme.fg("success", `  ${statusMsg}`));
            }

            // Help + bottom bar
            lines.push(
              gray(
              renameMode
                ? "  type new name  enter save  esc cancel"
                : "  ↑↓ nav  tab sel  enter go  ^R rename  ^X del  ^M scope  esc quit",
            ),
            );
            lines.push(teal("─".repeat(width)));

            return lines;
          },

          invalidate() {},

          handleInput(data: string) {
            // Delete confirm mode
            if (deleteConfirm) {
              if (matchesKey(data, Key.ctrl("x"))) {
                // Execute deletion
                const toDelete = new Set<string>();
                for (const p of selectedPaths) {
                  toDelete.add(p);
                  for (const d of collectDescendantPaths(p, allItems)) {
                    toDelete.add(d);
                  }
                }
                let deleted = 0;
                for (const path of toDelete) {
                  if (!existsSync(path)) continue;
                  if (trashOrDelete(path)) deleted++;
                }
                selectedPaths.clear();
                deleteConfirm = false;
                showStatus(`Deleted ${deleted}`);
                loadSessions().then(() => tui.requestRender());
                return;
              }
              // Escape or any other key cancels confirm
              deleteConfirm = false;
              tui.requestRender();
              return;
            }

            // Navigation (disabled in rename mode)
            if (matchesKey(data, Key.up)) {
              if (!renameMode && cursorIndex > 0) cursorIndex--;
              tui.requestRender();
              return;
            }
            if (matchesKey(data, Key.down)) {
              const max = getDisplayCount() - 1;
              if (!renameMode && cursorIndex < max) cursorIndex++;
              tui.requestRender();
              return;
            }

            // Tab — toggle selection
            if (matchesKey(data, Key.tab)) {
              if (cursorIndex < filteredItems.length) {
                const path = filteredItems[cursorIndex].session.path;
                if (selectedPaths.has(path)) {
                  selectedPaths.delete(path);
                } else {
                  selectedPaths.add(path);
                }
              }
              tui.requestRender();
              return;
            }

            // Ctrl+X — delete
            if (matchesKey(data, Key.ctrl("x"))) {
              // If nothing selected, auto-select item under cursor
              if (
                selectedPaths.size === 0 &&
                cursorIndex < filteredItems.length
              ) {
                selectedPaths.add(filteredItems[cursorIndex].session.path);
              }
              if (selectedPaths.size > 0) {
                deleteConfirm = true;
                tui.requestRender();
              }
              return;
            }

            // Enter — rename (in rename mode), resume, or create
            if (matchesKey(data, Key.enter)) {
              if (renameMode) {
                const newName = query.trim();
                if (newName && cursorIndex < filteredItems.length) {
                  const targetPath = filteredItems[cursorIndex].session.path;
                  try {
                    const sm = SessionManager.open(targetPath);
                    sm.appendSessionInfo(newName);
                    showStatus(`Renamed → ${newName}`);
                  } catch {
                    showStatus("Rename failed");
                  }
                }
                renameMode = false;
                query = savedQuery;
                qCursor = savedQCursor;
                loadSessions().then(() => tui.requestRender());
                return;
              }
              const hasCreate = query.trim() && filteredItems.length === 0;
              if (hasCreate && cursorIndex === filteredItems.length) {
                done({ action: "create", name: query.trim() });
              } else if (cursorIndex < filteredItems.length) {
                done({
                  action: "resume",
                  path: filteredItems[cursorIndex].session.path,
                });
              }
              return;
            }

            // Ctrl+R — rename focused session
            if (matchesKey(data, Key.ctrl("r"))) {
              if (renameMode) return; // already in rename mode
              if (cursorIndex >= filteredItems.length) return;
              const item = filteredItems[cursorIndex];
              renameMode = true;
              savedQuery = query;
              savedQCursor = qCursor;
              query = item.session.name ?? "";
              qCursor = query.length;
              tui.requestRender();
              return;
            }

            // Ctrl+M — scope toggle
            if (matchesKey(data, Key.ctrl("m"))) {
              scope = scope === "project" ? "all" : "project";
              selectedPaths.clear();
              loading = true;
              tui.requestRender();
              loadSessions().then(() => tui.requestRender());
              return;
            }

            // Escape — cancel rename, clear selection, or exit
            if (matchesKey(data, Key.escape)) {
              if (renameMode) {
                renameMode = false;
                query = savedQuery;
                qCursor = savedQCursor;
                tui.requestRender();
                return;
              }
              if (selectedPaths.size > 0) {
                selectedPaths.clear();
                tui.requestRender();
                return;
              }
              done(null);
              return;
            }

            // Text input — handle typing with cursor position

            // PgUp — scroll up a page
            if (matchesKey(data, "pageup")) {
              const page = 8;
              cursorIndex = Math.max(0, cursorIndex - page);
              tui.requestRender();
              return;
            }

            // PgDn — scroll down a page
            if (matchesKey(data, "pagedown")) {
              const page = 8;
              cursorIndex = Math.min(getDisplayCount() - 1, cursorIndex + page);
              tui.requestRender();
              return;
            }

            // Home / Ctrl+A — beginning of line
            if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl("a"))) {
              qCursor = 0;
              tui.requestRender();
              return;
            }

            // End / Ctrl+E — end of line
            if (matchesKey(data, Key.end) || matchesKey(data, "ctrl+e")) {
              qCursor = query.length;
              tui.requestRender();
              return;
            }

            // Ctrl+Left / Alt+B — move word left
            if (matchesKey(data, "ctrl+left") || matchesKey(data, "alt+b")) {
              if (qCursor > 0) {
                // Skip trailing spaces, then skip word chars
                let i = qCursor - 1;
                while (i > 0 && query[i] === " ") i--;
                while (i > 0 && query[i - 1] !== " ") i--;
                qCursor = i;
              }
              tui.requestRender();
              return;
            }

            // Ctrl+Right / Alt+F — move word right
            if (matchesKey(data, "ctrl+right") || matchesKey(data, "alt+f")) {
              if (qCursor < query.length) {
                let i = qCursor;
                while (i < query.length && query[i] !== " ") i++;
                while (i < query.length && query[i] === " ") i++;
                qCursor = i;
              }
              tui.requestRender();
              return;
            }

            // Left — move cursor left
            if (matchesKey(data, Key.left)) {
              if (qCursor > 0) qCursor--;
              tui.requestRender();
              return;
            }

            // Right — move cursor right
            if (matchesKey(data, Key.right)) {
              if (qCursor < query.length) qCursor++;
              tui.requestRender();
              return;
            }

            // Ctrl+Backspace — delete word backwards
            if (matchesKey(data, "ctrl+backspace")) {
              if (qCursor > 0) {
                let i = qCursor - 1;
                while (i > 0 && query[i] === " ") i--;
                while (i > 0 && query[i - 1] !== " ") i--;
                query = query.slice(0, i) + query.slice(qCursor);
                qCursor = i;
                applyFilter();
                tui.requestRender();
              }
              return;
            }

            // Backspace — delete char before cursor
            if (matchesKey(data, Key.backspace)) {
              if (qCursor > 0) {
                query = query.slice(0, qCursor - 1) + query.slice(qCursor);
                qCursor--;
                applyFilter();
                tui.requestRender();
              }
              return;
            }

            // Delete — delete char at cursor
            if (matchesKey(data, Key.delete)) {
              if (qCursor < query.length) {
                query = query.slice(0, qCursor) + query.slice(qCursor + 1);
                applyFilter();
                tui.requestRender();
              }
              return;
            }

            // Ctrl+U — clear input
            if (matchesKey(data, "ctrl+u")) {
              query = "";
              qCursor = 0;
              applyFilter();
              tui.requestRender();
              return;
            }

            // Ctrl+W — delete word backwards (same as ctrl+backspace)
            if (matchesKey(data, "ctrl+w")) {
              if (qCursor > 0) {
                let i = qCursor - 1;
                while (i > 0 && query[i] === " ") i--;
                while (i > 0 && query[i - 1] !== " ") i--;
                query = query.slice(0, i) + query.slice(qCursor);
                qCursor = i;
                applyFilter();
                tui.requestRender();
              }
              return;
            }

            // Bracketed paste — strip \x1b[200~ and \x1b[201~ markers
            if (data.startsWith("\x1b[200~")) {
              const text = data.replace(/\x1b\[200~/g, "").replace(/\x1b\[201~/g, "");
              if (text.length > 0) {
                query = query.slice(0, qCursor) + text + query.slice(qCursor);
                qCursor += text.length;
                applyFilter();
                tui.requestRender();
              }
              return;
            }

            // Printable characters — insert at cursor
            if (data.length === 1 && data.charCodeAt(0) >= 32) {
              query = query.slice(0, qCursor) + data + query.slice(qCursor);
              qCursor++;
              applyFilter();
              tui.requestRender();
              return;
            }

            // Multi-byte printable (unicode)
            if (data.length > 1 && !data.startsWith("\x1b")) {
              query = query.slice(0, qCursor) + data + query.slice(qCursor);
              qCursor += data.length;
              applyFilter();
              tui.requestRender();
              return;
            }
          },
        };
      });

      // Handle result
      if (!result) return;

      if (result.action === "resume") {
        await ctx.switchSession(result.path);
      } else if (result.action === "create") {
        await ctx.newSession({
          setup: async (sm) => {
            sm.appendSessionInfo(result.name);
          },
        });
      }
    },
  });
}
