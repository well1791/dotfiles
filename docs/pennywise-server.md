# Pennywise — home LAN server (Pi-hole DNS)

Ops reference for `pennywise`, the home-network DNS server. All configuration lives **on the server**; this machine's dotfiles only document it. Secrets (WiFi PSK, Pi-hole admin password, AdGuard device tokens/dedicated addresses) are deliberately absent — fetch them from the server or the AdGuard dashboard when needed.

Last verified: 2026-11-19

## Hardware & OS

| | |
|---|---|
| Box | GOLE2 JSL mini PC (Intel Jasper Lake) |
| OS | Ubuntu Server 24.04.5 LTS, kernel 6.8 generic |
| Ethernet | `enp1s0` — Realtek RTL8111, driver `r8169`, Gigabit |
| WiFi | `wlp2s0` — RTL8821CE, driver `rtw_8821ce` |
| Podman | 4.9.3 (rootful for Pi-hole) |
| Access | `ssh well@pennywise.lan` (resolves via Pi-hole itself; fallback `well@192.168.1.137` / `.138`) |

Note: `enp1s0` shows DOWN until configured — no netplan stanza means networkd leaves it administratively down; it is not a driver problem.

## Network layout

| Node | Address | Role |
|---|---|---|
| Router (ZTE, LuQUID fw) | 192.168.1.1 | **DHCP server (stays on)**; pushes DNS `192.168.1.137` + secondary `94.140.14.59` (free AdGuard, failover) |
| pennywise `enp1s0` | 192.168.1.137/24, default route metric 100 | **The LAN DNS server** |
| pennywise `wlp2s0` | 192.168.1.138/24, metric 700 | WiFi fallback / second admin door |
| laptop (dotfiles machine) | 192.168.1.130 | DHCP client |

- LAN domain: `lan` — `pennywise.lan` is a Pi-hole local DNS record (`.local` is reserved for mDNS).
- IPv6: ISP GUA via RA on both server interfaces; works for upstream DNS. The public IPv4 egress is a shared/tunneled address (RIPE space behind a Mexican ISP) — **public-IPv4 identification is unreliable**, which is why the AdGuard integration uses dedicated IPv6 instead of "linked IP" (below).
- Router WAN IPv6 mode (`dhcp` vs `auto`): leave on `dhcp` — it governs prefix delegation, not DNS.

## Server configuration

### Netplan — `/etc/netplan/60-pi-lan.yaml` (static override)

The original cloud-init file (`50-cloud-init.yaml`, WiFi + PSK) is untouched; cloud-init is disabled (`/etc/cloud/cloud-init.disabled`) so it never overwrites. The override merges by lexical file order (60 > 50).

```yaml
network:
  version: 2
  ethernets:
    enp1s0:
      dhcp4: false
      addresses:
        - 192.168.1.137/24
      routes:
        - to: default
          via: 192.168.1.1
          metric: 100
      nameservers:
        addresses: [192.168.1.137, 94.140.14.59]
  wifis:
    wlp2s0:
      dhcp4: false
      addresses:
        - 192.168.1.138/24
      routes:
        - to: default
          via: 192.168.1.1
          metric: 700
      nameservers:
        addresses: [192.168.1.137, 94.140.14.59]
```

Why: the router hands out sticky DHCP leases, so leaving WiFi on DHCP risked it reclaiming `.137` after Ethernet took it. Two statics is deterministic. The secondary nameserver (`94.140.14.59`) also breaks the boot-time chicken-and-egg while FTL resolves its upstream hostnames.

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
AddCapability=SYS_TIME
AddCapability=SYS_NICE
Environment=TZ=Europe/Madrid
Volume=pihole:/etc/pihole

[Service]
Restart=always

