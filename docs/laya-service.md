# Laya — Local Decision-Engine Service

Operational documentation for the persistent local Laya service managed by this
repository. Describes the setup that actually exists on this machine.

- Upstream: <https://github.com/NandhaKishorM/laya> (Apache-2.0), PyPI package `laya`
- Purpose: fast typed decisions (`choice` / `score` / `noul`, calibrated
  confidence) over text/JSON state in a single forward pass, 100+ languages,
  no text generation. Local, free alternative to hosted decision APIs.

## Environment

| Item | Value |
|---|---|
| Python | 3.13.14 (uv-managed), venv at `~/.local/share/laya/.venv` |
| Installed via | `uv venv` + `uv pip install` (never global pip) |
| laya version | `0.3.5` (pinned in `run_onchange_before_74a-install-laya.sh.tmpl`) |
| torch | `2.14.0+cpu` — installed first from `https://download.pytorch.org/whl/cpu` to avoid the ~6 GB CUDA wheel set; the service runs on CPU by default |
| Key resolved deps | `transformers 5.17.0`, `huggingface-hub 1.32.0`, `safetensors 0.8.0`, `numpy 2.5.3` (the stack the laya README documents as tested) |
| Checkpoints | Hugging Face `convaiinnovations/laya` bundle (subfolders `multilingual`, `typed-decisions`), cached in `~/.cache/huggingface` (~3 GB after first start) |
| Service code | `~/.local/share/laya/server.py` (chezmoi source: `home/dot_local/share/laya/server.py`) |
| Unit | `~/.config/systemd/user/laya.service` (chezmoi source: `home/dot_config/systemd/user/laya.service`) |

Device decision: CPU. The RTX 3060 Laptop (6 GB) is reserved for llama.cpp
(MiniCPM5-2B, ~3.3 GB); preloading all three laya checkpoints (~1.16 B params)
in fp16 would not reliably co-exist. Measured on this machine: ~0.5 s per
request (3 questions), 6.4 GB process memory peak with all three checkpoints
resident (fp32 on CPU), ~41 s warm start from cache, ~220 s cold start
(downloading ~3 GB). To switch: set `LAYA_DEVICE=cuda` in the unit, reinstall
torch without the CPU index (see install script header), `daemon-reload`,
restart.

## Service

Laya ships no server (library only), so `server.py` is a stdlib-only HTTP
wrapper (no FastAPI/uvicorn dependency) around `laya.Router`.

- Listens on **`127.0.0.1:8082`** only (8080 is reserved for the Sage devenv,
  8081 for llama.cpp, 5433 for postgres).
- `Router(preload=True, device=LAYA_DEVICE)`: all three checkpoints
  (english, multilingual, typed-decisions) stay resident — no request pays a
  model load. Router is thread-safe by design; concurrent predicts share
  checkpoints without serializing.
- Models load in a background thread (3 attempts, 10 s apart); the socket binds
  immediately. Load failure after retries → `/healthz` stays 503 `failed` with
  the reason, and the traceback is in the journal. The process keeps running so
  the failure stays queryable; restart explicitly after fixing the cause.

### Configuration (unit `Environment=`, all overridable)

| Variable | Default | Meaning |
|---|---|---|
| `LAYA_HOST` | `127.0.0.1` | bind address (localhost only) |
| `LAYA_PORT` | `8082` | bind port |
| `LAYA_DEVICE` | `cpu` | `cpu` or `cuda` |
| `LAYA_PRELOAD` | `all` | `all`, `none` (lazy, stays resident), or comma list e.g. `english,multilingual` |
| `HF_TOKEN` | unset | optional Hugging Face token, read by laya itself |

## API

### `GET /healthz`

`200` when ready, `503` while `initializing` or `failed`:

```json
{
  "ok": true, "status": "ready",
  "service": "laya-service", "service_version": "1.0.0", "laya_version": "0.3.5",
  "device": "cpu", "preload": "all",
  "loaded": ["english", "multilingual", "typed-decisions"],
  "host": "127.0.0.1", "port": 8082,
  "requests": 42, "uptime_s": 3600.0, "started_at": 1690000000.0, "error": null
}
```

### `POST /v1/predict`

Request: `state` (string | object | list, required), `questions` (required):
map of question id → `{"type": "choice"|"score"|"noul", "instructions": str,
"criteria": {...}|[...]}`; optional `model` (`english|multilingual|typed-decisions`
or aliases), `lang`, `task` string overrides.

