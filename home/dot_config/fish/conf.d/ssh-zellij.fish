# Auto-attach to zellij session when connecting via SSH
# - Only triggers for SSH sessions (not local terminal)
# - Prevents nesting (skips if already inside zellij)
# - Attaches to the most recently used session, or creates "remote" if none exist

if set -q SSH_CONNECTION; and not set -q ZELLIJ
    set -l last_session (zellij list-sessions -s -r 2>/dev/null | head -1)
    if test -n "$last_session"
        zellij attach $last_session
    else
        zellij attach --create remote
    end
end
