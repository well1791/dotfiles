# Auto-attach to zellij "remote" session when connecting via SSH
# - Only triggers for SSH sessions (not local terminal)
# - Prevents nesting (skips if already inside zellij)
# - Creates session if it doesn't exist, attaches if it does

if set -q SSH_CONNECTION; and not set -q ZELLIJ
    zellij attach --create remote
end
