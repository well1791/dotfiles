// home/dot_pi/agent/extensions/session-manager/dialogs.ts

import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { colorize } from "./config.ts";
import type { SMConfig } from "./types.ts";

type ModelChoice = "switch" | "keep" | "cancel";

export async function showModelMismatchDialog(
  ctx: { ui: any },
  sessionModel: string,
  activeModel: string,
  config: SMConfig,
): Promise<ModelChoice> {
  return ctx.ui.custom<ModelChoice>((tui: any, _theme: any, _kb: any, done: (r: ModelChoice) => void) => {
    let selected: 0 | 1 = 0;

    return {
      render(width: number): string[] {
        const lines: string[] = [];
        const borderColor = config.colors.border;
        const mutedColor = config.colors.muted;
        const textColor = config.colors.text;
        const goldColor = config.colors.gold;

        lines.push(colorize("─".repeat(width), borderColor));
        lines.push("");
        lines.push(colorize("  session model: ", mutedColor) + colorize(sessionModel, textColor));
        lines.push(colorize("  active model:  ", mutedColor) + colorize(activeModel, textColor));
        lines.push("");

        const switchLabel = `switch to ${sessionModel}`;
        const keepLabel = `keep ${activeModel}`;

        const switchRendered = selected === 0
          ? colorize(`[${switchLabel}]`, goldColor)
          : colorize(`[${switchLabel}]`, mutedColor);
        const keepRendered = selected === 1
          ? colorize(`[${keepLabel}]`, goldColor)
          : colorize(`[${keepLabel}]`, mutedColor);

        const chevron0 = selected === 0 ? colorize("❯ ", goldColor) : "  ";
        const chevron1 = selected === 1 ? colorize("❯ ", goldColor) : "  ";

        lines.push(`  ${chevron0}${switchRendered}  ${chevron1}${keepRendered}`);
        lines.push("");
        lines.push(colorize("  press esc to go back", mutedColor));
        lines.push(colorize("─".repeat(width), borderColor));

        return lines;
      },

      invalidate() {},

      handleInput(data: string) {
        if (matchesKey(data, Key.escape)) { done("cancel"); return; }
        if (matchesKey(data, Key.enter)) { done(selected === 0 ? "switch" : "keep"); return; }
        if (matchesKey(data, Key.left) || matchesKey(data, Key.right) || matchesKey(data, Key.tab)) {
          selected = selected === 0 ? 1 : 0;
          tui.requestRender();
          return;
        }
      },
    };
  });
}

// ─── Tree Picker (Fork) ───

interface MessageItem {
  entryId: string;
  role: "user" | "assistant";
  text: string;
  depth: number;
  isLast: boolean;
  ancestors: boolean[];
}

function extractMessageText(entry: SessionEntry): { role: "user" | "assistant"; text: string } | null {
  if (entry.type !== "message") return null;
  const msg = (entry as any).message;
  if (!msg || !("role" in msg)) return null;
  if (msg.role === "user") {
    const content = msg.content;
    const text = typeof content === "string"
      ? content
      : (Array.isArray(content)
          ? content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
          : "");
    return { role: "user", text: text.replace(/\n/g, " ").trim() };
  }
  if (msg.role === "assistant") {
    const content = msg.content;
    const text = Array.isArray(content)
      ? content.filter((c: any) => c.type === "text").map((c: any) => c.text).join(" ")
      : "";
    return { role: "assistant", text: text.replace(/\n/g, " ").trim() };
  }
  return null;
}

