---
name: absurd
description: Durable workflow execution with Absurd. Use when work involves external waits, recurring tasks, crash recovery, cross-session continuity, or when the user says "use absurd" / "make this durable".
---

# Absurd — Durable Workflows for Pi

Use this skill when the work involves durable execution, long-running tasks, external waits, recurring schedules, crash recovery, or when the user mentions `absurdctl`, queues, tasks, runs, retries, sleeping tasks, or events.

## Mental Model

- A **queue** is a namespace of Absurd tables (`t_`, `r_`, `c_`, `e_`, `w_`).
- A **task** is the durable workflow instance.
- A **run** is one execution attempt of a task.
- A **step** is a checkpoint. Completed step results are stored as JSON and never re-execute.
- **Sleeping** tasks are waiting for time or an event.
- **Events** wake waiting tasks. Event payloads are cached; first emit wins.

Key distinction: `task_id` = the whole workflow across all attempts. `run_id` = one specific execution attempt.

## Connection

```
ABSURD_DATABASE_URL=postgresql://localhost:5433/absurd
```

Connection precedence: `--database` > `ABSURD_DATABASE_URL` > `PGDATABASE` > `postgresql://localhost/absurd`

## Debugging Workflow

Prefer **`absurdctl` state inspection before source inspection**. Start with state, not code.

### 1) Discover queues

```sh
absurdctl list-queues
```

### 2) Inspect recent activity

```sh
absurdctl list-tasks --queue=default --limit=20
```

### 3) Focus on failures or sleepers

```sh
absurdctl list-tasks --queue=default --status=failed --limit=20
absurdctl list-tasks --queue=default --status=sleeping --limit=20
```

### 4) Inspect one workflow in detail

```sh
absurdctl dump-task --task-id=<task-id>
absurdctl dump-task --run-id=<run-id>
```

`dump-task` shows: task name, params, retry settings, checkpointed step state, waits/events/sleep state, final result or failure.

## Reasoning About States

### Failed tasks

1. `dump-task --task-id=<id>` — read the failure and last successful checkpoints
2. Search code for the task implementation by task name
3. Decide: retry (`absurdctl retry-task`) or fix code first

### Sleeping tasks

1. `dump-task --task-id=<id>` — find the wait reason (timestamp or event name)
2. If waiting for an event the user wants delivered: `absurdctl emit-event <name> -P key=value`

### Running tasks

1. `dump-task --task-id=<id>` — see how far it got via checkpoints
2. If stuck: check worker process/logs

### Pending tasks

- If tasks stay `pending`, no worker is running for that queue
- Start a worker: `bun run worker.ts` in the project that registered the task

## Common Actions

### Spawn work

```sh
absurdctl spawn-task my-task -P name=Alice -P count:=42
absurdctl spawn-task my-task --idempotency-key="unique-key-here" -P foo=bar
```

### Retry failed work

```sh
absurdctl retry-task <task-id>
absurdctl retry-task <task-id> --max-attempts 5
```

### Cancel work

```sh
absurdctl cancel-task <task-id>
```

### Emit events to wake sleeping tasks

```sh
absurdctl emit-event "ci.passed:pr-42" -P sha=abc123
absurdctl emit-event "approval.granted:order-99" -P approvedBy=user
```

### Schema management

```sh
absurdctl schema-version
absurdctl migrate
absurdctl init
absurdctl create-queue <name>
```

## Safe Operating Rules

State-changing commands require care. Unless the user clearly wants them, confirm before running: `init`, `migrate`, `create-queue`, `drop-queue`, `cleanup`, `cancel-task`, `retry-task`, `emit-event`, `spawn-task`.

---

## Writing Workers

### TypeScript template (bun + absurd-sdk)

```typescript
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

app.registerTask({ name: 'my-task-name' }, async (params, ctx) => {
  // Step 1: checkpointed operation (won't re-run on retry)
  const result = await ctx.step('step-name', async () => {
    // Side effect goes here (API call, file write, etc.)
    return { key: 'value' };
  });

  // Step 2: wait for external signal
  const event = await ctx.awaitEvent(
    `event.name:${params.id}`,
    { timeout: 3600 } // seconds
  );

  // Step 3: final operation using previous results
  await ctx.step('finalize', async () => {
    return { done: true, data: result, event };
  });

  return { completed: true };
});

console.log('Worker listening on queue: default');
await app.startWorker({ concurrency: 2 });
```

### Setup for a new worker project

