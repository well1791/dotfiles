;;; init.el --- minimal meow-based config. -*- lexical-binding: t; -*-

;; ----------------------------------------------------------------------
;; Elpaca bootstrap (official installer recipe, v0.12)
;;   https://github.com/progfolio/elpaca#installer
;; Requires: Emacs >= 27.1, git. Clones into ~/.config/emacs/elpaca/.
;; ----------------------------------------------------------------------
(defvar elpaca-installer-version 0.12)
(defvar elpaca-directory (expand-file-name "elpaca/" user-emacs-directory))
(defvar elpaca-builds-directory (expand-file-name "builds/" elpaca-directory))
(defvar elpaca-sources-directory (expand-file-name "sources/" elpaca-directory))
(defvar elpaca-order '(elpaca :repo "https://github.com/progfolio/elpaca.git"
                              :ref nil :depth 1 :inherit ignore
                              :files (:defaults "elpaca-test.el" (:exclude "extensions"))
                              :build (:not elpaca-activate)))
(let* ((repo  (expand-file-name "elpaca/" elpaca-sources-directory))
       (build (expand-file-name "elpaca/" elpaca-builds-directory))
       (order (cdr elpaca-order))
       (default-directory repo))
  (add-to-list 'load-path (if (file-exists-p build) build repo))
  (unless (file-exists-p repo)
    (make-directory repo t)
    (when (<= emacs-major-version 28) (require 'subr-x))
    (condition-case-unless-debug err
        (if-let* ((buffer (pop-to-buffer-same-window "*elpaca-bootstrap*"))
                  ((zerop (apply #'call-process `("git" nil ,buffer t "clone"
                                                  ,@(when-let* ((depth (plist-get order :depth)))
                                                      (list (format "--depth=%d" depth) "--no-single-branch"))
                                                  ,(plist-get order :repo) ,repo))))
                  ((zerop (call-process "git" nil buffer t "checkout"
                                        (or (plist-get order :ref) "--"))))
                  (emacs (concat invocation-directory invocation-name))
                  ((zerop (call-process emacs nil buffer nil "-Q" "-L" "." "--batch"
                                        "--eval" "(byte-recompile-directory \".\" 0 'force)")))
                  ((require 'elpaca))
                  ((elpaca-generate-autoloads "elpaca" repo)))
            (progn (message "%s" (buffer-string)) (kill-buffer buffer))
          (error "%s" (with-current-buffer buffer (buffer-string))))
      ((error) (warn "%s" err) (delete-directory repo 'recursive))))
  (unless (require 'elpaca-autoloads nil t)
    (require 'elpaca)
    (elpaca-generate-autoloads "elpaca" repo)
    (let ((load-source-file-function nil)) (load "./elpaca-autoloads"))))
(add-hook 'after-init-hook #'elpaca-process-queues)
(elpaca `(,@elpaca-order))

;; Enable `use-package' :ensure integration via elpaca.
(elpaca elpaca-use-package
  (elpaca-use-package-mode))

;; ----------------------------------------------------------------------
;; meow — selection-first modal editing, Helix-style ijkl cluster
;; ----------------------------------------------------------------------
(use-package meow :ensure t
  :config
  (defun my/meow-setup ()
    "Custom meow layout derived from QWERTY.

Navigation cluster (Helix-like):
  i -> up   (meow-prev)
  k -> down (meow-next)
  j -> prev-word-start (meow-back-word)
  l -> next-word       (meow-next-word)

Expand companions track the new directions:
  J -> meow-prev-expand (was next-expand)
  K -> meow-next-expand (was prev-expand)

Relocated (word motions moved to j/l, old keys reused):
  b -> meow-insert  (was meow-back-word)
  e -> meow-right   (was meow-next-word)

Stock QWERTY keys otherwise unchanged, including:
  E -> meow-next-symbol,  L -> meow-right-expand,
  B -> meow-back-symbol,  I -> meow-open-above."
    (setq meow-cheatsheet-layout meow-cheatsheet-layout-qwerty)
    (meow-motion-define-key
     '("i" . meow-prev)
     '("k" . meow-next)
     '("<escape>" . ignore))
    (meow-leader-define-key
     '("1" . meow-digit-argument)
     '("2" . meow-digit-argument)
     '("3" . meow-digit-argument)
     '("4" . meow-digit-argument)
     '("5" . meow-digit-argument)
     '("6" . meow-digit-argument)
     '("7" . meow-digit-argument)
     '("8" . meow-digit-argument)
     '("9" . meow-digit-argument)
     '("0" . meow-digit-argument)
     '("/" . meow-keypad-describe-key)
     '("?" . meow-cheatsheet))
    (meow-normal-define-key
     '("0" . meow-expand-0)  '("9" . meow-expand-9)  '("8" . meow-expand-8)
     '("7" . meow-expand-7)  '("6" . meow-expand-6)  '("5" . meow-expand-5)
     '("4" . meow-expand-4)  '("3" . meow-expand-3)  '("2" . meow-expand-2)
     '("1" . meow-expand-1)  '("-" . negative-argument)
     '(";" . meow-reverse)   '("," . meow-inner-of-thing)
     '("." . meow-bounds-of-thing) '("[" . meow-beginning-of-thing)
     '("]" . meow-end-of-thing)
     '("a" . meow-append)    '("A" . meow-open-below)
     ;; RELOCATED: b now inserts (word-back moved to j)
     '("b" . meow-insert)    '("B" . meow-back-symbol)
     '("c" . meow-change)    '("d" . meow-delete)
     '("D" . meow-backward-delete)
     ;; RELOCATED: e now moves char-right (next-word moved to l);
     ;; E keeps its stock value (meow-next-symbol) -- avoids colliding with L.
     '("e" . meow-right)     '("E" . meow-next-symbol)
     '("f" . meow-find)      '("g" . meow-cancel-selection)
     '("G" . meow-grab)      '("h" . meow-left)
     '("H" . meow-left-expand)
     ;; NAV CLUSTER
     '("i" . meow-prev)      ;; up
     '("I" . meow-open-above)
     '("j" . meow-back-word) ;; prev-word-start (left)
     '("J" . meow-prev-expand)
     '("k" . meow-next)      ;; down
     '("K" . meow-next-expand)
     '("l" . meow-next-word) ;; next-word (right)
     '("L" . meow-right-expand)
     '("m" . meow-join)      '("n" . meow-search)
     '("o" . meow-block)     '("O" . meow-to-block)
     '("p" . meow-yank)      '("q" . meow-quit)
     '("Q" . meow-goto-line) '("r" . meow-replace)
     '("R" . meow-swap-grab) '("s" . meow-kill)
     '("t" . meow-till)      '("u" . meow-undo)
     '("U" . meow-undo-in-selection)
     '("v" . meow-visit)     '("w" . meow-mark-word)
     '("W" . meow-mark-symbol) '("x" . meow-line)
     '("X" . meow-goto-line) '("y" . meow-save)
     '("Y" . meow-sync-grab) '("z" . meow-pop-selection)
     '("'" . repeat)         '("<escape>" . ignore)))
  (my/meow-setup)
  (meow-global-mode 1))

;; ----------------------------------------------------------------------
;; Completion & discoverability
;; ----------------------------------------------------------------------
(use-package vertico :ensure t :config (vertico-mode 1))
(use-package marginalia :ensure t :config (marginalia-mode 1))
(use-package orderless :ensure t
  :config
  (setq completion-styles '(orderless basic)
        completion-category-overrides '((file (styles basic partial-completion)))))
(use-package consult :ensure t
  :config
  (with-eval-after-load 'meow
    (meow-leader-define-key
     '("/" . consult-line)
     '("s" . consult-ripgrep)
     '("b" . consult-buffer)
     '("f" . consult-find))))
(use-package which-key :ensure t :config (which-key-mode 1))

;; ----------------------------------------------------------------------
;; LSP (eglot, built-in since Emacs 29) + flymake
;; ----------------------------------------------------------------------
(use-package eglot :ensure nil      ; built-in on Arch's emacs (>= 29)
  :hook ((typescript-mode js-mode python-mode csharp-mode nix-mode sh-mode) . eglot-ensure)
  :config
  ;; Servers auto-discovered: typescript-language-server, pylsp, OmniSharp,
  ;; nil (nix), bash-language-server.
  (setq eglot-autoshutdown t))

;; ----------------------------------------------------------------------
;; Editor niceties, theme, server
;; ----------------------------------------------------------------------
(setq inhibit-startup-screen t
      ring-bell-function 'ignore
      make-backup-files nil
      auto-save-default nil)
(global-display-line-numbers-mode 1)
(show-paren-mode 1)
(delete-selection-mode 1)

(recentf-mode 1)
(savehist-mode 1)

;; custom-file: ensure its directory exists, then load after elpaca activates.
(setq custom-file (expand-file-name "var/custom.el" user-emacs-directory))
(make-directory (file-name-directory custom-file) t)
(add-hook 'elpaca-after-init-hook (lambda () (load custom-file 'noerror)))

(use-package rose-pine-theme :ensure t
  :config (load-theme 'rose-pine t))

;; Start an embedded server so `emacsclient' connects (a boot daemon is
;; added via systemd in home/dot_config/systemd/user/emacs.service).
(server-start)

;;; init.el ends here
