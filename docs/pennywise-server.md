# Pennywise — home LAN server (Pi-hole DNS + DHCP)

Ops reference for `pennywise`, the home-network DNS/DHCP server. All configuration lives **on the server**; this machine's dotfiles only document it. Secrets (WiFi PSK, Pi-hole admin password, AdGuard device URL/token) are deliberately absent — fetch them from the server or the AdGuard dashboard when needed.

Last verified: 2026-11-22

## Hardware & OS

| | |
|---|---|
| Box | GOLE2 JSL mini PC (Intel Jasper Lake) |
| OS | Ubuntu Server 24.04.5 LTS, kernel 6.8 generic |
| Ethernet | `enp1s0` — Realtek RTL8111, driver `r8169`, Gigabit |
| WiFi | `wlp2s0` — RTL8821CE, driver `rtw_8821ce` (configured in netplan as fallback `.11`, currently DOWN/unused) |
| Podman | 4.9.3 (rootful for Pi-hole) |
| dnscrypt-proxy | 2.2.21 native binary at `/usr/local/bin/dnscrypt-proxy` (DoH sidecar — **live** since 2026-11-22; see AdGuard section) |
| Access | `ssh well@192.168.1.10` (key auth). `pennywise.lan` → `192.168.1.10` (verified 2026-11-22) |

## Network layout

| Node | Address | Role |
|---|---|---|
| Router (**Orange Livebox**, Arcadyan fw, ISP **Yoigo** since 2026-11-20) | 192.168.1.1 | Gateway only; **DHCP disabled** (pennywise owns it); **no IPv6 at all** (no RAs, no UI toggle) |
| pennywise `enp1s0` | 192.168.1.10/24, default route metric 100 | **LAN DNS + DHCP server** |
| pennywise `wlp2s0` | 192.168.1.11/24 (netplan), DOWN | WiFi fallback / second admin door |
| laptop (dotfiles machine) | DHCP from pennywise (pool .100–.200) | client |

- LAN domain: `lan` — `pennywise.lan` is a Pi-hole local DNS record (`.local` is reserved for mDNS).
- **IPv6: none.** Yoigo/Livebox provides no IPv6 on this line (verified by packet capture: zero RAs; UI has no IPv6 options). All former IPv6-based designs are dead until the ISP/CPE changes.
- Public IPv4 egress: one dynamic household NAT address (observed 66.81.172.52, not CGNAT).
- History: until 2026-11-20 the router was a ZTE H3600P (Telcel) with ISP GUA IPv6 via RA. The `zte-router-api-automation` skill and its project memory belong to that retired device.

## How it's all wired (dependency map)

```
LAN clients  ──(DNS = 192.168.1.10, learned via DHCP)──▶  Pi-hole FTL :53  ──(sole upstream 127.0.0.1#5353)──▶  dnscrypt-proxy :5353
    ▲                                                        ▲                                              │ (1) bootstrap: d.adguard-dns.com → 94.140.14.49
    └──(DHCP lease .100–.200, gateway .1, DNS .10)──────────┘── :67 (NET_RAW)                                │ (2) DoH: https://d.adguard-dns.com/dns-query/<token>
                                                                                                               ▼
                                                                                          AdGuard Private DNS (account profile: adult-block + ads)
                                                                                                      │
                                                          Livebox 192.168.1.1 ◀── all internet traffic (routing only, DHCP off) ──┘
```

| Component | Depends on | Why / what breaks without it |
|---|---|---|
| DHCP (FTL `:67`) | `NET_RAW` cap in the Quadlet; router DHCP staying **off** | New clients get no address/DNS. Existing leases survive ≤ 1 h. Two DHCP servers = flapping addresses — never re-enable the Livebox's |
| Pi-hole `:53` | FTL container + boot symlink for the generated unit | LAN resolution dies (clients are pinned to `.10`), incl. `pennywise.lan`. pennywise itself still resolves via its netplan fallback `94.140.14.59` (unprofiled) |
| FTL upstream | dnscrypt-proxy on `127.0.0.1:5353` | Sidecar down ⇒ SERVFAIL for uncached names; FTL's cache briefly masks it. Ordering enforced by `10-dnscrypt-dep.conf` (`Wants`/`After`) |
| dnscrypt-proxy | ① plain-UDP bootstrap (`94.140.14.49/.59`) to resolve `d.adguard-dns.com`; ② HTTPS egress via the router | Bootstrap answers only the hostname lookup — the public resolvers never see the token or queries. Without egress the unit flaps (`Restart=always`) |
| AdGuard profile | valid device token in the DoH path; account in good standing | Token revoked ⇒ sidecar TLS/HTTP fails, chain dies upstream. Emergency fallback: unprofiled `94.140.14.49` (see Rollback) |
| Livebox | nothing (it only routes) | Internet-bound traffic dies; LAN-local names (`pennywise.lan`) still resolve from FTL |

