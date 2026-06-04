/**
 * Session rename extension.
 *
 * /rename [name] - set name directly
 * /rename        - prompt with current name pre-filled for editing
 * ctrl+shift+n   - same as /rename (no args)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	async function promptRename(ctx: ExtensionContext) {
		if (!ctx.hasUI) {
			ctx.ui.notify("rename requires interactive mode", "error");
			return;
		}

		// Get current name or derive from first user message
		let currentName = pi.getSessionName() ?? "";
		if (!currentName) {
			const branch = ctx.sessionManager.getBranch();
			for (const entry of branch) {
				if (entry.type === "message" && "role" in entry.message && entry.message.role === "user") {
					const text = entry.message.content
						.filter((c): c is { type: "text"; text: string } => c.type === "text")
						.map((c) => c.text)
						.join(" ");
					if (text) {
						currentName = text.slice(0, 70);
						break;
					}
				}
			}
		}

		if (!currentName) {
			ctx.ui.notify("Nothing to name — no user messages found", "info");
			return;
		}

		const newName = await ctx.ui.editor("Rename session:", currentName);
		if (newName?.trim()) {
			pi.setSessionName(newName.trim());
			ctx.ui.notify(`Session named: ${newName.trim()}`, "info");
		}
	}

	pi.registerCommand("rename", {
		description: "Rename session (usage: /rename [name], or /rename to edit current name)",
		handler: async (args, ctx) => {
			const trimmed = args.trim();

			if (trimmed) {
				pi.setSessionName(trimmed);
				ctx.ui.notify(`Session named: ${trimmed}`, "info");
				return;
			}

			await promptRename(ctx);
		},
	});

	// pi.registerShortcut("alt+n", {
	// 	description: "Rename session",
	// 	handler: async (ctx) => {
	// 		await promptRename(ctx);
	// 	},
	// });
}