```sh
mkdir my-workflow && cd my-workflow
echo '{ "name": "my-workflow", "type": "module" }' > package.json
bun add absurd-sdk
```

### Step design principles

- Put ALL side effects inside `ctx.step()` — API calls, file writes, notifications, deployments
- Steps are named checkpoints — completed steps return cached value on retry
- Code OUTSIDE steps may run multiple times across retries — keep it pure
- Keep steps small and focused — one logical operation per step
- Use descriptive step names: `send-notification`, `create-pr`, `deploy-staging`

### Event naming conventions

- Dot-separated namespace + colon + entity ID: `domain.action:entity-id`
- Examples: `ci.passed:pr-42`, `review.approved:pr-42`, `deploy.complete:staging`
- Include the entity ID so multiple concurrent workflows don't collide

### Running workers

- Development: `bun run worker.ts`
- Background: run in a tmux/zellij pane
- Persistent: create a systemd user service (same pattern as `absurd-postgres.service`)

---

## Workflow Patterns

### Pattern: PR Lifecycle

A task that tracks a PR from creation to merge, waiting for CI and review.

```typescript
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

app.registerTask({ name: 'pr-lifecycle' }, async (params, ctx) => {
  const pr = await ctx.step('create-pr', async () => {
    // Create PR via git/API
    return { prNumber: params.prNumber, repo: params.repo };
  });

  await ctx.step('post-jira-comment', async () => {
    // Link PR to Jira ticket
    return { commented: true, ticket: params.ticketKey };
  });

  // Suspend until CI passes (emitted by CI webhook or another pi session)
  const ci = await ctx.awaitEvent(
    `ci.passed:${pr.repo}:pr-${pr.prNumber}`,
    { timeout: 7200 }
  );

  // Suspend until review approved
  const review = await ctx.awaitEvent(
    `review.approved:${pr.repo}:pr-${pr.prNumber}`,
    { timeout: 86400 }
  );

  await ctx.step('merge-pr', async () => {
    // Merge the PR
    return { merged: true, sha: ci.headSha };
  });

  await ctx.step('transition-jira', async () => {
    // Move ticket to Done
    return { transitioned: true, ticket: params.ticketKey };
  });

  return { pr: pr.prNumber, merged: true };
});

await app.startWorker();
```

**Spawn:** `absurdctl spawn-task pr-lifecycle -P prNumber:=42 -P repo=myapp -P ticketKey=PROJ-123`

**Wake:** `absurdctl emit-event "ci.passed:myapp:pr-42" -P headSha=abc123`

**Wake:** `absurdctl emit-event "review.approved:myapp:pr-42" -P reviewer=alice`

---

### Pattern: Scheduled Maintenance (Cron)

A spawner script that uses idempotency keys to safely run on a schedule.

```typescript
import { createHash } from 'node:crypto';
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

// Spawner — run this from cron or pg_cron
function dedupKey(taskName: string, slot: string): string {
  const raw = `${taskName}|${slot}`;
  return `cron:${createHash('sha256').update(raw).digest('hex').slice(0, 24)}`;
}

const now = new Date();
const slot = now.toISOString().slice(0, 16); // minute precision

await app.spawn('daily-cleanup', { scheduledFor: now.toISOString() }, {
  idempotencyKey: dedupKey('daily-cleanup', slot),
});

await app.close();
```

Worker for the scheduled task:

```typescript
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

app.registerTask({ name: 'daily-cleanup' }, async (params, ctx) => {
  await ctx.step('cleanup-old-sessions', async () => {
    // Delete pi sessions older than 30 days
    return { deleted: 12 };
  });

  await ctx.step('prune-git-branches', async () => {
    // Remove merged branches
    return { pruned: ['feat/old-1', 'feat/old-2'] };
  });

  await ctx.step('report', async () => {
    return { completedAt: new Date().toISOString() };
  });

  return { success: true };
});

await app.startWorker();
```

**Spawn (idempotent):** Run the spawner script on a schedule — duplicates collapse via idempotency key.

---

### Pattern: Multi-step Deployment

Build, test, deploy, verify — each step checkpointed. Failure at any point resumes from last checkpoint.

