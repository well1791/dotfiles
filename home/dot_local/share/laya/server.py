#!/usr/bin/env python3
"""Persistent local HTTP service around the Laya decision engine (laya.Router).

Stdlib-only server. The heavy imports (torch, transformers) and checkpoint
loads happen in a background thread, so the socket binds immediately and
/healthz can report initializing/ready/failed while models load.

Endpoints:
    GET  /healthz     readiness: resident checkpoints, versions, error state
    POST /v1/predict  typed questions over a state -> full laya result
    POST /v1/route    routing decision only (no forward pass)

Environment:
    LAYA_HOST     bind address             (default 127.0.0.1 — localhost only)
    LAYA_PORT     bind port                (default 8082)
    LAYA_DEVICE   cpu | cuda               (default cpu; GPU is reserved for llama.cpp)
    LAYA_PRELOAD  all | none | comma list  (default all — no request pays a model load)
    HF_TOKEN      optional Hugging Face token (read by laya itself)

Managed by chezmoi; operational docs: docs/laya-service.md in the chezmoi repo.
"""
import json
import logging
import os
import signal
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import metadata

SERVICE_NAME = "laya-service"
SERVICE_VERSION = "1.0.0"
MAX_BODY_BYTES = 20 * 1024 * 1024
LOAD_ATTEMPTS = 3
LOAD_RETRY_SECONDS = 10

HOST = os.environ.get("LAYA_HOST", "127.0.0.1")
PORT = int(os.environ.get("LAYA_PORT", "8082"))
DEVICE = os.environ.get("LAYA_DEVICE", "cpu")
PRELOAD = os.environ.get("LAYA_PRELOAD", "all").strip().lower()

log = logging.getLogger(SERVICE_NAME)

# Service state, mutated only under _state_lock.
_state_lock = threading.Lock()
_state = {
    "status": "initializing",  # initializing | ready | failed
    "error": None,
    "started_at": time.time(),
    "requests": 0,
}
_router = None  # laya.Router, set once models are loaded


def _laya_version() -> str:
    try:
        return metadata.version("laya")
    except Exception:
        return "unknown"


def _load_models():
    """Build the Router (downloads checkpoints on first ever start). Runs in background."""
    global _router
    for attempt in range(1, LOAD_ATTEMPTS + 1):
        try:
            # Heavy imports deferred so the socket binds fast.
            from laya import Router

            if PRELOAD in ("all", ""):
                router = Router(preload=True, device=DEVICE)
            elif PRELOAD == "none":
                # Lazy: cold-loads on demand, then stays resident.
                router = Router(device=DEVICE, max_loaded=3)
            else:
                names = [n.strip() for n in PRELOAD.split(",") if n.strip()]
                router = Router(device=DEVICE, preload=False).preload(names)
            with _state_lock:
                _router = router
                _state["status"] = "ready"
                _state["error"] = None
            log.info("models ready: loaded=%s device=%s preload=%s",
                     router.loaded, router.device, PRELOAD)
            return
        except Exception as e:
            log.error("model load attempt %d/%d failed: %s\n%s",
                      attempt, LOAD_ATTEMPTS, e, traceback.format_exc())
            if attempt < LOAD_ATTEMPTS:
                time.sleep(LOAD_RETRY_SECONDS)
    with _state_lock:
        _state["status"] = "failed"
        _state["error"] = (
            "model loading failed after %d attempts; "
            "see journalctl --user -u laya.service, then "
            "systemctl --user restart laya" % LOAD_ATTEMPTS
        )
    # Keep serving /healthz so the failure reason stays queryable.