function fuzzyMatch(text: string, query: string): boolean {
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

export async function showTreePicker(
  ctx: { ui: any },
  sessionPath: string,
  config: SMConfig,
): Promise<string | null> {
  let sm: InstanceType<typeof SessionManager>;
  try {
    sm = SessionManager.open(sessionPath);
  } catch {
    ctx.ui.notify("Fork failed: could not open session file", "error");
    return null;
  }

  const leafId = sm.getLeafId();
  if (!leafId) {
    ctx.ui.notify("Fork failed: session has no entries", "error");
    return null;
  }

  let tree: { entry: SessionEntry; children: any[] }[];
  try {
    tree = sm.getTree() as { entry: SessionEntry; children: any[] }[];
  } catch {
    ctx.ui.notify("Fork failed: could not read session tree", "error");
    return null;
  }

  const allMessages: MessageItem[] = [];
  function walkTree(
    nodes: { entry: SessionEntry; children: any[] }[],
    depth: number,
    ancestors: boolean[],
  ) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const isLast = i === nodes.length - 1;
      const parsed = extractMessageText(node.entry);
      if (parsed && !(parsed.role === "assistant" && !parsed.text)) {
        allMessages.push({
          entryId: node.entry.id,
          role: parsed.role,
          text: parsed.text,
          depth: nodes.length > 1 ? depth : 0,
          isLast,
          ancestors,
        });
      }
      if (node.children.length > 0) {
        const nextDepth = node.children.length > 1 ? depth + 1 : (nodes.length > 1 ? depth : 0);
        walkTree(node.children, nextDepth, [...ancestors, isLast]);
      }
    }
  }
  walkTree(tree, 0, []);

  if (allMessages.length === 0) {
    ctx.ui.notify("Fork failed: session has no user/assistant messages", "error");
    return null;
  }

  let tpFiltered = [...allMessages];
  let tpCursor = tpFiltered.length - 1;
  while (tpCursor > 0 && tpFiltered[tpCursor].role === "user") tpCursor--;
  let tpScroll = 0;
  let tpQuery = "";
  let tpQCursor = 0;
  const PROSE_WIDTH = 75;

  function tpApplyFilter() {
    if (!tpQuery.trim()) {
      tpFiltered = [...allMessages];
    } else {
      tpFiltered = allMessages.filter((m) => fuzzyMatch(m.text, tpQuery));
    }
    tpCursor = Math.min(tpCursor, Math.max(0, tpFiltered.length - 1));
    while (tpCursor > 0 && tpFiltered[tpCursor]?.role === "user") tpCursor--;
    if (tpFiltered[tpCursor]?.role === "user") {
      let fwd = tpCursor + 1;
      while (fwd < tpFiltered.length && tpFiltered[fwd].role === "user") fwd++;
      if (fwd < tpFiltered.length) tpCursor = fwd;
    }
  }

  return ctx.ui.custom<string | null>((tui: any, _theme: any, _kb: any, done: (r: string | null) => void) => {
    const borderColor = config.colors.border;
    const textColor = config.colors.text;
    const mutedColor = config.colors.muted;
    const goldColor = config.colors.gold;
    const activeColor = config.colors.active;

    return {
      render(width: number): string[] {
        const lines: string[] = [];
        const maxTextWidth = Math.min(width - 8, PROSE_WIDTH);

        lines.push(colorize("─".repeat(width), borderColor));
        lines.push(colorize(" Fork Session ", borderColor) + colorize("pick a message to fork from", mutedColor));

        const before = tpQuery.slice(0, tpQCursor);
        const cursorChar = tpQuery[tpQCursor] ?? " ";
        const after = tpQuery.slice(tpQCursor + 1);
        lines.push(colorize(`  > ${before}`, textColor) + `\x1b[7m${cursorChar}\x1b[27m` + colorize(after, textColor));
        lines.push("");

        if (tpFiltered.length === 0) {
          lines.push(colorize("  No matching messages", mutedColor));
        } else {
          const maxLines = 11;
          if (tpCursor < tpScroll) tpScroll = tpCursor;
          else if (tpCursor >= tpScroll + maxLines) tpScroll = tpCursor - maxLines + 1;

          let rendered = 0;
          for (let i = tpScroll; i < tpFiltered.length && rendered < maxLines; i++) {
            const m = tpFiltered[i];
            const isCursorItem = i === tpCursor;
            const isUser = m.role === "user";

            let treePrefix = "";
            if (m.depth > 0) {
              for (let d = 0; d < m.depth - 1; d++) {
                treePrefix += m.ancestors[d + 1] ? "   " : "│  ";
              }
              treePrefix += m.isLast ? "└─ " : "├─ ";
            }

            const chevron = isUser ? "  " : (isCursorItem ? colorize("❯ ", goldColor) : "  ");
            const roleTag = isUser ? colorize("U ", mutedColor) : colorize("A ", activeColor);
            const prefixWidth = visibleWidth(treePrefix);
            const availText = Math.max(10, maxTextWidth - prefixWidth);
            const textTrunc = truncateToWidth(m.text || "(empty)", availText);
            const coloredPrefix = colorize(treePrefix, mutedColor);
            const coloredText = isUser ? colorize(textTrunc, mutedColor) : colorize(textTrunc, activeColor);
            const line = chevron + roleTag + coloredPrefix + coloredText;
            lines.push(isCursorItem && !isUser ? `\x1b[48;5;236m${line}\x1b[49m` : line);
            rendered++;
          }

          if (tpScroll > 0 || tpScroll + rendered < tpFiltered.length) {
            lines.push(colorize(`  ${tpScroll + 1}-${tpScroll + rendered} of ${tpFiltered.length}`, mutedColor));
          }
        }

        lines.push("");
        lines.push(
          "  " +
          colorize("↑↓", config.colors.shortcutKey) + " " + colorize("nav", mutedColor) + "  " +
          colorize("enter", config.colors.shortcutKey) + " " + colorize("fork", mutedColor) + "  " +
          colorize("esc", config.colors.shortcutKey) + " " + colorize("back", mutedColor),
        );
        lines.push(colorize("─".repeat(width), borderColor));
        return lines;
      },

      invalidate() {},

      handleInput(data: string) {
        if (matchesKey(data, Key.escape)) { done(null); return; }
        if (matchesKey(data, Key.enter)) {
          if (tpCursor >= 0 && tpCursor < tpFiltered.length && tpFiltered[tpCursor].role === "assistant") {
            done(tpFiltered[tpCursor].entryId);
          }
          return;
        }
        if (matchesKey(data, Key.up)) {
          let next = tpCursor - 1;
          while (next >= 0 && tpFiltered[next].role === "user") next--;
          if (next >= 0) tpCursor = next;
          tui.requestRender(); return;
        }
        if (matchesKey(data, Key.down)) {
          let next = tpCursor + 1;
          while (next < tpFiltered.length && tpFiltered[next].role === "user") next++;
          if (next < tpFiltered.length) tpCursor = next;
          tui.requestRender(); return;
        }
        if (matchesKey(data, Key.backspace)) {
          if (tpQCursor > 0) {
            tpQuery = tpQuery.slice(0, tpQCursor - 1) + tpQuery.slice(tpQCursor);
            tpQCursor--;
            tpApplyFilter();
            tui.requestRender();
          }
          return;
        }
        if (matchesKey(data, "ctrl+u")) {
          tpQuery = ""; tpQCursor = 0; tpApplyFilter(); tui.requestRender(); return;
        }
        if (data.length === 1 && data.charCodeAt(0) >= 32) {
          tpQuery = tpQuery.slice(0, tpQCursor) + data + tpQuery.slice(tpQCursor);
          tpQCursor++;
          tpApplyFilter();
          tui.requestRender();
          return;
        }
        if (data.length > 1 && !data.startsWith("\x1b")) {
          tpQuery = tpQuery.slice(0, tpQCursor) + data + tpQuery.slice(tpQCursor);
          tpQCursor += data.length;
          tpApplyFilter();
          tui.requestRender();
          return;
        }
      },
    };
  });
}