```typescript
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

app.registerTask({ name: 'deploy-service' }, async (params, ctx) => {
  const build = await ctx.step('build', async () => {
    // Run build command, capture artifact hash
    return { artifact: `build-${params.version}.tar.gz`, sha: 'abc123' };
  });

  const tests = await ctx.step('run-tests', async () => {
    // Run test suite against the build
    return { passed: 47, failed: 0, duration: '2m34s' };
  });

  if (tests.failed > 0) {
    return { deployed: false, reason: 'tests-failed', tests };
  }

  await ctx.step('deploy-staging', async () => {
    // Deploy to staging environment
    return { env: 'staging', artifact: build.artifact };
  });

  // Wait for smoke test signal (manual or automated)
  const smoke = await ctx.awaitEvent(
    `smoke.passed:${params.service}:${params.version}`,
    { timeout: 1800 }
  );

  await ctx.step('deploy-production', async () => {
    // Deploy to production
    return { env: 'production', artifact: build.artifact };
  });

  await ctx.step('notify', async () => {
    return { notified: true, channel: 'deploys', version: params.version };
  });

  return { deployed: true, version: params.version, environments: ['staging', 'production'] };
});

await app.startWorker();
```

**Spawn:** `absurdctl spawn-task deploy-service -P service=api -P version=1.2.3`

**Wake after smoke test:** `absurdctl emit-event "smoke.passed:api:1.2.3" -P tester=ci`

---

### Pattern: Durable Research

Search, fetch, and analyze — each step checkpointed so crashes don't lose expensive web fetches.

```typescript
import { Absurd } from 'absurd-sdk';

const app = new Absurd({ queueName: 'default' });

app.registerTask({ name: 'research-topic' }, async (params, ctx) => {
  const sources = await ctx.step('search', async () => {
    // Web search for sources (expensive API call)
    return { urls: ['https://...', 'https://...'], query: params.query };
  });

  const content = await ctx.step('fetch-sources', async () => {
    // Fetch and extract each source (time-consuming)
    const results = [];
    for (const url of sources.urls) {
      results.push({ url, text: `extracted content from ${url}` });
    }
    return { fetched: results.length, results };
  });

  const analysis = await ctx.step('analyze', async () => {
    // Analyze/summarize the fetched content
    return {
      summary: `Analysis of ${content.fetched} sources on "${params.query}"`,
      findings: content.results.map(r => r.text),
    };
  });

  return { query: params.query, analysis };
});

await app.startWorker();
```

**Spawn:** `absurdctl spawn-task research-topic -P query="postgres partitioning strategies"`

**Inspect result:** `absurdctl dump-task --task-id=<id>` — shows each step's cached output.

---

## Spawning from Pi

### Direct spawn (simplest — use absurdctl)

```sh
absurdctl spawn-task <task-name> -P key=value -P count:=42
```

### Spawn with idempotency (prevent duplicate spawns)

```sh
absurdctl spawn-task <task-name> -P key=value --idempotency-key="unique-key"
```

### Programmatic spawn (one-liner from pi session)

```sh
bun -e "
import { Absurd } from 'absurd-sdk';
const app = new Absurd({ queueName: 'default' });
const result = await app.spawn('task-name', { key: 'value' });
console.log('Spawned:', result.taskID);
await app.close();
"
```

### Check task result after completion

```sh
absurdctl dump-task --task-id=<task-id>
```

Look at the `FINAL STATE` section for the return value.

---

## Cross-session Coordination

### Pi session A spawns, Pi session B wakes

Session A (starts work):
```sh
absurdctl spawn-task pr-lifecycle -P prNumber:=42 -P repo=myapp -P ticketKey=PROJ-123
```

Session B (later, after CI passes):
```sh
absurdctl emit-event "ci.passed:myapp:pr-42" -P headSha=abc123
```

The task resumes automatically — no coordination needed beyond the event name.

### Integration with pi-intercom

Use intercom to notify another pi session that an event was emitted:

1. Session A spawns a task and notes the event it's waiting for
2. Session B (via intercom `send`): "I emitted ci.passed:myapp:pr-42 — the deploy task should wake now"
3. Session A can then inspect the result: `absurdctl dump-task --task-id=<id>`

### Integration with babysitter-pi

- Babysitter orchestrates the agent session (process-level)
- Agent spawns Absurd tasks for work that must outlive the session (workflow-level)
- On babysitter resume, the agent checks Absurd task state to decide next action:
  ```sh
  absurdctl list-tasks --queue=default --task-name=<name> --status=completed --limit=1
  ```

### Integration with pi-subagents

- A subagent can spawn a durable task that outlives the subagent's session
- The parent agent checks the task state after the subagent completes
- Use this when a subagent's work triggers something that takes hours (deploy, CI, approval)
