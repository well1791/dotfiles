# CLI Tools Reference

Shell tools the agent invokes directly — the curated subset of installed CLI tools that is non-interactive, scriptable, and token-efficient.

Scope boundaries:

- File operations (read, search, find, list, edit, shell) go through lean-ctx MCP tools (`ctx_read`, `ctx_grep`, `ctx_search`, `ctx_find`, `ctx_ls`, `ctx_tree`, `ctx_shell`, `ctx_patch`, `ctx_edit`, `ctx_compose`) — not by shelling out. `rg` / `fd` / `eza` / `bat` / `dust` / `duf` exist but are reached through those MCP tools.
- LSP-precise symbol edits go through Serena (`serena_*`) — see Tool Routing in [AGENTS.md](./AGENTS.md).
- User-facing TUIs are not agent tools — never invoke television, navi, yazi, gitu, serpl, sqlit, lazyjira, slumber, vortix, leaf, or atuin. `z` (zoxide) is for user-facing navigation suggestions only.

All examples fish syntax. Byte-cap unknown command output: `COMMAND 2>&1 | head -c 4000`.

## Quick map

| Operation | Tool |
|---|---|
| Text substitution | `sd` — never `sed` |
| Field/column extraction | `choose` — never `cut`/`awk` for simple cases |
| JSON query | `jq` |
| Diff review sessions | `hunk session *` |
| Nix profile / flake ops | `nix` |
| Command usage lookup | `tldr` |

## sd

In-place, global replacement by default. Standard regex — no backslash-escaping of `( ) + ?`; capture groups are `$1` `$2`; `-F` for literal strings.

```fish
sd 'old' 'new' file.txt                   # in-place replacement
sd 'before' 'after' f1.txt f2.txt         # multiple files
sd -F '[ERROR]' '[WARN]' file.txt         # literal (-F, no regex)
echo 'text' | sd 'pattern' 'replacement'  # stdin pipe
sd '(\w+) (\w+)' '$2 $1' file.txt         # capture groups
sd '.*pattern.*\n' '' file.txt            # delete matching lines

# Bulk: locate with ctx_find/ctx_grep, then
rg -l 'old' src/ | xargs sd 'old' 'new'
```

sed → sd translation:

| Concept | `sed` | `sd` |
|---|---|---|
| In-place | `-i` required | default on files |
| Regex groups | `\(` `\)` (or `-E`) | `(` `)` always |
| Capture refs | `\1` `\2` | `$1` `$2` |
| Whole match | `&` | `$0` |
| Literal strings | escape everything | `-F` |
| Global replace | needs `/g` | default |

```fish
# sed -i 's/old/new/g' f            →
sd 'old' 'new' f
# sed -i 's/\(a\)_\(b\)/\2_\1/g' f  →
sd '(a)_(b)' '$2_$1' f
# sed -i 's/\[X\]/[Y]/g' f          →
sd -F '[X]' '[Y]' f
```

## choose

Field/column extraction by index — human-friendly `cut`/`awk` replacement. Default: whitespace separator, 0-based indices.

```fish
choose 0 file.txt                 # first whitespace-separated field
choose 1: file.txt                # 2nd field through end of line
choose -f, -1 data.csv            # last comma-separated field
echo "a:b:c" | choose -f: 1       # 2nd colon-separated field → "b"
choose 2..5 file.txt              # fields 3-5 (exclusive end)
echo "a b c" | choose 0 2         # pick fields 1 and 3
```

Separator: `-f <regex>` (e.g. `-f,`). Ranges: `a:b` inclusive, `a..b` exclusive, `a..=b` inclusive, open-ended by omitting a bound. `--one-indexed` switches to 1-based. For regex substitution use `sd`; for conditional or multi-line transforms use `ctx_execute`.

## jq

JSON query/transform via `ctx_shell`. For YAML use `yq` if available.

```fish
jq '.field' data.json
jq '.items[] | .name' data.json
jq -r '.url' meta.json             # raw (unquoted) output
jq 'keys' data.json                # object keys
echo '{"a":1}' | jq '.a'           # stdin
```

## hunk (review sessions)

Review-first diff viewer. The TUI belongs to the user — never run `hunk diff` / `hunk show` directly. The agent drives live review sessions through the `hunk session *` CLI against the local daemon.

Inspect:

```fish
hunk session list --json                       # find live sessions
hunk session get --repo . --json               # session path/repo/source
hunk session review --repo . --json            # file/hunk structure
hunk session review --repo . --include-patch --json        # raw diff text
hunk session review --repo . --include-notes --json        # inline comments
hunk session context --repo . --json           # current focus (file, hunk, line)
```

Navigate:

```fish
hunk session navigate --repo . --file src/App.tsx --new-line 103
hunk session navigate --repo . --file src/App.tsx --hunk 2
hunk session navigate --repo . --next-comment
```

Comments — batch-apply preferred:

```fish
printf '%s\n' '{"comments":[
  {"filePath":"src/main.rs","newLine":42,"summary":"Missing error propagation","rationale":"Panics on invalid input"},
  {"filePath":"src/lib.rs","hunk":1,"summary":"Consider extracting a helper"}
]}' | hunk session comment apply --repo . --stdin --focus

hunk session comment add --repo . --file README.md --new-line 103 \
  --summary "Tighten wording" --author "agent"     # one-off
hunk session comment list --repo . --json          # all comments
hunk session comment rm --repo . <comment-id>
hunk session comment clear --repo . --yes          # clear agent comments
```

Agent review flow: review structure → read patches of interest → navigate to the key finding → batch-apply comments → summarize. Comment on intent, risks, follow-ups; skip obvious hunks; use `--focus` sparingly.

## nix

Experimental features are not enabled globally — every subcommand needs `--extra-experimental-features "nix-command flakes"`. In fish:

```fish
set NF --extra-experimental-features "nix-command flakes"
```

`nix profile install` is deprecated for `nix profile add`. `nix-env` and `nix profile` are separate systems — do not mix. Flake refs: `github:user/repo`, `nixpkgs#name`, `path:./local`.

```fish
nix profile add github:user/repo $NF       # add flake package globally
nix profile add nixpkgs#pkg $NF            # add nixpkgs package
nix profile list $NF
nix profile upgrade '.*' $NF               # upgrade all (or '.*pkg.*')
nix profile remove '.*pkg.*' $NF
nix profile rollback $NF
nix run github:user/repo $NF               # run without installing
nix shell nixpkgs#a nixpkgs#b $NF          # temp shell with packages
nix search nixpkgs name $NF
nix flake show github:user/repo $NF
nix flake update $NF
nix store gc $NF
nix-collect-garbage --delete-older-than 30d
```

Home-manager (used by this dotfiles repo):

```fish
nix flake update --flake ~/.config/home-manager
home-manager switch --flake ~/.config/home-manager
```

## tldr

Command usage lookup via tealdeer — first stop in the research order before `man` or online search.

```fish
tldr <cmd>          # usage summary for a command
tldr --update       # refresh the local cache
```