```fish
curl -fsS -X POST http://127.0.0.1:8082/v1/predict \
  -H 'Content-Type: application/json' \
  -d '{"state": {"body": "We were billed twice for March. Please refund today."},
       "questions": {
         "department": {"type": "choice",
           "instructions": "Which department should handle this?",
           "criteria": {"billing": "invoices, refunds", "technical": "bugs", "other": "rest"}},
         "refund": {"type": "noul", "instructions": "Does the user request a refund?"}}}'
```

Response (`result` is the untouched `Router.predict` payload):

```json
{
  "ok": true,
  "latency_ms": 312.4,
  "result": {
    "model": "laya-rl-agent",
    "answers": {
      "department": {"type": "choice", "choice": "billing",
                     "probabilities": {"billing": 0.94, "technical": 0.03, "other": 0.03},
                     "confidence": 0.94, "action": {"act_probability": 1.0}},
      "refund": {"type": "noul", "noul": 0.85, "confidence": 0.85,
                 "action": {"act_probability": 1.0}}
    },
    "usage": {"input_tokens": 129, "output_tokens": 0},
    "routing": {"model": "english", "repo": "convaiinnovations/laya",
                "reason": "English Latin text", "detection": {...}, "workflow": null}
  }
}
```

### `POST /v1/route`

Dry-run routing (sub-millisecond, no forward pass). Same optional
`model`/`lang`/`task`; `state` optional. Returns `{"ok": true, "route": {...}}`.

### Errors

Machine-readable JSON on every failure path:

- `400` — invalid JSON, missing/invalid `state` or `questions`, unknown
  `model`/`task` (laya raises `ValueError`), question options overflow
- `413` — body > 20 MB
- `503` — `initializing` (models still loading) or `failed` (load error, with reason)
- `500` — unexpected inference failure (traceback in journal)
- `404`/`405` — unknown path/method

## Lifecycle

```fish
systemctl --user start laya.service     # start
systemctl --user stop laya.service      # clean stop (SIGTERM -> unload models, exit 0)
systemctl --user restart laya.service   # restart (e.g. after a failed load)
systemctl --user status laya.service    # state + recent log lines
journalctl --user -u laya.service -f    # logs: loads, requests, errors, shutdown
curl -fsS http://127.0.0.1:8082/healthz # readiness (200 + "status": "ready")
```

- Enabled at login (`WantedBy=default.target`, `Restart=on-failure`,
  `RestartSec=5`) by `run_onchange_after_74a-enable-laya.sh.tmpl`.
- First-ever start downloads ~3 GB of checkpoints (measured: ~220 s to ready);
  warm start from cache is ~41 s. Readiness is `/healthz` → 200. A failed load
  retries 3× (10 s apart), then reports 503 `failed` with the reason.
- After editing the unit file: `chezmoi apply`, then
  `systemctl --user daemon-reload && systemctl --user restart laya.service`
  (the enable script only re-runs when its own content changes).
- Manual run without systemd:
  `env LAYA_PORT=8082 ~/.local/share/laya/.venv/bin/python ~/.local/share/laya/server.py`

## Updates

The version is pinned for reproducibility. To upgrade:

1. Bump `LAYA_VERSION` in `home/.chezmoiscripts/run_onchange_before_74a-install-laya.sh.tmpl`
2. `chezmoi apply` (re-runs the install script; uv upgrades in place)
3. `systemctl --user restart laya.service` and re-check `/healthz` versions

Not part of `update-all` (no self-update; deliberate pin). Skipped entirely on
`ephemeral` machines via `.chezmoiignore.tmpl` + in-script guards.

## AGENTS.md requirements honored

- All files chezmoi-managed (no direct writes to `~`); install via
  `home/.chezmoiscripts/` `run_onchange_` script with the repo's helper library
- Python env via `uv` (never global pip), matching the serena/python-lsp-server
  precedent; python 3.13 like serena
- systemd user service under `dot_config/systemd/user/` (same pattern as
  emacs/kanata/absurd-postgres)
- README "What Gets Installed" (entry 32), Tool Dependencies table in
  `AGENTS.md`, and a navi cheat (`navi --tldr` has no laya page) updated in the
  same change; no PII in any source file (paths use `%h`/`$HOME` at runtime)
