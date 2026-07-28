# Memory Backup Restore

Encrypted snapshots of pi-hermes-memory live in `memory-backup/` (`global/` and
`projects/<proj>/`). Files are age-encrypted with the chezmoi recipient; decrypt
with the chezmoi identity at `~/.config/chezmoi/key.txt`.

This directory is at the chezmoi repo root, NOT under `home/`, so `chezmoi apply`
never touches it — it is a pure git backup. It comes along with `chezmoi init`
(repo clone) but is not applied.

## On a new machine (after `chezmoi init --apply`)

```fish
set -l ident ~/.config/chezmoi/key.txt
set -l repo (chezmoi source-path)

# global surfaces
mkdir -p ~/.pi/agent/pi-hermes-memory
for f in $repo/memory-backup/global/*.age
    age -d -i $ident -o ~/.pi/agent/pi-hermes-memory/(basename $f .age) $f
end

# per-project surfaces
for f in $repo/memory-backup/projects/*/*.age
    set -l proj (basename (dirname $f))
    mkdir -p ~/.pi/agent/projects-memory/$proj
    age -d -i $ident -o ~/.pi/agent/projects-memory/$proj/(basename $f .age) $f
end
```

Note: this restores the snapshot taken at the last `memory-backup` run. Run
`memory-backup` regularly (or before migrating) to keep it fresh.
