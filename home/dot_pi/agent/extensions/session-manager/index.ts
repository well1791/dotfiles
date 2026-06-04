import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename } from "node:path";

// ── Types ──────────────────────────────────────────────────────────────

interface FlatItem {
  session: SessionInfo;
  depth: number;
  isLast: boolean;
  childCount: number;
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

  const sortByRecent = (a: SessionInfo, b: SessionInfo) =>
    b.modified.getTime() - a.modified.getTime();
  roots.sort(sortByRecent);

  const result: FlatItem[] = [];

  function countDescendants(path: string): number {
    const kids = childrenOf.get(path) ?? [];
    return kids.reduce((sum, c) => sum + 1 + countDescendants(c.path), 0);
  }

  function walk(s: SessionInfo, depth: number, isLast: boolean) {
    result.push({
      session: s,
      depth,
      isLast,
      childCount: countDescendants(s.path),
    });
    const kids = (childrenOf.get(s.path) ?? []).sort(sortByRecent);
    for (let i = 0; i < kids.length; i++) {
      walk(kids[i], depth + 1, i === kids.length - 1);
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], 0, i === roots.length - 1);
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

// ── Engram + delete helpers ────────────────────────────────────────────

function isSubagentSession(path: string): boolean {
  return /\/[0-9a-f]{8}\/run-\d+\/session\.jsonl$/.test(path);
}

function extractSessionSummary(session: SessionInfo): string {
  let models: string[] = [];
  let totalCost = 0;
  try {
    const content = readFileSync(session.path, "utf8");
    const lines = content.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "message" && entry.message?.role === "assistant") {
          if (entry.message.model) models.push(entry.message.model);
          totalCost += entry.message.usage?.cost?.total ?? 0;
        }
      } catch {}
    }
  } catch {}
  models = [...new Set(models)];

  return [
    `## Session Summary (pre-delete)`,
    ``,
    `**Session ID**: ${session.id}`,
    `**File**: ${basename(session.path)}`,
    `**Messages**: ${session.messageCount}`,
    `**Models used**: ${models.join(", ") || "unknown"}`,
    `**Total cost**: $${totalCost.toFixed(4)}`,
    `**First message**: ${session.name ?? session.firstMessage?.slice(0, 200) ?? "(empty)"}`,
    ``,
    `### Content`,
    session.allMessagesText?.slice(0, 500) || session.firstMessage?.slice(0, 200) || "(empty session)",
  ].join("\n");
}

