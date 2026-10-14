#!/bin/sh
# emacs-client: connect to the emacs daemon, starting it on first use,
# and open a new frame. Used as the launch command for the
# net.local.emacs-client.desktop run-or-cycle shortcut stub.
exec emacsclient --alternate-editor= --create-frame "$@"
