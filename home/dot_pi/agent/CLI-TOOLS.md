# CLI Tools Reference

Modern CLI tools for operations **not covered by lean-ctx MCP tools**. lean-ctx handles file reading, text search, file finding, directory listing, shell execution, symbol outline, code editing, and multi-file understanding — reach those through the `ctx_*` tools (`ctx_read`, `ctx_grep`, `ctx_search`, `ctx_find`, `ctx_glob`, `ctx_ls`, `ctx_tree`, `ctx_shell`, `ctx_outline`, `ctx_patch`, `ctx_edit`, `ctx_compose`). For LSP-precise symbol edits, use Serena — see the Tool Routing section in [AGENTS.md](./AGENTS.md).

This file covers what lean-ctx leaves to the shell: text substitution, field extraction, directory navigation, JSON query, diff review, and runtime/package managers.

All examples use **fish shell syntax**.

---

## Modern tool → legacy quick reference

| Operation | Modern | Not (legacy) |
|-----------|--------|--------------|
| Text substitution | `sd` | `sed` |
| Field/column extraction | `choose` | `cut`, `awk` (simple cases) |
| Directory jump | `z` (zoxide) | `cd` |
| JSON query | `jq` | manual parsing |
| Diff review (TUI) | `hunk` | raw `git diff` piping |
| Syntax-highlighted pager | `delta` (git `core.pager`) | plain `diff` |

> `rg`, `fd`, `eza`, `bat`, `dust`, `duf` are also modern replacements, but the agent reaches them through lean-ctx MCP (`ctx_search`, `ctx_find`, `ctx_ls`, `ctx_read`) — not by shelling out directly. Prefer the MCP tool unless composing a one-off pipeline that lean-ctx has no tool for.

---

## sd

NEVER use `sed`. Always use `sd`.

```fish
sd 'old' 'new' file.txt                   # in-place replacement
sd 'before' 'after' f1.txt f2.txt         # multiple files
sd -F '[ERROR]' '[WARN]' file.txt         # literal string (-F, no regex)
echo 'text' | sd 'pattern' 'replacement'  # stdin pipe
sd '(\w+) (\w+)' '$2 $1' file.txt        # capture groups ($1, $2)
sd '.*pattern.*\n' '' file.txt            # delete matching lines
sd '(.*marker.*)' '$1\nnew_line' file.txt # insert after match
```

### Bulk Operations

```fish
# Replace across all files of a type (use ctx_find to locate, sd to replace)
fd -e rs | xargs sd 'old' 'new'
rg -l 'old' src/ | xargs sd 'old' 'new'
```

### sed → sd Translation

| Concept | `sed` | `sd` |
|---------|-------|------|
| In-place | `-i` required | default on files |
| Regex groups | `\(` `\)` (BRE) or `(` `)` with `-E` | `(` `)` always |
| Capture refs | `\1` `\2` | `$1` `$2` |
| Whole match | `&` | `$0` |
| Literal strings | escape everything | `-F` flag |
| Delimiter | `s/pat/rep/` | two arguments |
| Global replace | needs `/g` | default |

```fish
# sed → sd examples
# sed -i 's/old/new/g' f             →
sd 'old' 'new' f
# sed -i 's/\(a\)_\(b\)/\2_\1/g' f   →
sd '(a)_(b)' '$2_$1' f
# sed -Ei 's/v([0-9]+)/v\1.0/g' f    →
sd 'v([0-9]+)' 'v$1.0' f
# sed -i 's/\[X\]/[Y]/g' f           →
sd -F '[X]' '[Y]' f
# echo x | sed 's/.*/"&"/'           →
echo x | sd '.*' '"$0"'
```

---

## choose

`choose` extracts fields/columns by index — a human-friendly `cut`/`awk` replacement. Use it for simple column extraction in pipelines. For regex substitution use `sd`; for conditional or multi-line transforms use `ctx_execute` (or `awk` when its full power is genuinely needed).

```fish
choose 0 file.txt                 # first whitespace-separated field
choose 1: file.txt                # 2nd field through end of line
choose -f, -1 data.csv            # last comma-separated field
echo "a:b:c" | choose -f: 1       # 2nd colon-separated field → "b"
choose 2..5 file.txt              # fields 3-5 (exclusive end)
choose -x 0:2 file.txt            # fields 1-2 (exclusive range, 0-indexed)
echo "a b c" | choose 0 2         # pick fields 1 and 3
```

- Default field separator: whitespace. Override with `-f <regex>` (e.g. `-f,` for comma).
- Ranges: `a:b` inclusive, `a..b` exclusive, `a..=b` inclusive, open-ended by omitting a bound.
- Indices are **0-based** by default; `--one-indexed` switches to 1-based.

---

## zoxide (`z`)

Smarter `cd` — jumps to frecency-ranked directories by substring. Use when **suggesting directory changes to the user** or scripting interactive fish sessions. The agent itself operates by cwd and absolute paths and does not need `z`.

```fish
z foo               # jump to most-used dir matching "foo"
z proj src          # refine: best match for "proj" then "src"
zi                  # interactive picker (fzf) over ranked dirs
zoxide add /path    # register a dir without jumping
zoxide query --list # show the ranked database (non-mutating)
```

