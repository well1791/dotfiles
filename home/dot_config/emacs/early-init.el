;;; early-init.el --- runs before init.el. -*- lexical-binding: t; -*-

;; Disable package.el entirely; elpaca (bootstrapped in init.el) owns packages.
(setq package-enable-at-startup nil)

;; Faster startup: defer GC + frame config until after init.
(setq gc-cons-threshold most-positive-fixnum
      read-process-output-max (* 1024 1024)
      frame-inhibit-implied-resize t)

;;; early-init.el ends here
