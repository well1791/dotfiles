import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

import { VIEWPORT_SIZE } from "./constants.ts";
import type { FlatItem, Scope, SessionMeta } from "./types.ts";
import { loadConfig } from "./config.ts";
import {
  buildTree,
  loadSessionMeta,
  collectDescendantPaths,
} from "./tree.ts";
import {
  renderTopBar,
  renderItemLine,
  renderCreateLine,
  renderStatusLine,
  renderHelpLine,
  renderPaginationLine,
} from "./render.ts";
import {
  showModelMismatchDialog,
  showTreePicker,
} from "./dialogs.ts";

/**
 * Async trash/delete using pi.exec() instead of execSync.
 * Caches the trash command availability check.
 */
let hasTrashCmd: boolean | null = null;

function trashOrDelete(filePath: string): boolean {
  if (hasTrashCmd === null) {
    try {
      execFileSync("which", ["trash"], { stdio: "ignore" });
      hasTrashCmd = true;
    } catch {
      hasTrashCmd = false;
    }
  }
  try {
    if (hasTrashCmd) {
      execFileSync("trash", [filePath], { stdio: "ignore" });
    } else {
      execFileSync("rm", ["-rf", filePath], { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("sm", {
    description: "Session manager -- browse, search, delete, create sessions",
    handler: async (_args, ctx) => {
      const cfg = loadConfig((msg) => ctx.ui.notify(msg, "error"));
      const currentSessionFile = ctx.sessionManager.getSessionFile();

      // State
      let scope: Scope = "project";
      let allItems: FlatItem[] = [];
      let filteredItems: FlatItem[] = [];
      let selectedPaths = new Set<string>();
      let cursorIndex = 0;
      let scrollOffset = 0;
      let query = "";
      let qCursor = 0;
      let loading = true;
      let statusMsg = "";
      let statusTimer: ReturnType<typeof setTimeout> | null = null;
      let renameMode = false;
      let savedQuery = "";
      let savedQCursor = 0;
      let showHidden = false;

      // Viewport-lazy metadata cache
      const metaCache = new Map<string, SessionMeta>();

      function applyFilter() {
        if (renameMode) return;
        if (!query.trim()) {
          filteredItems = showHidden
            ? [...allItems]
            : allItems.filter((item) => !item.session.name?.startsWith("."));
        } else {
          const tokens = query.toLowerCase().trim().split(/\s+/);
          filteredItems = allItems.filter((item) => {
            // Hidden filter
            if (!showHidden && item.session.name?.startsWith(".")) return false;
            const text = [
              item.session.name ?? "",
              item.session.firstMessage ?? "",
            ]
              .join(" ")
              .toLowerCase();
            return tokens.every((token) => text.includes(token));
          });
        }
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
        metaCache.clear();
        applyFilter();
        loading = false;
      }

      /**
       * Schedule metadata load for visible viewport items.
       * Deferred via setTimeout to avoid blocking initial render.
       */
      let metaLoadPending = false;
      function scheduleMetaLoad(tui: any) {
        if (metaLoadPending) return;
        const start = scrollOffset;
        const end = Math.min(start + VIEWPORT_SIZE, filteredItems.length);
        // Check if any items need loading
        let needsLoad = false;
        for (let i = start; i < end; i++) {
          if (!metaCache.has(filteredItems[i].session.path)) {
            needsLoad = true;
            break;
          }
        }
        if (!needsLoad) return;
        metaLoadPending = true;
        setTimeout(() => {
          const s = scrollOffset;
          const e = Math.min(s + VIEWPORT_SIZE, filteredItems.length);
          for (let i = s; i < e; i++) {
            const path = filteredItems[i].session.path;
            if (!metaCache.has(path)) {
              metaCache.set(path, loadSessionMeta(path));
            }
          }
          metaLoadPending = false;
          tui.requestRender();
        }, 0);
      }

      await loadSessions();

      // Focus on the active session by default
      if (currentSessionFile) {
        const activeIdx = filteredItems.findIndex(
          (item) => item.session.path === currentSessionFile,
        );
        if (activeIdx >= 0) cursorIndex = activeIdx;
      }

      // Main loop — re-enters after fork operations
      let shouldContinue = true;
      let forceRenameSessionPath: string | null = null;

      while (shouldContinue) {
        shouldContinue = false;

        // If returning from a fork, reload and activate rename mode
        if (forceRenameSessionPath) {
          await loadSessions();
          const newIdx = filteredItems.findIndex(
            (item) => item.session.path === forceRenameSessionPath,
          );
          if (newIdx >= 0) {
            cursorIndex = newIdx;
            scrollOffset = Math.max(0, cursorIndex - 5);
            renameMode = true;
            savedQuery = query;
            savedQCursor = qCursor;
            query = filteredItems[newIdx].session.name ?? "";
            qCursor = query.length;
          }
          forceRenameSessionPath = null;
        }

        const result = await ctx.ui.custom<
          | { action: "resume"; path: string }
          | { action: "create"; name: string }
          | { action: "fork"; path: string }
          | null
        >((tui, theme, _kb, done) => {
          return {
            render(width: number): string[] {
              const lines: string[] = [];

              // Top bar
              lines.push(
                ...renderTopBar({
                  width,
                  scope,
                  renameMode,
                  query,
                  qCursor,
                  config: cfg,
                }),
              );

              if (loading) {
                lines.push(theme.fg("muted", "  Loading..."));
              } else {
                const displayCount = getDisplayCount();
                const hiddenCount = allItems.filter((item) => item.session.name?.startsWith(".")).length;
                const hasCreate = query.trim() && filteredItems.length === 0;

                if (displayCount === 0) {
                  lines.push(theme.fg("muted", "  No sessions"));
                } else {
                  scheduleMetaLoad(tui);

                  // Viewport scrolling
                  if (cursorIndex < scrollOffset) {
                    scrollOffset = cursorIndex;
                  } else if (cursorIndex >= scrollOffset + VIEWPORT_SIZE) {
                    scrollOffset = cursorIndex - VIEWPORT_SIZE + 1;
                  }

                  let linesRendered = 0;
                  let itemsShown = 0;
                  for (let i = scrollOffset; i < displayCount; i++) {
                    let itemLines: string[];
                    if (hasCreate && i === filteredItems.length) {
                      itemLines = [renderCreateLine({ index: i, width, cursorIndex, query, config: cfg })];
                    } else {
                      itemLines = renderItemLine({
                        item: filteredItems[i],
                        index: i,
                        width,
                        cursorIndex,
                        selectedPaths,
                        currentSessionFile,
                        scope,
                        cwd: ctx.cwd,
                        config: cfg,
                        showHidden,
                      });
                    }
                    if (linesRendered + itemLines.length > VIEWPORT_SIZE && itemsShown > 0) break;
                    lines.push(...itemLines);
                    linesRendered += itemLines.length;
                    itemsShown++;
                  }

                  if (scrollOffset > 0 || scrollOffset + itemsShown < displayCount || hiddenCount > 0) {
                    lines.push(
                      renderPaginationLine(scrollOffset, itemsShown, displayCount, hiddenCount, cfg),
                    );
                  }
                }
              }

              // Selection count
              if (selectedPaths.size > 0) {
                lines.push(
                  theme.fg("error", `  ${selectedPaths.size} selected for deletion`),
                );
              }

              // Status line (metadata for focused item)
              const focusedItem = cursorIndex < filteredItems.length ? filteredItems[cursorIndex] : undefined;
              const meta = focusedItem ? metaCache.get(focusedItem.session.path) : undefined;
              const contextUsage = currentSessionFile && focusedItem?.session.path === currentSessionFile
                ? ctx.getContextUsage()
                : undefined;
              lines.push(
                renderStatusLine({
                  width,
                  focusedItem,
                  meta,
                  currentSessionFile,
                  contextUsage,
                  config: cfg,
                }),
              );

              lines.push("");

              // Status message
              if (statusMsg) {
                lines.push(theme.fg("success", `  ${statusMsg}`));
              }

              // Help + bottom bar
              lines.push(renderHelpLine({ width, config: cfg, renameMode }));
              lines.push(
                theme.fg("dim", "─".repeat(width)),
              );

              return lines;
            },

            invalidate() {},

            handleInput(data: string) {
              // Navigation
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
              if (matchesKey(data, "pageup")) {
                cursorIndex = Math.max(0, cursorIndex - 8);
                tui.requestRender();
                return;
              }
              if (matchesKey(data, "pagedown")) {
                cursorIndex = Math.min(getDisplayCount() - 1, cursorIndex + 8);
                tui.requestRender();
                return;
              }

              // Tab — toggle selection
              if (matchesKey(data, cfg.shortcuts.select)) {
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

              // Hard Delete (immediate)
              if (matchesKey(data, cfg.shortcuts.delete)) {
                const targets = selectedPaths.size > 0
                  ? [...selectedPaths]
                  : cursorIndex < filteredItems.length
                    ? [filteredItems[cursorIndex].session.path]
                    : [];
                if (targets.length === 0) return;
                const toDelete = new Set<string>();
                for (const p of targets) {
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
                showStatus(`Deleted ${deleted}`);
                loadSessions().then(() => tui.requestRender());
                return;
              }

              // Soft Delete (toggle dot-prefix, includes descendants)
              if (matchesKey(data, cfg.shortcuts.softDelete)) {
                const rootPaths = selectedPaths.size > 0
                  ? [...selectedPaths]
                  : cursorIndex < filteredItems.length
                    ? [filteredItems[cursorIndex].session.path]
                    : [];
                if (rootPaths.length === 0) return;
                // Expand to include descendants
                const allPaths = new Set<string>();
                for (const p of rootPaths) {
                  allPaths.add(p);
                  for (const d of collectDescendantPaths(p, allItems)) {
                    allPaths.add(d);
                  }
                }
                const targets = [...allPaths]
                  .map((p) => allItems.find((i) => i.session.path === p))
                  .filter(Boolean) as FlatItem[];
                if (targets.length === 0) return;
                const allHidden = targets.every((item) => {
                  const name = item.session.name ?? item.session.firstMessage?.replace(/\n/g, " ").slice(0, 40) ?? "session";
                  return name.startsWith(".");
                });
                let count = 0;
                for (const item of targets) {
                  const currentName = item.session.name ?? item.session.firstMessage?.replace(/\n/g, " ").slice(0, 40) ?? "session";
                  try {
                    const sm = SessionManager.open(item.session.path);
                    if (allHidden) {
                      sm.appendSessionInfo(currentName.slice(1));
                    } else if (!currentName.startsWith(".")) {
                      sm.appendSessionInfo(`.${currentName}`);
                    }
                    count++;
                  } catch { /* skip failures */ }
                }
                selectedPaths.clear();
                showStatus(allHidden ? `Unhidden ${count}` : `Hidden ${count}`);
                loadSessions().then(() => tui.requestRender());
                return;
              }

              // Enter — rename, resume, or create
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
                  done({ action: "resume", path: filteredItems[cursorIndex].session.path });
                }
                return;
              }

              // Rename
              if (matchesKey(data, cfg.shortcuts.rename)) {
                if (renameMode) return;
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

              // Fork
              if (matchesKey(data, cfg.shortcuts.fork)) {
                if (renameMode) return;
                if (cursorIndex >= filteredItems.length) return;
                const item = filteredItems[cursorIndex];
                done({ action: "fork", path: item.session.path });
                return;
              }

              // Toggle hidden
              if (matchesKey(data, cfg.shortcuts.toggleHidden)) {
                showHidden = !showHidden;
                applyFilter();
                tui.requestRender();
                return;
              }

              // Scope toggle
              if (matchesKey(data, cfg.shortcuts.scope)) {
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

              // Text input cursor movement
              if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl("a"))) {
                qCursor = 0;
                tui.requestRender();
                return;
              }
              if (matchesKey(data, Key.end) || matchesKey(data, "ctrl+e")) {
                qCursor = query.length;
                tui.requestRender();
                return;
              }
              if (matchesKey(data, "alt+b")) {
                if (qCursor > 0) {
                  let i = qCursor - 1;
                  while (i > 0 && query[i] === " ") i--;
                  while (i > 0 && query[i - 1] !== " ") i--;
                  qCursor = i;
                }
                tui.requestRender();
                return;
              }
              if (matchesKey(data, "alt+f")) {
                if (qCursor < query.length) {
                  let i = qCursor;
                  while (i < query.length && query[i] !== " ") i++;
                  while (i < query.length && query[i] === " ") i++;
                  qCursor = i;
                }
                tui.requestRender();
                return;
              }
              if (matchesKey(data, Key.left)) {
                if (qCursor > 0) qCursor--;
                tui.requestRender();
                return;
              }
              if (matchesKey(data, Key.right)) {
                if (qCursor < query.length) qCursor++;
                tui.requestRender();
                return;
              }

              // Text editing
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
              if (matchesKey(data, "ctrl+k")) {
                query = query.slice(0, qCursor);
                applyFilter();
                tui.requestRender();
                return;
              }
              if (matchesKey(data, "ctrl+u")) {
                query = "";
                qCursor = 0;
                applyFilter();
                tui.requestRender();
                return;
              }
              if (matchesKey(data, Key.backspace)) {
                if (qCursor > 0) {
                  query = query.slice(0, qCursor - 1) + query.slice(qCursor);
                  qCursor--;
                  applyFilter();
                  tui.requestRender();
                }
                return;
              }
              if (matchesKey(data, Key.delete)) {
                if (qCursor < query.length) {
                  query = query.slice(0, qCursor) + query.slice(qCursor + 1);
                  applyFilter();
                  tui.requestRender();
                }
                return;
              }

              // Bracketed paste
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

              // Printable characters
              if (data.length === 1 && data.charCodeAt(0) >= 32) {
                query = query.slice(0, qCursor) + data + query.slice(qCursor);
                qCursor++;
                applyFilter();
                tui.requestRender();
                return;
              }

              // Multi-byte unicode
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

        if (result.action === "fork") {
          const selectedEntryId = await showTreePicker(ctx, result.path, cfg);
          if (selectedEntryId) {
            try {
              const sm = SessionManager.open(result.path);
              const newSessionFile = sm.createBranchedSession(selectedEntryId);
              if (newSessionFile) {
                const sourceName = sm.getSessionName();
                const forkName = sourceName ? `${sourceName} (fork)` : "(fork)";
                const newSm = SessionManager.open(newSessionFile);
                newSm.appendSessionInfo(forkName);
                forceRenameSessionPath = newSessionFile;
                shouldContinue = true;
              } else {
                ctx.ui.notify("Fork failed: session is not persisted", "error");
                shouldContinue = true;
              }
            } catch (err: any) {
              ctx.ui.notify(
                `Fork failed: ${err?.message ?? "unknown error"}`,
                "error",
              );
              shouldContinue = true;
            }
          } else {
            shouldContinue = true;
          }
          continue;
        }

        if (result.action === "resume") {
          // Model mismatch check
          const targetMeta = metaCache.get(result.path) ?? loadSessionMeta(result.path);
          const activeModel = ctx.model
            ? `${ctx.model.provider}/${ctx.model.id}`
            : null;

          if (targetMeta.model && activeModel && targetMeta.model !== activeModel) {
            const sessionModelDisplay = targetMeta.model.split("/").pop() ?? targetMeta.model;
            const activeModelDisplay = ctx.model?.name ?? ctx.model?.id ?? activeModel;
            const choice = await showModelMismatchDialog(
              ctx,
              sessionModelDisplay,
              activeModelDisplay,
              cfg,
            );
            if (choice === "cancel") continue;
            if (choice === "switch") {
              const [provider, modelId] = targetMeta.model.split("/");
              const model = ctx.modelRegistry.find(provider, modelId);
              if (model) await pi.setModel(model);
            }
          }

          await ctx.switchSession(result.path);
        } else if (result.action === "create") {
          await ctx.newSession({
            setup: async (sm) => {
              sm.appendSessionInfo(result.name);
            },
          });
        }
      }
    },
  });
}