Boot order: `multi-user.target` starts `dnscrypt-proxy.service` (plain enabled unit) and `pihole.service` (via the generator symlink), which `Wants`/`After`s the sidecar — so FTL never starts before its upstream exists.

### Automated health check + self-heal (`dns-chain-health.timer`)

Reboot bring-up is automatic, but a *silent* degradation (DoH tunnel broken while both units still show active) needed detection. `scripts/pennywise/` in this repo holds the source of record:

- `dns-chain-health.sh` → installed to `/usr/local/lib/` on pennywise (root, 700). Probes: listeners `:53/:67/:5353`; cache-busted round trips via random `<rand>.health.github.com` names (healthy = NOERROR/NXDOMAIN, broken = SERVFAIL/empty); profile check via `doubleclick.net` → `0.0.0.0`/empty. No adult-domain probes — keeps periodic query logs clean.
- `dns-chain-health.timer` → every 30 min + 3 min after boot. Self-heal: one restart attempt of the failing component (`dnscrypt-proxy` or `pihole`), then re-probe. Profile failure (token/account) is reported, not fixable locally.
- Status: `cat /var/lib/dns-chain-health/last` (or `journalctl -u dns-chain-health`); a still-broken chain exits non-zero → visible in `systemctl --failed`.
- Install/upgrade (idempotent): `scp scripts/pennywise/*.sh well@192.168.1.10:/tmp/ && ssh -t well@192.168.1.10 'sudo bash /tmp/install-dns-chain-health.sh'`.

Known trade-off: pennywise's *own* lookups (apt, etc.) list `192.168.1.10` first with public `94.140.14.59` as fallback — in a corner case the server itself can resolve via the unprofiled fallback. LAN clients have no such fallback; they are always fully chained.

## Server configuration

### Netplan — `/etc/netplan/60-pi-lan.yaml` (static override)

The original cloud-init file (`50-cloud-init.yaml`, WiFi + PSK) is untouched; cloud-init is disabled (`/etc/cloud/cloud-init.disabled`) so it never overwrites. The override merges by lexical file order (60 > 50). Backup of the 2026-11-22 pre-edit version: `60-pi-lan.yaml.bak-20261122`.

```yaml
network:
  version: 2
  ethernets:
    enp1s0:
      dhcp4: false
      accept-ra: true          # kept for if IPv6 ever returns; currently moot (no RAs exist)
      addresses:
        - 192.168.1.10/24
      routes:
        - to: default
          via: 192.168.1.1
          metric: 100
      nameservers:
        addresses: [192.168.1.10, 94.140.14.59]
  wifis:
    wlp2s0:
      dhcp4: false
      addresses:
        - 192.168.1.11/24
      routes:
        - to: default
          via: 192.168.1.1
          metric: 700
      nameservers:
        addresses: [192.168.1.10, 94.140.14.59]
```

Gotcha (bit us): a fully-static netplan stanza emits `IPv6AcceptRA=false` — add `accept-ra: true` explicitly or SLAAC never happens even when the router does RA.

### systemd-resolved — `/etc/systemd/resolved.conf.d/99-pi-no-stub.conf`

```ini
[Resolve]
DNSStubListener=no
```

Frees `127.0.0.53:53`; FTL (host network) needs `:53` wildcard. `resolv.conf mode` becomes `uplink`.

### Pi-hole container — `/etc/containers/systemd/pihole.container` (Quadlet)

