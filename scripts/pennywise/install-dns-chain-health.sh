#!/bin/sh
# Idempotent installer for the pennywise DNS-chain health check.
# Run as root ON pennywise:  sudo bash install-dns-chain-health.sh
# Source files: scripts/pennywise/ in the dotfiles repo (repo of record).

set -eu
SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

[ -f "$SRC/dns-chain-health.sh" ] || { echo "dns-chain-health.sh not next to installer"; exit 1; }

install -m 700 -o root -g root "$SRC/dns-chain-health.sh" /usr/local/lib/dns-chain-health.sh
mkdir -p /var/lib/dns-chain-health
chmod 755 /var/lib/dns-chain-health

cat > /etc/systemd/system/dns-chain-health.service <<'EOF'
[Unit]
Description=DNS chain health check + self-heal (FTL -> dnscrypt-proxy -> AdGuard DoH)
After=network-online.target dnscrypt-proxy.service pihole.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/lib/dns-chain-health.sh
EOF

cat > /etc/systemd/system/dns-chain-health.timer <<'EOF'
[Unit]
Description=Periodic DNS chain health check (pennywise)

[Timer]
OnBootSec=3min
OnUnitActiveSec=30min
Persistent=true

[Install]
WantedBy=timers.target
EOF
chmod 644 /etc/systemd/system/dns-chain-health.service /etc/systemd/system/dns-chain-health.timer

systemctl daemon-reload
systemctl enable --now dns-chain-health.timer

echo "--- first check (runs now) ---"
systemctl start dns-chain-health.service || true
cat /var/lib/dns-chain-health/last
echo
systemctl is-active dns-chain-health.timer
echo "Install complete. Re-check anytime: systemctl start dns-chain-health; cat /var/lib/dns-chain-health/last"
