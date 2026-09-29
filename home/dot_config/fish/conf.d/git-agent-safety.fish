# Prevent git from opening interactive editors when running under AI agents.
# Without this, git rebase/commit/merge can hang waiting for user input.
# Only activates inside Pi agent-managed sessions.
if set -q PI_CODING_AGENT
    set -x GIT_EDITOR true
    set -x GIT_SEQUENCE_EDITOR true
end