```ini
[Unit]
Description=Pi-hole FTLDNS (host network)
Wants=network-online.target
After=network-online.target

[Container]
ContainerName=pihole
Image=docker.io/pihole/pihole:latest
Network=host
AddCapability=NET_ADMIN
AddCapability=NET_RAW
AddCapability=SYS_TIME
AddCapability=SYS_NICE
Environment=TZ=Europe/Madrid
Volume=pihole:/etc/pihole

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

- **`AddCapability=NET_RAW` is load-bearing**: podman rootful containers drop it by default
  (Docker keeps it), and dnsmasq's DHCP engine **silently refuses to run without it** — one CRIT
  journal line, DNS keeps working, no `:67` bind, no error in the UI. This was the root cause of
  the original "DHCP toggle did nothing" failure. If DHCP ever seems dead: check
  `ss -ulnp | grep ':67 '` and the journal for `missing required capability`.
- After a capability-related DHCP failure, FTL may need a config-file change (or restart cycle)
  to actually arm DHCP — a plain restart after adding the cap once did not.
- **Boot persistence**: podman 4.9's quadlet silently drops `[Install]` and `systemctl enable`
  refuses generated units, so:

  ```fish
  sudo ln -sfn /run/systemd/generator/pihole.service /etc/systemd/system/multi-user.target.wants/pihole.service
  ```

- Data: rootful named volume `pihole` → `/etc/pihole` (`pihole.toml`, `gravity.db`, `dhcp.leases`, certs). Host-side path: `/var/lib/containers/storage/volumes/pihole/_data/`. Deleting the container does not lose config.
- Host network was chosen over published ports: the previous bridge-mode container answered TCP (web UI) but dropped UDP 53 from LAN clients (netavark/aardvark path).
- Ordering: `/etc/systemd/system/pihole.service.d/10-dnscrypt-dep.conf` adds `Wants=/After=dnscrypt-proxy.service` so the upstream sidecar is up before FTL.
- ufw: inactive.
- Server sudo has no NOPASSWD normally — a temporary `/etc/sudoers.d/99-pi-setup` entry is the
  documented pattern for scripted server-side work (create, work, **remove**). Currently
  **absent** (removed 2026-11-22 after sidecar completion); check with
  `ssh well@192.168.1.10 'sudo -n true'`.

## Pi-hole application config (persisted in the volume)

| Setting | Value |
|---|---|
| Upstreams | **`127.0.0.1#5353` only** (the dnscrypt-proxy DoH sidecar; final since 2026-11-22). Never mix plain AdGuard v4 in alongside — dnsmasq races upstreams and the unprofiled path wins |
| Local DNS record | `pennywise.lan` → `192.168.1.10` (verified 2026-11-22) |
| DHCP | **Enabled** — range `192.168.1.100 – 192.168.1.200`, router `192.168.1.1`, lease 1 h, logging on. **Router DHCP is OFF**; pennywise owns DHCP (verified by live client leases) |
| TZ | Europe/Madrid |

Quirk: FTL v6.9 does not log DHCP exchanges (DISCOVER/OFFER/ACK) to the journal even with `dhcp.logging=true`. Verify DHCP via `:67` listener and real leases, not logs.

## AdGuard DNS (Private) integration

- The account **profile** (incl. adult-content blocking) must apply to upstream queries. On the
  old ZTE/Telcel line this rode on two **dedicated IPv6 addresses** bound to the dashboard
  device — permanently dead now (no IPv6 on Yoigo/Livebox).
- Working design (final since 2026-11-22): **dnscrypt-proxy DoH sidecar** on pennywise →
  `https://d.adguard-dns.com/dns-query/<token>` (token in path carries the profile) → Pi-hole
  upstream `127.0.0.1#5353`. Verified end-to-end incl. reboot persistence.
- Token rotation (AdGuard dashboard → Servers → device → re-copy the DoH URL):
  `sudoedit /etc/dnscrypt-proxy/adguard-doh.url` → `sudo /usr/local/lib/dnscrypt-gen-stamp.py`
  → `sudo systemctl restart dnscrypt-proxy`. Never print the URL/stamp — both embed the token.
