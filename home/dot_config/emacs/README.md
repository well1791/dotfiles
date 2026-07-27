# Emacs config (meow, minimal)

Selection-first modal editing, derived from meow's QWERTY layout with a
Helix-style `ijkl` navigation cluster. Elpaca manages packages.

## Files
- `early-init.el` — disables package.el + startup/GC tweaks.
- `init.el` — elpaca bootstrap + the whole config in sections: meow, completion, LSP, editor.
- `README.md` — this file.

## The ijkl navigation cluster
| Key | Action | meow command |
|-----|--------|--------------|
| `i` | up              | `meow-prev` |
| `k` | down            | `meow-next` |
| `j` | prev word start | `meow-back-word` |
| `l` | next word       | `meow-next-word` |

### Displaced from stock QWERTY (relocated)
| Key | Now | Was |
|-----|-----|-----|
| `b` | `meow-insert` | `meow-back-word` (moved to `j`) |
| `e` | `meow-right`  | `meow-next-word` (moved to `l`) |

> `meow-next-word` lands on the next word boundary; if you want strict
> end-of-word (Helix `move_next_word_end`), run `C-h f meow-` and pick a
> forward-to-end command, then bind it to `l` in `my/meow-setup`.

## First launch
Elpaca builds packages asynchronously after init. **Launch emacs twice the first
time** — the first builds packages (watch `*elpaca*`), the second has everything
active. Subsequent launches are instant.

## How to modify
- **See all current bindings:** `SPC ?` (`meow-cheatsheet`).
- **Remap a meow key:** edit the `meow-normal-define-key` alist in `my/meow-setup`.
- **Add a package:** `(use-package <name> :ensure t)`.
- **Update packages:** `M-x elpaca-update-all`.

## Docs
- meow tutorial: `M-x meow-tutor`
- meow commands: https://github.com/meow-edit/meow/blob/master/COMMANDS.org
- elpaca manual: https://github.com/progfolio/elpaca/blob/master/doc/manual.md
- eglot manual: `C-h i d m eglot RET`

## Suggested first additions (port from helix at your pace)
`magit` (git), `embark` (act on thing at point), `corfu` (completion popup),
tree-sitter highlighting, `org-mode`.