function saveToEngram(content: string, cwd: string): boolean {
  try {
    const project = cwd.split("/").filter(Boolean).pop();
    const args = [
      "save",
      JSON.stringify("Session summary (pre-delete)"),
      JSON.stringify(content),
      "--type", "session_summary",
      "--scope", "project",
    ];
    if (project) args.push("--project", JSON.stringify(project));
    execSync(`engram ${args.join(" ")}`, { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

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

function collectDescendantPaths(sessionPath: string, allItems: FlatItem[]): string[] {
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

      function applyFilter() {
        if (!query.trim()) {
          filteredItems = [...allItems];
        } else {
          // Strict substring matching: every space-separated token must appear
          const tokens = query.toLowerCase().trim().split(/\s+/);
          filteredItems = allItems.filter((item) => {
            const text = [
              item.session.name ?? "",
              item.session.firstMessage ?? "",
            ].join(" ").toLowerCase();
            return tokens.every((token) => text.includes(token));
          });
        }
        // Clamp cursor
        cursorIndex = Math.min(cursorIndex, Math.max(0, getDisplayCount() - 1));
        scrollOffset = 0;
      }

      function getDisplayCount(): number {
        const hasCreate = query.trim() && filteredItems.length === 0;
        return filteredItems.length + (hasCreate ? 1 : 0);
      }

      function showStatus(msg: string) {
        statusMsg = msg;
        if (statusTimer) clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { statusMsg = ""; }, 3000);
      }

      async function loadSessions() {
        loading = true;
        try {
          const sessions = scope === "project"
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

      const result = await ctx.ui.custom<
        { action: "resume"; path: string } |
        { action: "create"; name: string } |
        null
      >((tui, theme, _kb, done) => {

        // ── Render helpers ──

        // ANSI color helpers
        const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
        const lightBlue = (s: string) => `\x1b[38;5;153m${s}\x1b[39m`;
        const teal = (s: string) => `\x1b[38;5;116m${s}\x1b[39m`;
        const white = (s: string) => `\x1b[97m${s}\x1b[39m`;
        const gray = (s: string) => `\x1b[90m${s}\x1b[39m`;
        const gold = (s: string) => `\x1b[38;5;222m${s}\x1b[39m`;

        function renderItemLine(item: FlatItem, index: number, width: number): string {
          const isCursor = index === cursorIndex;
          const isSelected = selectedPaths.has(item.session.path);
          const isCurrent = item.session.path === currentSessionFile;
          const hasName = !!item.session.name;

          // Tree prefix
          let prefix = "";
          if (item.depth > 0) {
            prefix = "  ".repeat(item.depth) + (item.isLast ? "└─ " : "├─ ");
          }

          // Markers: ✕ for delete-selected, ◆ for active session
          const marker = isSelected ? "✕ " : isCurrent ? "◆ " : "  ";

          // Name
          const name = item.session.name
            ?? item.session.firstMessage?.slice(0, 60)
            ?? "(empty session)";

          // Child indicator
          const childTag = isSelected && item.childCount > 0
            ? ` [+${item.childCount}]`
            : "";

          // Time
          const time = relativeTime(item.session.modified);

          // Build content (without chevron) to apply text color
          const contentRaw = `${marker}${prefix}${name}${childTag}`;
          const rightRaw = ` ${time} `;
          // Chevron is 2 chars wide
          const chevronStr = isCursor ? "❯ " : "  ";
          const availForContent = width - 2 - visibleWidth(rightRaw); // 2 for chevron
          const contentTrunc = truncateToWidth(contentRaw, Math.max(availForContent, 10));
          const contentW = visibleWidth(contentTrunc);
          const gap = Math.max(1, width - 2 - contentW - visibleWidth(rightRaw));
          const body = contentTrunc + " ".repeat(gap) + rightRaw;

          // Apply text color to body based on state
          let coloredBody: string;
          if (isSelected) {
            coloredBody = red(body);
          } else if (isCurrent) {
            coloredBody = gold(body);
          } else if (hasName) {
            coloredBody = lightBlue(body);
          } else {
            coloredBody = white(body);
          }

          // Chevron always gold when cursor is on this item
          const coloredChevron = isCursor ? gold(chevronStr) : "  ";

          // Combine
          const fullLine = coloredChevron + coloredBody;

          // Apply hover background (preserves text colors)
          if (isCursor) {
            return theme.bg("selectedBg", fullLine);
          }
          return fullLine;
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
            lines.push(teal(` Session Manager `) + gray(`[${scopeLabel}]`));

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
                // Viewport
                const termH = process.stdout.rows ?? 40;
                const maxVisible = Math.max(5, termH - 10);

                // Scroll to keep cursor visible
                if (cursorIndex < scrollOffset) scrollOffset = cursorIndex;
                if (cursorIndex >= scrollOffset + maxVisible) scrollOffset = cursorIndex - maxVisible + 1;

                const visStart = scrollOffset;
                const visEnd = Math.min(displayCount, visStart + maxVisible);

                for (let i = visStart; i < visEnd; i++) {
                  if (hasCreate && i === filteredItems.length) {
                    lines.push(renderCreateLine(i, width));
                  } else {
                    lines.push(renderItemLine(filteredItems[i], i, width));
                  }
                }

                // Scroll info
                if (displayCount > maxVisible) {
                  lines.push(theme.fg("dim", `  ${visStart + 1}-${visEnd} of ${displayCount}`));
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
              const childNote = childrenIncluded > 0 ? ` (+${childrenIncluded} children)` : "";
              lines.push(red(`  Delete ${selectedPaths.size}${childNote}? ^X confirm, esc cancel`));
            } else if (statusMsg) {
              lines.push(theme.fg("success", `  ${statusMsg}`));
            }

            // Help + bottom bar
            lines.push(gray("  ↑↓ nav  tab sel  enter go  ^X del  ^M scope  esc quit"));
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
                let engramCount = 0;
                for (const path of toDelete) {
                  const item = allItems.find((i) => i.session.path === path);
                  if (!item || !existsSync(path)) continue;
                  if (!isSubagentSession(path)) {
                    const summary = extractSessionSummary(item.session);
                    if (saveToEngram(summary, item.session.cwd || ctx.cwd)) engramCount++;
                  }
                  if (trashOrDelete(path)) deleted++;
                }
                selectedPaths.clear();
                deleteConfirm = false;
                showStatus(`Deleted ${deleted}${engramCount > 0 ? `, ${engramCount} saved to Engram` : ""}`);
                loadSessions().then(() => tui.requestRender());
                return;
              }
              // Escape or any other key cancels confirm
              deleteConfirm = false;
              tui.requestRender();
              return;
            }

            // Navigation
            if (matchesKey(data, Key.up)) {
              if (cursorIndex > 0) cursorIndex--;
              tui.requestRender();
              return;
            }
            if (matchesKey(data, Key.down)) {
              const max = getDisplayCount() - 1;
              if (cursorIndex < max) cursorIndex++;
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
              if (selectedPaths.size === 0 && cursorIndex < filteredItems.length) {
                selectedPaths.add(filteredItems[cursorIndex].session.path);
              }
              if (selectedPaths.size > 0) {
                deleteConfirm = true;
                tui.requestRender();
              }
              return;
            }

            // Enter — resume or create
            if (matchesKey(data, Key.enter)) {
              const hasCreate = query.trim() && filteredItems.length === 0;
              if (hasCreate && cursorIndex === filteredItems.length) {
                done({ action: "create", name: query.trim() });
              } else if (cursorIndex < filteredItems.length) {
                done({ action: "resume", path: filteredItems[cursorIndex].session.path });
              }
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

            // Escape — cancel
            if (matchesKey(data, Key.escape)) {
              done(null);
              return;
            }

            // Text input — handle typing with cursor position

            // PgUp — scroll up a page
            if (matchesKey(data, "pageup")) {
              const termH = process.stdout.rows ?? 40;
              const page = Math.max(5, termH - 10);
              cursorIndex = Math.max(0, cursorIndex - page);
              tui.requestRender();
              return;
            }

            // PgDn — scroll down a page
            if (matchesKey(data, "pagedown")) {
              const termH = process.stdout.rows ?? 40;
              const page = Math.max(5, termH - 10);
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