def _snapshot() -> dict:
    with _state_lock:
        snap = dict(_state)
        router = _router
    snap.update(
        service=SERVICE_NAME,
        service_version=SERVICE_VERSION,
        laya_version=_laya_version(),
        device=DEVICE,
        preload=PRELOAD,
        host=HOST,
        port=PORT,
        uptime_s=round(time.time() - snap["started_at"], 1),
        loaded=list(router.loaded) if router is not None else [],
    )
    return snap


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = SERVICE_NAME + "/" + SERVICE_VERSION
    timeout = 120

    # ------------------------------------------------------------- plumbing
    def log_message(self, fmt, *args):
        log.info("%s %s", self.address_string(), fmt % args)

    def _json(self, status: int, payload: dict):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        if status >= 400:
            self.close_connection = True
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._json(400, {"ok": False, "error": "invalid Content-Length"})
            return None
        if length <= 0:
            self._json(400, {"ok": False, "error": "request body required"})
            return None
        if length > MAX_BODY_BYTES:
            self._json(413, {"ok": False, "error": "body too large (max %d bytes)" % MAX_BODY_BYTES})
            return None
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except json.JSONDecodeError as e:
            self._json(400, {"ok": False, "error": "invalid JSON: %s" % e})
            return None
        if not isinstance(body, dict):
            self._json(400, {"ok": False, "error": "request body must be a JSON object"})
            return None
        return body

    # ------------------------------------------------------------- routing
    def do_GET(self):
        if self.path == "/healthz":
            snap = _snapshot()
            snap["ok"] = snap["status"] == "ready"
            self._json(200 if snap["ok"] else 503, snap)
        elif self.path == "/":
            self._json(200, {
                "ok": True,
                "service": SERVICE_NAME,
                "endpoints": ["GET /healthz", "POST /v1/predict", "POST /v1/route"],
            })
        else:
            self._json(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self.path not in ("/v1/predict", "/v1/route"):
            self._json(404, {"ok": False, "error": "not found"})
            return

        snap = _snapshot()
        if snap["status"] != "ready":
            payload = {"ok": False, "status": snap["status"], "error": snap["error"] or "service not ready"}
            self._json(503, payload)
            return

        body = self._read_json()
        if body is None:
            return

        questions = body.get("questions")
        if self.path == "/v1/route":
            # Routing needs at most `questions`; state is optional.
            state = body.get("state")
            if state is not None and not isinstance(state, (str, dict, list)):
                self._json(400, {"ok": False, "error": "'state' must be a string, object or list"})
                return
        else:
            state = body.get("state")
            if not isinstance(state, (str, dict, list)):
                self._json(400, {"ok": False, "error": "'state' is required (string, object or list)"})
                return
            if not isinstance(questions, dict) or not questions:
                self._json(400, {"ok": False, "error": "'questions' must be a non-empty object"})
                return
            for qid, qdef in questions.items():
                if not isinstance(qdef, dict) or qdef.get("type") not in ("choice", "score", "noul"):
                    self._json(400, {
                        "ok": False,
                        "error": "question %r must have type choice|score|noul" % qid,
                    })
                    return

        kwargs = {}
        for key in ("model", "lang", "task"):
            value = body.get(key)
            if value is not None:
                if not isinstance(value, str):
                    self._json(400, {"ok": False, "error": "'%s' must be a string" % key})
                    return
                kwargs[key] = value

        with _state_lock:
            _state["requests"] += 1
        router = _router
        started = time.perf_counter()
        try:
            if self.path == "/v1/route":
                result = dict(router.route(state, questions, **kwargs))
                self._json(200, {"ok": True, "route": result})
            else:
                result = router.predict(state, questions, **kwargs)
                self._json(200, {
                    "ok": True,
                    "result": result,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1),
                })
        except ValueError as e:
            # Bad model name / task, question schema problems, options overflow.
            self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:
            log.error("inference failed: %s\n%s", e, traceback.format_exc())
            self._json(500, {"ok": False, "error": "inference failed: %s" % e})


def main():
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    log.info("listening on http://%s:%d (laya %s, device=%s, preload=%s)",
             HOST, PORT, _laya_version(), DEVICE, PRELOAD)

    loader = threading.Thread(target=_load_models, name="laya-loader", daemon=True)
    loader.start()

    stopping = threading.Event()

    def _shutdown(signum, frame):
        if not stopping.is_set():
            stopping.set()
            log.info("received signal %d, shutting down", signum)
            # shutdown() blocks until serve_forever() exits — call from a thread.
            threading.Thread(target=httpd.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    try:
        httpd.serve_forever()
    finally:
        httpd.server_close()
        with _state_lock:
            router = _router
        if router is not None:
            try:
                router.unload()
                log.info("models unloaded")
            except Exception as e:
                log.warning("unload failed: %s", e)
        log.info("bye")


if __name__ == "__main__":
    main()