- Binary update notes (official GitHub release): asset name is `linux_x86_64` (underscore);
  the release API's asset `digest` field is the checksum source of truth; Ubuntu's `sha256sum -c`
  rejects `sha256:<hex>` digests — strip the prefix first.
- Stamp layout facts (verified against `go-dnsstamps` + dnscrypt-proxy 2.2.21 source):
  `serverAddr` must be **empty or an IP** — a hostname there is rejected by
  `validateAddrAndHostname` (`Invalid stamp (IP address)`). Empty addr + providerName
  `d.adguard-dns.com` is the correct construction; dnscrypt-proxy resolves the name via
  `bootstrap_resolvers`. `props=1` (DNSSEC) satisfies `require_dnssec=true`. Generator:
  `/usr/local/lib/dnscrypt-gen-stamp.py` (root-only; output suppressed — stamp embeds the token).
- Actual AdGuard block responses (differ from naive `0.0.0.0` expectation): **adult content →
  `94.140.14.35`** (AdGuard block-page IP; PTR `dns.adguard-dns.com`) — matching AdGuard's own
  public Family resolver — and **ads → `REFUSED`/`0.0.0.0`** depending on the profile's block
  mode. Clean domains resolve normally (multi-IP geo rotation across resolvers is normal:
  GitHub's authoritative meta lists all endpoints).
- Do not mix plain AdGuard v4 into the upstream list while a profiled path is active: dnsmasq
  races upstreams and prefers the fastest responder — the v4 path wins and silently bypasses the
  profile. `94.140.14.49` is the emergency upstream only.
- Pi-hole itself cannot speak DoH/DoT/DoQ to upstreams (any version) — that is what the
  dnscrypt-proxy sidecar is for.
- Verification: queries ticking under the device in the AdGuard dashboard — **confirmed working by the user (2026-11-22)**.

## Rollback runbook

| Scope | Action | Effect |
|---|---|---|
| DNS chain | Pi-hole upstreams → `94.140.14.49` / `94.140.14.59`; `sudo systemctl disable --now dnscrypt-proxy` | Unfiltered-but-working DNS, no AdGuard profile |
| DHCP back to router | Livebox UI: enable DHCP server; Pi-hole Settings → DHCP disable | Router owns leases again |
| Server addressing | `sudo cp /etc/netplan/60-pi-lan.yaml.bak-20261122 /etc/netplan/60-pi-lan.yaml && sudo netplan apply` | Back to pre-accept-ra state (address unchanged) |
| Pi-hole container | `sudo systemctl stop pihole` (or edit the Quadlet) | Quadlet-managed; `systemctl start` brings it back with the same volume |
| DNS resolver lost | Temporarily set any client's DNS to `94.140.14.49` | Immediate unfiltered-but-working DNS |

## Verification quickies (from the laptop)

```fish
dig @192.168.1.10 pennywise.lan +short        # 192.168.1.10
dig @192.168.1.10 doubleclick.net +short      # 0.0.0.0 / empty (ads blocked, REFUSED upstream)
dig @192.168.1.10 github.com +short           # real IP (upstream alive)
dig @192.168.1.10 porn.com +short             # 94.140.14.35 (AdGuard adult block page)
ssh well@192.168.1.10 'dig @127.0.0.1 -p 5353 github.com +short'   # sidecar direct
ssh well@192.168.1.10 'cat /var/lib/dns-chain-health/last'           # last automated health verdict
nmcli -f DHCP4 con show <active-wifi> | grep dhcp_server_identifier   # 192.168.1.10
ssh well@192.168.1.10 'ss -ulnp | grep ":67 "'                          # DHCP listener
```

## Open items

- Rotate the Pi-hole web UI password if it ever transits logs/chat.
- Dead weight: stale rootless `pihole` volume from an early attempt (user `well`) — `podman volume rm pihole` (as `well`) to clean when confident.

Done 2026-11-22: DoH sidecar live (`[adguard-private] OK (DoH)`), Pi-hole upstream final
`127.0.0.1#5353`, `pennywise.lan` was already `.10`, `/etc/sudoers.d/99-pi-setup` and
`real.toml.bak` removed (server sudo needs a password again).
