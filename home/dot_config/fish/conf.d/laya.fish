# |-- LAYA
# Base URL of the local laya-serve decision engine (systemd user unit, strict
# mode). Shell convenience for curl probes only — the pi extension pins its
# own endpoint internally.
set -gx LAYA_BASE_URL http://127.0.0.1:8082
