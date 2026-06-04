import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename } from "node:path";

// ── Helpers ────────────────────────────────────────────────────────────

function extractSessionSummary(sessionFile: string, entries: any[]): string {
  const header = (() => {
    try {
      const firstLine = readFileSync(sessionFile, "utf8").split("\n")[0];
      return JSON.parse(firstLine);
    } catch {
      return {};
    }
  })();

  const messages = entries.filter((e: any) => e.type === "message" && e.message);
  const userMessages = messages.filter((e: any) => e.message.role === "user");
  const assistantMessages = messages.filter((e: any) => e.message.role === "assistant");

  const firstMessage = userMessages[0]?.message?.content;
  const firstText =
    typeof firstMessage === "string"
      ? firstMessage
      : Array.isArray(firstMessage)
        ? (firstMessage.find((c: any) => c.type === "text")?.text ?? "")
        : "";

  const models = [...new Set(
    assistantMessages.map((e: any) => e.message.model).filter(Boolean),
  )];

  const totalCost = assistantMessages.reduce(
    (sum: number, e: any) => sum + (e.message.usage?.cost?.total ?? 0),
    0,
  );

  const topics = userMessages
    .slice(0, 10)
    .map((e: any) => {
      const c = e.message.content;
      const text = typeof c === "string"
        ? c
        : Array.isArray(c)
          ? (c.find((b: any) => b.type === "text")?.text ?? "")
          : "";
      return text.slice(0, 150);
    })
    .join("\n- ");

  return [
    `## Session Summary (pre-delete)`,
    ``,
    `**Session ID**: ${header.id ?? "unknown"}`,
    `**File**: ${basename(sessionFile)}`,
    `**Messages**: ${messages.length}`,
    `**Models used**: ${models.join(", ") || "unknown"}`,
    `**Total cost**: $${totalCost.toFixed(4)}`,
    `**First message**: ${firstText.slice(0, 200)}`,
    ``,
    `### Topics discussed`,
    `- ${topics || "(empty session)"}`,
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

// ── Extension ──────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("del", {
    description: "Delete session",
    handler: async (_args, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile();

      if (!sessionFile) {
        ctx.ui.notify("No session file (ephemeral session)", "warn");
        return;
      }

      if (!existsSync(sessionFile)) {
        ctx.ui.notify("Session file not found", "error");
        return;
      }

      // Ask about Engram summary (default: yes)
      const sessionName = ctx.sessionManager.getSessionName();
      const displayName = sessionName ?? basename(sessionFile);
      const shouldSummarize = await ctx.ui.confirm(
        "Summarize session",
        `Save summary of "${displayName}" to memory before deleting?`,
      );

      if (shouldSummarize) {
        const entries = ctx.sessionManager.getEntries();
        const content = extractSessionSummary(sessionFile, entries);
        const saved = saveToEngram(content, ctx.cwd);
        if (saved) {
          ctx.ui.notify("Session summarized to Engram", "info");
        } else {
          ctx.ui.notify("Engram unavailable, skipping summary", "warn");
        }
      }

      // Delete the session file
      const deleted = trashOrDelete(sessionFile);
      if (!deleted) {
        ctx.ui.notify("Failed to delete session file", "error");
        return;
      }

      ctx.ui.notify(`Deleted: ${displayName}`, "info");

      // Switch to a new session
      await ctx.newSession();
    },
  });
}
