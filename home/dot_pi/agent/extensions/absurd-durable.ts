/**
 * Absurd Durable Checkpoints Extension
 *
 * Persists session turns as Absurd durable steps, providing:
 * - Automatic turn logging (always on when postgres is available)
 * - /durable command for status, resume, and explicit checkpoints
 * - absurd_checkpoint tool for model-driven milestone marking
 *
 * Connection: ABSURD_DATABASE_URL (defaults to postgresql://localhost:5433/absurd)
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
	let client: any = null;
	let taskId: string | null = null;
	let turnCount = 0;
	let sessionId: string | null = null;
	let available = false;

	const DB_URL = process.env.ABSURD_DATABASE_URL || "postgresql://localhost:5433/absurd";
	const QUEUE = "default";

	async function getClient() {
		if (client) return client;
		try {
			const { Absurd } = await import("absurd-sdk");
			client = new Absurd({ queueName: QUEUE, databaseUrl: DB_URL });
			available = true;
			return client;
		} catch {
			available = false;
			return null;
		}
	}

	async function ensureTask(ctx: ExtensionContext) {
		if (taskId) return taskId;

		const sdk = await getClient();
		if (!sdk) return null;

		try {
			sessionId = ctx.sessionManager?.getSessionId?.() || `pi-${Date.now()}`;
			const result = await sdk.spawn("pi-session-checkpoint", {
				sessionId,
				startedAt: new Date().toISOString(),
				cwd: process.cwd(),
			}, {
				idempotencyKey: `pi-session:${sessionId}`,
			});
			taskId = result.taskID;
			return taskId;
		} catch {
			// Postgres unavailable or spawn failed — degrade gracefully
			available = false;
			return null;
		}
	}

	// Always-on: persist each assistant message as a checkpoint
	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;
		if (!available && !client) {
			// First attempt — try to connect
			await getClient();
		}
		if (!available) return;

		const tid = await ensureTask(ctx);
		if (!tid) return;

		turnCount++;

		try {
			const sdk = await getClient();
			if (!sdk) return;

			// Count tool calls in the message
			const toolCalls = event.message.content?.filter?.(
				(c: any) => c.type === "tool_use"
			)?.length || 0;

			// Summarize content (first 200 chars of text)
			const textContent = event.message.content
				?.filter?.((c: any) => c.type === "text")
				?.map?.((c: any) => c.text)
				?.join(" ") || "";
			const summary = textContent.slice(0, 200);

			await sdk.spawn("pi-turn-log", {
				sessionTaskId: tid,
				turn: turnCount,
				toolCalls,
				summary,
				timestamp: new Date().toISOString(),
			}, {
				idempotencyKey: `pi-turn:${sessionId}:${turnCount}`,
			});
		} catch {
			// Silent failure — don't interrupt the session for logging issues
		}
	});

	// /durable command
	pi.registerCommand("durable", {
		description: "Absurd durable checkpoints: status, resume <task-id>",
		handler: async (args, ctx) => {
			const [subcommand, ...rest] = args.trim().split(/\s+/);

			switch (subcommand) {
				case "status": {
					if (!taskId) {
						ctx.ui.notify("No active durable task (postgres may be unavailable)", "info");
						return;
					}
					ctx.ui.notify(
						`Durable: task=${taskId} turns=${turnCount} session=${sessionId}`,
						"info"
					);
					break;
				}
				case "resume": {
					const targetId = rest[0];
					if (!targetId) {
						ctx.ui.notify("Usage: /durable resume <task-id>", "error");
						return;
					}
					ctx.ui.notify(`To inspect previous session: absurdctl dump-task --task-id=${targetId}`, "info");
					break;
				}
				default: {
					ctx.ui.notify(
						"Usage: /durable status | /durable resume <task-id>",
						"info"
					);
				}
			}
		},
	});

	// absurd_checkpoint tool — model can explicitly mark milestones
	pi.registerTool({
		name: "absurd_checkpoint",
		label: "Durable Checkpoint",
		description: "Save a named checkpoint to the durable workflow. Use when completing a significant milestone in multi-step work (after a deploy, after tests pass, after a PR is created).",
		parameters: Type.Object({
			name: Type.String({ description: "Checkpoint name (e.g., 'tests-passing', 'pr-created', 'deployed-staging')" }),
			summary: Type.String({ description: "Brief description of what was accomplished" }),
			data: Type.Optional(Type.Object({}, { additionalProperties: true, description: "Optional structured data to persist" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const sdk = await getClient();
			if (!sdk) {
				return {
					content: [{ type: "text", text: "Checkpoint skipped — Absurd/postgres unavailable" }],
					details: { available: false },
				};
			}

			const tid = await ensureTask(ctx);
			if (!tid) {
				return {
					content: [{ type: "text", text: "Checkpoint skipped — could not create durable task" }],
					details: { available: false },
				};
			}

			try {
				await sdk.spawn("pi-checkpoint", {
					sessionTaskId: tid,
					name: params.name,
					summary: params.summary,
					data: params.data || {},
					turn: turnCount,
					timestamp: new Date().toISOString(),
				}, {
					idempotencyKey: `pi-checkpoint:${sessionId}:${params.name}`,
				});

				return {
					content: [{ type: "text", text: `Checkpoint "${params.name}" saved to Absurd (task ${tid})` }],
					details: { taskId: tid, checkpoint: params.name, turn: turnCount },
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Checkpoint failed: ${err.message}` }],
					details: { error: err.message },
				};
			}
		},
	});

	// Cleanup on session end
	pi.on("session_shutdown", async () => {
		if (client) {
			try {
				await client.close();
			} catch {
				// ignore
			}
			client = null;
		}
	});
}