- Requires fish integration (`zoxide init fish | source`) — wired via chezmoi.
- `z` = jump, `zi` = interactive jump, `zoxide query` = lookup, `zoxide add` = register.

---

## jq

JSON query/transform, run via `ctx_shell`. For YAML, use `yq` if available.

```fish
jq '.field' data.json
jq '.items[] | .name' data.json
jq -r '.url' meta.json             # raw (unquoted) output
echo '{"a":1}' | jq '.a'           # stdin
jq 'keys' data.json                # object keys
```

---

## hunk

Review-first terminal diff viewer. Use for git diffs, file comparisons, and inline review comments.

The TUI is for the user — do NOT run `hunk diff` or `hunk show` directly. Use `hunk session *` CLI commands to inspect and control live sessions through the local daemon.

### Launching (user-side)

```fish
hunk diff                                  # review working tree changes
hunk diff --watch                          # auto-reload on changes
hunk show                                  # review latest commit
hunk show HEAD~1                           # review earlier commit
hunk diff file1 file2                      # compare two files
git diff | hunk patch -                    # review patch from stdin
```

### Session Inspection

```fish
hunk session list --json                   # find live sessions
hunk session get --repo . --json           # inspect session path/repo/source
hunk session context --repo . --json       # current focus (file, hunk, line)
hunk session review --repo . --json        # file/hunk structure (lightweight)
hunk session review --repo . --include-patch --json  # include raw diff text
hunk session review --repo . --include-notes --json  # include inline comments
```

### Navigation

```fish
hunk session navigate --repo . --file src/App.tsx --hunk 2
hunk session navigate --repo . --file src/App.tsx --new-line 103
hunk session navigate --repo . --next-comment
hunk session navigate --repo . --prev-comment
```

### Reload (swap session contents)

```fish
hunk session reload --repo . -- diff
hunk session reload --repo . -- diff main...feature -- src/ui
hunk session reload --repo . -- show HEAD~1
```

### Inline Review Comments

Add a single comment:

```fish
hunk session comment add --repo . \
  --file README.md --new-line 103 \
  --summary "Tighten this wording" \
  --rationale "The current phrasing is ambiguous" \
  --author "agent" --focus
```

Batch-apply multiple comments (preferred for agent reviews):

```fish
printf '%s\n' '{"comments":[
  {"filePath":"src/main.rs","newLine":42,"summary":"Missing error propagation","rationale":"This unwrap will panic on invalid input"},
  {"filePath":"src/lib.rs","hunk":1,"summary":"Consider extracting this into a helper"}
]}' | hunk session comment apply --repo . --stdin --focus
```

List and manage comments:

```fish
hunk session comment list --repo . --json              # all live comments
hunk session comment list --repo . --type user --json  # human-authored only
hunk session comment list --repo . --type agent --json # agent-authored only
hunk session comment rm --repo . <comment-id>          # remove one
hunk session comment clear --repo . --yes              # clear all agent comments
```

### Agent Review Workflow

1. `hunk session review --repo . --json` — understand file/hunk structure
2. `hunk session review --repo . --include-patch --json` — read raw diff for files of interest
3. Compose review notes targeting specific lines or hunks
4. `hunk session comment apply --stdin` — batch-apply all notes
5. `hunk session navigate --repo . --file <first> --new-line <n>` — focus user on key finding
6. Summarize the review for the user

Guidelines:
- Navigate before commenting so the user sees the relevant code
- Use `comment apply` for batches, `comment add` for one-off notes
- Use `--focus` sparingly — only when the note should steer the review
- Comment on what matters: intent, risks, follow-ups. Skip obvious hunks.

---

## nix

Experimental features are not enabled globally. All `nix` subcommands need:
`--extra-experimental-features "nix-command flakes"` (shown as `$NF` below).

In fish, set this as a variable:

```fish
set NF --extra-experimental-features "nix-command flakes"
```

`nix profile install` is a deprecated alias for `nix profile add`.
`nix-env` and `nix profile` are separate systems — do not mix.
Flake refs: `github:user/repo`, `nixpkgs#name`, `path:./local`.

```fish
nix profile add github:user/repo $NF       # add flake package globally
nix profile add nixpkgs#pkg $NF            # add nixpkgs package
nix profile list $NF                       # list installed
nix profile upgrade '.*pkg.*' $NF          # upgrade by regex
nix profile upgrade '.*' $NF               # upgrade all
nix profile remove '.*pkg.*' $NF           # remove by regex
nix profile history $NF                    # view history
nix profile rollback $NF                   # rollback
nix run github:user/repo $NF               # run without installing
nix run github:user/repo -- --arg $NF      # run with args
nix shell nixpkgs#a nixpkgs#b $NF          # temp shell with packages
nix search nixpkgs name $NF               # search packages
nix flake show github:user/repo $NF        # show flake outputs
nix flake update $NF                       # update flake.lock
nix store gc $NF                           # garbage collect
nix store optimise $NF                     # deduplicate store
nix-collect-garbage --delete-older-than 30d # gc older than 30d
```

---

## Defaults

- All examples assume fish shell. Do not translate to bash/POSIX.
- `sd`: replaces globally by default (no `/g` needed). In-place on files by default.
- `choose`: 0-indexed, whitespace-separated by default.
- `hunk`: color auto-disabled when piping. Force with `--color always`.
