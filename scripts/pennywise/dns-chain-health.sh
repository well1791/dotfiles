#!/bin/sh
# DNS chain health check + one-shot self-heal for pennywise.
# Chain: clients -> FTL :53 -> dnscrypt-proxy 127.0.0.1:5353 -> AdGuard DoH (token profile).
#
# Probes (loopback only, no secrets):
#   L1 listeners: :53 (FTL), :67 (DHCP), 127.0.0.1:5353 (sidecar)
#   P1 sidecar round trip:  <random>.health.github.com -> expect NOERROR/NXDOMAIN (cache-busted)
#   P2 full chain via FTL:  <random>.health.github.com -> expect NOERROR/NXDOMAIN (cache-busted)
#   P3 profile live:        doubleclick.net -> expect blocked (0.0.0.0 / empty / REFUSED)
#   (deliberately no adult-domain probes: they would pollute periodic query logs)
#
# Self-heal, one attempt each: restart dnscrypt-proxy (P1/L5353 fail), restart pihole
# (missing :53/:67 listener). P3 failure has no local fix (token/account) - reported only.
#
# Output: systemd journal (stdout) + /var/lib/dns-chain-health/last
# Exit:   0 healthy (possibly after heal), 1 degraded.

set -u
STATUS_DIR=/var/lib/dns-chain-health
STATUS_FILE=$STATUS_DIR/last
DIG="dig +time=5 +tries=1"

mkdir -p "$STATUS_DIR"
: > "$STATUS_FILE"
chmod 644 "$STATUS_FILE"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" | tee -a "$STATUS_FILE"; }

rand8() { tr -dc 'a-z0-9' </dev/urandom | head -c 8; }

listen_ports() { { ss -H -uln; ss -H -tln; } 2>/dev/null | awk '{print $4}' | sed 's/.*://'; }
has_port() { listen_ports | grep -qx "$1"; }

# status_of NAME SERVER PORT -> NOERROR|NXDOMAIN|SERVFAIL|... (empty on timeout)
status_of() {
    $DIG "@$2" -p "$3" "$1" +noall +comments 2>/dev/null \
        | grep -o 'status: [A-Z]*' | head -1 | cut -d' ' -f2
}
# a definitive answer proves the whole chain answered; SERVFAIL/REFUSED/empty (timeout) do not
ok_status() { [ "$1" = NOERROR ] || [ "$1" = NXDOMAIN ]; }

# Sets: L53, L67, L5353 (ok|missing) and P_SIDE, P_FTL, P_BLOCK (ok|fail)
probe() {
    L53=ok; L67=ok; L5353=ok; P_SIDE=ok; P_FTL=ok; P_BLOCK=ok
    has_port 5353 || L5353=missing
    has_port 53 || L53=missing
    has_port 67 || L67=missing

    st_side=$(status_of "$(rand8)health.github.com" 127.0.0.1 5353)
    ok_status "$st_side" || P_SIDE=fail
    st_ftl=$(status_of "$(rand8)health.github.com" 127.0.0.1 53)
    ok_status "$st_ftl" || P_FTL=fail

    ans=$($DIG @127.0.0.1 doubleclick.net +short 2>/dev/null | head -1)
    if [ -n "$ans" ] && [ "$ans" != "0.0.0.0" ]; then P_BLOCK=fail; fi
}

FAILED=0
HEALED=0
probe

if [ "$P_SIDE" = fail ] || [ "$L5353" = missing ]; then
    log "[FIX] restarting dnscrypt-proxy (sidecar probe=$P_SIDE listener=$L5353)"
    systemctl restart dnscrypt-proxy || log "[FIX] dnscrypt-proxy restart failed"
    HEALED=1
    sleep 10
fi
if [ "$L53" = missing ] || [ "$L67" = missing ]; then
    log "[FIX] restarting pihole (listeners :53=$L53 :67=$L67)"
    systemctl restart pihole || log "[FIX] pihole restart failed"
    HEALED=1
    sleep 20
fi
[ "$HEALED" = 1 ] && probe

[ "$L5353" = ok ] || { log "[FAIL] sidecar listener 127.0.0.1:5353 missing"; FAILED=1; }
[ "$P_SIDE" = ok ] || { log "[FAIL] sidecar not resolving - DoH tunnel broken (check egress/token)"; FAILED=1; }
[ "$L53" = ok ] || { log "[FAIL] FTL :53 listener missing"; FAILED=1; }
[ "$L67" = ok ] || { log "[FAIL] DHCP :67 listener missing"; FAILED=1; }
[ "$P_FTL" = ok ] || { log "[FAIL] full chain via FTL not resolving"; FAILED=1; }
[ "$P_BLOCK" = ok ] || { log "[FAIL] AdGuard profile not applying (doubleclick.net=$ans) - check dashboard/token"; FAILED=1; }

if [ "$FAILED" = 0 ]; then
    if [ "$HEALED" = 1 ]; then
        log "[OK] DNS chain healthy (after self-heal)"
    else
        log "[OK] DNS chain healthy"
    fi
    exit 0
fi
log "[ALERT] DNS chain degraded - see failures above"
exit 1
