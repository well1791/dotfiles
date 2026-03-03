;;; $DOOMDIR/config.el -*- lexical-binding: t; -*-

;; Place your private configuration here! Remember, you do not need to run 'doom
;; sync' after modifying this file!


;; Some functionality uses this to identify you, e.g. GPG configuration, email
;; clients, file templates and snippets. It is optional.
(setq user-full-name "Wellington Mendoza"
      user-mail-address "wellsaint91@gmail.com")

;; Doom exposes five (optional) variables for controlling fonts in Doom:
;;
;; - `doom-font' -- the primary font to use
;; - `doom-variable-pitch-font' -- a non-monospace font (where applicable)
;; - `doom-big-font' -- used for `doom-big-font-mode'; use this for
;;   presentations or streaming.
;; - `doom-symbol-font' -- for symbols
;; - `doom-serif-font' -- for the `fixed-pitch-serif' face
;;
;; See 'C-h v doom-font' for documentation and more examples of what they
;; accept. For example:
;;
;;(setq doom-font (font-spec :family "Fira Code" :size 15 :weight 'semi-light)
;;      doom-variable-pitch-font (font-spec :family "Fira Sans" :size 16))
(setq doom-font (font-spec :family "JetBrains Mono" :size 15.0))
(setq-default line-spacing 0.18)

;;
;; If you or Emacs can't find your font, use 'M-x describe-font' to look them
;; up, `M-x eval-region' to execute elisp code, and 'M-x doom/reload-font' to
;; refresh your font settings. If Emacs still can't find your font, it likely
;; wasn't installed correctly. Font issues are rarely Doom issues!

;; There are two ways to load a theme. Both assume the theme is installed and
;; available. You can either set `doom-theme' or manually load a theme with the
;; `load-theme' function. This is the default:
(setq doom-theme 'doom-palenight)

;; This determines the style of line numbers in effect. If set to `nil', line
;; numbers are disabled. For relative line numbers, set this to `relative'.
(setq display-line-numbers-type nil)

;; If you use `org' and don't want your org files in the default location below,
;; change `org-directory'. It must be set before org loads!
(setq org-directory "~/org/")


;; Whenever you reconfigure a package, make sure to wrap your config in an
;; `after!' block, otherwise Doom's defaults may override your settings. E.g.
;;
;;   (after! PACKAGE
;;     (setq x y))
;;
;; The exceptions to this rule:
;;
;;   - Setting file/directory variables (like `org-directory')
;;   - Setting variables which explicitly tell you to set them before their
;;     package is loaded (see 'C-h v VARIABLE' to look up their documentation).
;;   - Setting doom variables (which start with 'doom-' or '+').
;;
;; Here are some additional functions/macros that will help you configure Doom.
;;
;; - `load!' for loading external *.el files relative to this one
;; - `use-package!' for configuring packages
;; - `after!' for running code after a package has loaded
;; - `add-load-path!' for adding directories to the `load-path', relative to
;;   this file. Emacs searches the `load-path' when you load packages with
;;   `require' or `use-package'.
;; - `map!' for binding new keys
;;
;; To get information about any of these functions/macros, move the cursor over
;; the highlighted symbol at press 'K' (non-evil users must press 'C-c c k').
;; This will open documentation for it, including demos of how they are used.
;; Alternatively, use `C-h o' to look up a symbol (functions, variables, faces,
;; etc).
;;
;; You can also try 'gd' (or 'C-c c d') to jump to their definition and see how
;; they are implemented.

(setq auto-save-visited-interval 3) ; Set interval in seconds
(auto-save-visited-mode +1)          ; Enable the mode globally
(setq confirm-kill-emacs nil)
(map! :leader
      :desc "Comment line" "c c" #'comment-line)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Custom Configuration
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

;; --- Indentation: Use 2 spaces instead of tabs ---
(setq-default indent-tabs-mode nil) ; Use spaces, not tabs
(setq-default tab-width 2)
(setq-default standard-indent 2)
(after! evil (setq evil-shift-width 2))
;; Common per-mode tweaks
(setq js-indent-level 2
      typescript-indent-level 2
      python-indent-offset 2
      css-indent-offset 2
      yaml-indent-offset 2
      c-basic-offset 2)
(after! web-mode
  (setq web-mode-markup-indent-offset 2
        web-mode-code-indent-offset 2
        web-mode-css-indent-offset 2
        web-mode-attribute-indent-offset 2))

(after! evil
  ;; Make ',' the prefix for "inner" text objects
  (define-key evil-operator-state-map "," evil-inner-text-objects-map)
  (define-key evil-visual-state-map   "," evil-inner-text-objects-map)

  ;; Make '.' the prefix for "around" text objects
  (define-key evil-operator-state-map "." evil-outer-text-objects-map)
  (define-key evil-visual-state-map   "." evil-outer-text-objects-map)
  
  ;; --- Core Navigation ---
  (map! ;; j/l for word left/right
        :nvo "j" #'evil-backward-word-begin
        :nvo "l" #'evil-forward-word-end

        ;; i/k for visual line up/down
        :nv "i" #'evil-previous-visual-line
        :nv "k" #'evil-next-visual-line

        ;; I/K for scrolling up/down
        :nv "I" #'evil-scroll-up
        :nv "K" #'evil-scroll-down
        ;; Move the original K command to g k
        :n "g k" #'evil-lookup
        
        ;; u/o for beginning/end of line
        :nv "u" #'evil-first-non-blank
        :nv "o" #'evil-end-of-line

        ;; U/O for first/last line of file
        :nv "U" #'evil-goto-first-line
        :nv "O" #'evil-goto-line)

  ;; h/H for undo/redo
  (map! (:when (fboundp 'undo-fu-only-undo) :n "h" #'undo-fu-only-undo)
        (:unless (fboundp 'undo-fu-only-undo) :n "h" #'evil-undo)
        (:when (fboundp 'undo-fu-only-redo) :n "H" #'undo-fu-only-redo)
        (:unless (fboundp 'undo-fu-only-redo) :n "H" #'evil-redo))

  ;; --- "a" prefix for actions ---
  (map! :n "a i" #'evil-open-above
        :n "a j" #'evil-insert
        :n "a k" #'evil-open-below
        :n "a l" #'evil-append
        :n "a u" #'evil-insert-line
        :n "a o" #'evil-append-line
        :n "a ;" #'evil-change)

  ;; --- Other Remaps ---
  ;; Remap x to behave like V (visual-line)
  (map! :nv "x" #'evil-visual-line)

  ;; Remap b to SPC b prefix
  (defun my-leader-b ()
    (interactive)
    (setq unread-command-events (listify-key-sequence (kbd "SPC b"))))
  (map! :n "b" #'my-leader-b)
  ;; Reopen recently closed buffer
  (map! :leader
        :desc "Reopen a recently closed buffer"
        "b t" #'recentf-open-most-recent-file)
) ;; End of (after! evil ...)

;; --- Vterm configuration ---
(after! vterm
  ;; Always start vterm in insert state
  (add-hook 'vterm-mode-hook #'evil-insert-state)
  ;; Send common Ctrl keys to the terminal
  (map! :map vterm-mode-map
        :i "C-d" #'vterm-send-C-d
        :i "C-c" #'vterm-send-C-c
        :i "C-z" #'vterm-send-C-z
        :i "C-a" #'vterm-send-C-a
        :i "C-e" #'vterm-send-C-e
        :i "C-k" #'vterm-send-C-k
        :i "C-l" #'vterm-send-C-l
        :i "C-r" #'vterm-send-C-r))

;; --- High-priority override for scrolling ---
;; This ensures 's' and 'w' for scrolling aren't overridden by minor modes
(map! :map general-override-mode-map
      :nv "w" #'evil-scroll-up
      :nv "s" #'evil-scroll-down
      :nv "W" nil
      :nv "S" nil)

;; 1. Prevent evil-snipe from creating its default keybindings.
;;    This must be set BEFORE evil-snipe is loaded.
(setq evil-snipe-suppress-f-keybindings t)
(setq evil-snipe-suppress-t-keybindings t)
(setq evil-snipe-suppress-s-keybindings t)
;; This also prevents it from grabbing ',' for repeat, which we need for text objects.
(setq evil-snipe-repeat-keys "")

;; 2. After evil-snipe loads, create our own bindings in the correct modes.
(after! evil-snipe
  (map! :nvo "e" #'evil-snipe-s   ; 2-char search forward
        :nvo "E" #'evil-snipe-S)) ; 2-char search backward


(use-package! chezmoi
      :after evil
      :config
      ;; This provides a nicer interface for viewing diffs if you use Magit.
      (setq chezmoi-use-magit-popup t)

      ;; --- Keybindings ---
      (map! :leader
            :desc "Chezmoi find/edit"  "e e" #'chezmoi-find
            :desc "Chezmoi apply/save" "e a" #'chezmoi-write
            :desc "Chezmoi diff"       "e d" #'chezmoi-diff))
    
