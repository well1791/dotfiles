# CLI Tools Reference

Preferred tools on this system. Use these instead of traditional alternatives.

## Quick Reference

| Task | Use | Not |
|------|-----|-----|
| Find files | `fd` | `find` |
| Search text | `rg` | `grep` |
| Text substitution | `sd` | `sed` |
| View files | `bat` | `cat` |
| List dirs | `eza` | `ls` |
| Dir disk usage | `dust` | `du` |
| FS disk usage | `duf` | `df` |
| Git diffs | `delta` | raw diff |
| Navigate dirs | `zoxide` | `cd` |
| Browse files | `yazi` | - |
| Clipboard copy | `wl-copy` | `xclip` |
| Clipboard paste | `wl-paste` | `xclip -o` |
| Nix packages | `nix profile` | `nix-env` |

## Shell Aliases

```
cat  → bat -p
du   → dust
df   → duf
l    → eza --all --long
ll   → eza --all --long --tree --level=2
rgd  → rg --json -C 2 % | delta
y    → yazi (with cd-on-exit)
```

## nix

Experimental features not enabled globally. All `nix` subcommands need:
`--extra-experimental-features "nix-command flakes"` (shown as `$NF` below).

`nix profile install` is a deprecated alias for `nix profile add`.
`nix-env` and `nix profile` are separate systems — do not mix.
Flake refs: `github:user/repo`, `nixpkgs#name`, `path:./local`.

```sh
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
nix-channel --update                       # update channels (legacy)
nix-env -u                                 # upgrade nix-env pkgs (legacy)
```

## sd

NEVER use `sed`. Always use `sd`.

```sh
sd 'old' 'new' file.txt                   # in-place replacement
sd 'before' 'after' f1.txt f2.txt         # multiple files
sd -F '[ERROR]' '[WARN]' file.txt         # literal string (-F, no regex)
echo 'text' | sd 'pattern' 'replacement'  # stdin pipe
sd '(\w+) (\w+)' '$2 $1' file.txt        # capture groups ($1, $2)
sd '.*pattern.*\n' '' file.txt            # delete matching lines
sd '(.*marker.*)' '$1\nnew_line' file.txt # insert after match
sd 'a' 'b' f && sd 'c' 'd' f             # multiple patterns (one per invocation)
fd -e rs | xargs sd 'old' 'new'           # bulk across file type
rg -l 'old' src/ | xargs sd 'old' 'new'  # replace in files matching pattern
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

```sh
# sed → sd examples
sed -i 's/old/new/g' f                    →  sd 'old' 'new' f
sed -i 's/\(a\)_\(b\)/\2_\1/g' f         →  sd '(a)_(b)' '$2_$1' f
sed -Ei 's/v([0-9]+)/v\1.0/g' f          →  sd 'v([0-9]+)' 'v$1.0' f
sed -i 's/\[X\]/[Y]/g' f                 →  sd -F '[X]' '[Y]' f
echo x | sed 's/.*/"&"/'                 →  echo x | sd '.*' '"$0"'
```

## serpl

```sh
serpl                                      # interactive TUI search/replace
serpl --search 'old' --replace 'new'       # pre-filled
serpl --dir /path                          # specific directory
```

## fd

Respects `.gitignore` by default. Use `--no-ignore` to override, `--hidden` for dotfiles.

```sh
fd pattern                                 # find by name
fd -t f pattern                            # files only
fd -t d pattern                            # directories only
fd pattern path/                           # search specific path
fd -i pattern                              # case-insensitive
fd -e rs                                   # by extension
fd --hidden --no-ignore pattern            # include hidden + ignored
fd --exclude .git pattern                  # exclude pattern
fd pattern --exec cmd {}                   # exec per result
fd -e py | xargs cmd                       # pipe to xargs
```

## rg

Respects `.gitignore` by default. Smart-case (case-insensitive when pattern is lowercase).

```sh
rg pattern                                 # recursive search
rg pattern path/                           # specific path
rg -i pattern                              # force case-insensitive
rg -l pattern                              # filenames only
rg -c pattern                              # count per file
rg -C 2 pattern                            # 2 lines context
rg -F "exact string"                       # literal (no regex)
rg --type rust pattern                     # filter by filetype
rg pattern --glob '!*.min.js'              # exclude glob
rg --json pattern | delta                  # pipe to delta
```

## bat

```sh
bat file.txt                               # syntax highlighted
bat -p file.txt                            # plain (no decorations)
bat -n file.txt                            # line numbers only
bat -A file.txt                            # show non-printable chars
bat --language rust file.txt               # force language
bat --diff file.txt                        # show git changes
```

## eza

```sh
eza -la                                    # all files, long format
eza -la --tree --level=2                   # tree view
eza -la --sort modified                    # sort by mtime
eza -la --sort size                        # sort by size
eza -la --git                              # show git status
eza -la --only-dirs                        # directories only
```

## dust

```sh
dust                                       # current dir usage
dust /path                                 # specific path
dust -d 2                                  # limit depth
dust -n 10                                 # top 10 largest
dust -r                                    # smallest first
dust -X .git -X node_modules               # exclude patterns
dust -f                                    # files only
dust -D                                    # directories only
dust -b                                    # no percent bars
```

## duf

```sh
duf                                        # all filesystems
duf /home                                  # specific path
duf --only local                           # local only
duf --sort usage                           # sort by usage %
duf --json                                 # JSON output
duf --all                                  # include pseudo/special
```

## delta

```sh
git diff | delta                           # view git diff
git log -p | delta                         # log with diffs
diff f1 f2 | delta                         # compare files
git show HASH | delta                      # show commit
```

## zoxide

```sh
z dirname                                  # jump to frecent dir
zi pattern                                 # interactive selection
zoxide add .                               # add current dir
zoxide remove /path                        # remove from db
zoxide query pattern                       # query db
```

## yazi

```sh
yazi                                       # browse current dir
yazi /path                                 # browse specific dir
```

## wl-copy / wl-paste

```sh
echo "text" | wl-copy                      # copy to clipboard
wl-copy < file.txt                         # copy file contents
wl-paste                                   # paste
wl-paste > out.txt                         # paste to file
wl-paste --list-types                      # list MIME types
wl-copy --primary                          # primary selection
wl-copy --clear                            # clear clipboard
```

## Common Patterns

```sh
fd -e py | xargs sd 'old' 'new'            # bulk rename across filetype
rg -l 'pattern' | xargs sd 'old' 'new'    # find-then-replace
fd '\.md$' | xargs bat                     # preview matched files
rg --json -C 2 pattern | delta             # search with diff view
fd pattern | wl-copy                       # copy paths to clipboard
git diff | wl-copy                         # copy diff to clipboard
```

## Defaults

- `fd`, `rg`: respect `.gitignore`, exclude hidden files. Override with `--no-ignore`, `--hidden`.
- All tools: color auto-disabled when piping. Force with `--color always`.
- All tools are installed on this system. No fallbacks needed.
