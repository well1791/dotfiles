# Laya-router A/B benchmark scenarios (2026-09)

Five fixed prompts spanning the routing spectrum. Each runs twice in a scratch
cwd with an isolated `PI_CODING_AGENT_SESSION_DIR`:

- **A-side (baseline):** `PI_LAYA_DISABLE=1` — every prompt answered by the
  default frontier model `zai/glm-5.3`.
- **B-side (routing):** project overlay `.pi/laya.json` with
  `routes.small = "llamacpp/minicpm5-2b"` (quota-free local small tier);
  frontier still resolves to the base model.

Both sides run `pi -p -ne -e ~/.pi/agent/extensions/laya-router/index.ts -a`
(no other extensions/tools — identical environment, and avoids the known
pi -p + full-extension-toolset failure with llamacpp).

| # | Prompt | Expected ideal route |
|---|---|---|
| S1 | `hello` | small (trivial chat) |
| S2 | `In one short sentence, what does JSON stand for?` | small (frontier in practice — laya probes show low trivial score; acceptable escalation) |
| S3 | `Use jest or vitest for this repo?` | laya (typed decision; Mode A candidate — likely aborts on answer confidence, then small) |
| S4 | `Add a retry wrapper around the fetch call in src/api.ts` | frontier (coding) |
| S5 | `Design the schema for a multi-tenant billing system. List the tables and key columns.` | frontier (design work) |

Quality grading: S1 greeting present; S2 contains "JavaScript Object
Notation"; S3 names one of jest/vitest with a reason; S4 mentions retry and
the file; S5 lists multiple tables with columns.
