# laya-serve — local decision engine (ops doc)

[laya](https://github.com/NandhaKishorM/laya) is a local typed-decision engine: it answers
structured questions (choice / score / bool) from small local checkpoints instead of a chat LLM.
This repo runs it as the `laya-serve` systemd **user** service on `127.0.0.1:8082` (loopback
only) and wires it into pi (terminal coding agent, README entry 10) as the decision engine
behind the `ask_laya` tool:

- `~/.pi/agent/extensions/laya-provider.ts` — registers provider `laya` (models
  `laya/english`, `laya/typed-decisions`, System One classifier API)
- `~/.pi/agent/extensions/ask-laya.ts` — the `ask_laya` tool (one state, one classify call;
  commands pass a read-only safety gate first)

All checkpoints and state live under `~/.local/share/laya/` (unmanaged runtime data — see
`.chezmoiignore.tmpl`). Everything below is fish syntax.

## Service management

```fish
# Health (returns {"status":"ok"} once checkpoints are ready)
curl -sS http://127.0.0.1:8082/health

# Status / restart / logs
systemctl --user status laya-serve
systemctl --user restart laya-serve
journalctl --user -u laya-serve -f
```

Fish sessions export `$LAYA_BASE_URL` (`http://127.0.0.1:8082`) via
`~/.config/fish/conf.d/laya.fish` — a convenience for curl probes only; the pi extension pins
its own endpoint.

## Environment

`~/.local/share/laya/laya.env` is generated **at deploy time** by
`.chezmoiscripts/run_onchange_before_62a-install-laya.sh.tmpl` (0600 via `umask 077`; written
only when absent, so re-runs keep the key stable). It is loaded by the unit via
`EnvironmentFile`:

| Variable | Deployed value | Meaning |
|---|---|---|
| `LAYA_HOST` | `127.0.0.1` | Bind address — loopback only, never expose |
| `LAYA_PORT` | `8082` | HTTP port |
| `LAYA_MODELS` | `english,typed-decisions` | Checkpoints loaded at boot |
| `LAYA_DEFAULT_MODEL` | `english` | Model used when a request doesn't pin one |
| `LAYA_JEV_STRICT` | `1` | Strict response mode — exactly the answer fields pi consumes |
| `LAYA_API_KEY` | (generated) | Bearer key; `openssl rand -hex 24` at first deploy |
| `LAYA_DEVICE` | `cuda` | Torch device (`cpu` is the fallback, see below) |
| `LAYA_PRELOAD` | `1` | Load all `LAYA_MODELS` checkpoints at boot |
| `LAYA_MAX_LOADED` | `2` | Cap on checkpoints resident at once |

## Auth / key handling

- laya-serve requires `Authorization: Bearer <key>` on every call; no/incorrect bearer → **401**.
- **How the key reaches pi:** the `models.json` route was abandoned — pi's models.json parser
  drops model `type`, so classifier models cannot be declared there (and `pi --list-models`
  lists chat models only). Instead, `laya-provider.ts` reads `LAYA_API_KEY` from
  `~/.local/share/laya/laya.env` at registration and hands it to pi as a **literal apiKey**
  (resolved into the Bearer header at request time). This literal form is the only one that
  worked during the spike; the `!command` shell-command apiKey form failed to resolve — do not
  use it.
- If `laya.env` is missing, the provider still registers with an empty key (fail-soft): pi
  sessions keep working and laya classify just fails with a clear authentication error. Start
  or restart the pi session **after** `laya.env` exists.
- **Never print the key** — not in docs, logs, agent output, or screenshots. If a human needs
  to read it manually: `grep ^LAYA_API_KEY= ~/.local/share/laya/laya.env` (in your own
  terminal; do not paste the value anywhere).

## Performance (spike measurements — handle with care)

Measured during the Phase 1 spike on the scratch venv (laya 0.4.31, torch 2.15.0+cu132, Python
3.13). **The warm-latency, RSS, and VRAM figures were read from unsaved console output** (only
the 41/6144 MiB VRAM baseline was persisted) — treat them as working values, not SLAs.

- **Cold load** (first start): downloads ~1.6 GiB of checkpoints into
  `HF_HOME=~/.local/share/laya/hf` (~30 s on a fast link, minutes on slow ones; ~42 s observed
  process-start → `/health` 200 incl. download). **Cached boots: 4-7 s** (cpu 4 s, cuda 7 s).
- **Warm latency** (3-question strict block): cuda **~42-44 ms**; cpu **~0.8-1.0 s** (~24×).
- **Idle RAM** (both checkpoints resident): cuda ~3.4 GiB RSS, cpu ~4.3 GiB.
- **VRAM beside Plasma**: both checkpoints ≈ **4356 MiB of 6144 MiB (71%)** — tight on a 6 GiB
  card; ~1.7 GiB headroom observed.
- **Disk**: ~1.6 GiB HF cache (english at repo root + `typed-decisions/` subfolder; the
  multilingual checkpoint is never fetched).

## CPU/GPU flip

Deployed on `cuda` on purpose (~43 ms vs ~1 s per request). If VRAM pressure appears (other GPU
work, OOM in the journal):

1. Edit `~/.local/share/laya/laya.env`: set `LAYA_DEVICE=cpu`
2. `systemctl --user restart laya-serve`

CPU still answers everything (~1 s/request). The install script only sets the *initial* value —
`laya.env` is written once and preserved on re-runs, so your flip survives `chezmoi apply`.

## Updating

- **laya version**: bump the `LAYA_VERSION` pin in
  `home/.chezmoiscripts/run_onchange_before_62a-install-laya.sh.tmpl`, then `chezmoi apply` —
  the `run_onchange` script re-runs and `uv pip install "laya[serve]==<pin>"` updates the venv.
  Checkpoints are not downloaded by the install script; the HF cache persists across updates.
- **Unit file edits**: the enable script (`run_onchange_after_62a-enable-laya.sh.tmpl`) re-runs
  only when its own content changes. After editing `laya-serve.service`, run manually:
  `systemctl --user daemon-reload && systemctl --user restart laya-serve`.

Not covered by `update-all` (no self-update, not a system package).

## Observability

**`pi --list-models` shows NOTHING for the laya classifiers — by design.** pi lists chat models
only; classifier models registered by an extension never appear there. To observe the
integration:

- **ask_laya results**: the tool returns typed answers (choice + probabilities + confidence,
  score, bool as `probability`) with a per-question confidence
- **codemode classify**: call the provider's classify from code and inspect the raw result
- **SDK probe**: one curl against `/v1/systemone` (see the `laya-serve` navi cheat under
  `navi <cheat>`; the request body is `{"model", "state", "questions"}`, answers come back under
  `"answers"`)
- server side: `journalctl --user -u laya-serve` and `/health`

## Model notes

- **english vs typed-decisions**: a spike A/B agreed on every choice answer, but `english`'s
  confidences were consistently higher and better separated (`typed-decisions` sat at
  0.02-0.10 — unusable for `min_confidence` gating). `english` is both the deployed
  `LAYA_DEFAULT_MODEL` and ask_laya's pinned default.
- **English-only**: only the `english` and `typed-decisions` checkpoints are downloaded/loaded;
  the multilingual checkpoint is never fetched. Questions are expected in English.
- **Confidence calibration caveat**: on boot the server warns once that the english checkpoint
  ships out-of-range temperatures — confidences for `choice:11+` entries (choice criteria with
  11+ options) are **uncalibrated**. Do not gate on confidence for wide choices; narrow the
  criteria instead (ask_laya warns above 20 options and prefers ≤ 20).

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `/health` unreachable right after first install | **Cold load**: first start downloads ~1.6 GiB into `~/.local/share/laya/hf` (~30 s download, minutes on slow links). Watch `journalctl --user -u laya-serve -f`; `/health` flips to `{"status":"ok"}` once ready. Check free disk (~1.6 GiB needed). Cached boots after that: 4-7 s. |
| HTTP **422** on classify | Bad question shape ("option budget"): `noul`/bool criteria must be a `{true,false}` dict — an array 422s. Choice criteria over ~20 options degrade answers (ask_laya warns above 20 and narrows criteria). Fix the questions block and retry. |
| HTTP **503** | Concurrent requests: a second classify while one is in flight gets 503. ask_laya makes one call per invocation so normal sessions don't collide; a manual curl during an in-flight classify can — retry when idle. |
| HTTP **401** on laya classify | Bearer missing/wrong. A pi session started before `laya.env` existed registered with an empty key (fail-soft) — restart the pi session. Verify the key exists (see Auth above; never print it). |
| CUDA / VRAM errors in the journal | VRAM pressure beside the desktop (~71% of 6 GiB used). Flip `LAYA_DEVICE=cpu` (see CPU/GPU flip). |
| Service missing after `chezmoi apply` on a new machine | The laya scripts and unit are skipped on **ephemeral** machines (`.chezmoiignore.tmpl`); the install script also exits early there. |

## Files

| Path | Managed by |
|---|---|
| `home/.chezmoiscripts/run_onchange_before_62a-install-laya.sh.tmpl` | chezmoi (install + laya.env generation) |
| `home/.chezmoiscripts/run_onchange_after_62a-enable-laya.sh.tmpl` | chezmoi (daemon-reload + enable) |
| `home/dot_config/systemd/user/laya-serve.service` | chezmoi (unit; `HF_HOME` pinned here) |
| `home/dot_config/fish/conf.d/laya.fish` | chezmoi (`$LAYA_BASE_URL`) |
| `home/dot_pi/agent/extensions/laya-provider.ts` | chezmoi (provider registration) |
| `home/dot_pi/agent/extensions/ask-laya.ts` | chezmoi (ask_laya tool) |
| `~/.local/share/laya/` | unmanaged (venv, `laya.env`, HF cache) |