[Install]
WantedBy=multi-user.target
```

- **Boot persistence**: podman 4.9's quadlet silently drops `[Install]` and `systemctl enable` refuses generated units, so:

  ```fish
  sudo ln -sfn /run/systemd/generator/pihole.service /etc/systemd/system/multi-user.target.wants/pihole.service
  ```

- Data: rootful named volume `pihole` → `/etc/pihole` (`pihole.toml`, `gravity.db`, `dhcp.leases`, certs). Deleting the container does not lose config.
- Host network was chosen over published ports: the previous bridge-mode container answered TCP (web UI) but dropped UDP 53 from LAN clients (netavark/aardvark path).
- ufw: inactive.
- Stale rootless volume from an earlier attempt still exists (user `well`): `podman volume rm pihole` to clean when confident.
- Server sudo has no NOPASSWD (a temporary `/etc/sudoers.d/99-pi-setup` entry was used during setup and removed). Re-create it for any scripted server-side work:

  ```fish
  ssh -t well@pennywise.lan
  sudo sh -c 'printf "well ALL=(ALL) NOPASSWD:ALL\n" > /etc/sudoers.d/99-pi-setup && chmod 440 /etc/sudoers.d/99-pi-setup'
  # ... work ... then: sudo rm /etc/sudoers.d/99-pi-setup
  ```

## Pi-hole application config (web UI, persisted in the volume)

| Setting | Value |
|---|---|
| Upstreams | **Two dedicated IPv6 addresses** from the Private AdGuard DNS device (see below) — nothing else |
| Local DNS record | `pennywise.lan` → `192.168.1.137` |
| DHCP | **Disabled** — the router owns DHCP |
| TZ | Europe/Madrid |

**Do not mix plain AdGuard v4 (`94.140.14.49/.59`) into the upstream list while the dedicated IPv6 entries are active**: dnsmasq races upstreams and prefers the fastest responder — the v4 path would win and silently bypass the account profile. `94.140.14.49` is the *emergency* upstream only (re-add temporarily if IPv6 breaks).

Pi-hole itself cannot speak DoH/DoT/DoQ to upstreams (any version) — the encrypted-upstream option is a dnscrypt-proxy sidecar (not deployed; see open items).

## AdGuard DNS (Private) integration

- Identification is by **dedicated IPv6 addresses** bound to a device in the AdGuard dashboard (Dashboard → Servers → device → *Use DNS server addresses* → *Plain DNS Server Addresses*). The address embeds the device token, so no public IP, DDNS, or linked-IP is involved.
- Router DDNS support (no-ip/freedns) exists but is unused — it was only ever needed for "linked IP", which the shared IPv4 egress makes unreliable.
- The LAN appears to AdGuard as a single client (everything egresses from pennywise); per-device visibility lives in Pi-hole's query log.
- Verification: queries ticking under the device in the AdGuard dashboard.

## Rollback runbook

| Scope | Action | Effect |
|---|---|---|
| Whole design | Router UI: DNS back to `94.140.14.49` / `94.140.14.59` | LAN returns to free AdGuard within one DHCP lease renewal |
| Server addressing | `sudo rm /etc/netplan/60-pi-lan.yaml; sudo netplan apply` | Back to DHCP-over-WiFi (cloud-init file) |
| Pi-hole container | `sudo systemctl stop pihole` (or edit the Quadlet) | Quadlet-managed; `systemctl start` brings it back with the same volume |
| DNS resolver lost | Temporarily set any client's DNS to `94.140.14.49` | Immediate unfiltered-but-working DNS |

## Verification quickies (from the laptop)

```fish
dig @192.168.1.137 pennywise.lan +short        # 192.168.1.137
dig @192.168.1.137 doubleclick.net +short      # 0.0.0.0 (blocked)
dig @192.168.1.137 (random-fresh-name)         # fast NXDOMAIN = upstream alive
ssh well@pennywise.lan hostname                # pennywise
```

## Open items

- Router still announces ISP IPv6 DNS (RA) alongside the v4-pushed `.137` — minor bypass path; clear the router's IPv6 DNS announcement if a toggle appears.
- dnscrypt-proxy sidecar (Quadlet, bridge net, DoH to the same AdGuard device URL) would encrypt the upstream hop — optional, not deployed.
- DHCP migration to Pi-hole: evaluated and parked. Pros: client names in query log, static leases, search domain. Cons: LAN bootstrap depends on pennywise; Pi-hole DHCP advertises only itself (no failover). The container is already capable (rootful, host net, NET_ADMIN) — migration is two toggles: router DHCP off + Pi-hole Settings → DHCP enable.
- Rotate the Pi-hole web UI password if it ever transits logs/chat.
