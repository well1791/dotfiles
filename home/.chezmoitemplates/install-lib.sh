#!/bin/sh
# install-lib.sh - Shared function library for chezmoi installation scripts
# POSIX sh compatible - no bashisms
#
# Usage: Source this file at the top of any chezmoi run_once/run_onchange script:
#   . "${CHEZMOI_SOURCE_DIR}/.chezmoitemplates/install-lib.sh"
#
# Environment variables:
#   DRY_RUN=1    - Log actions instead of executing them
#   VERBOSE=1    - Show additional debug information
#   NO_COLOR=1   - Disable colored/unicode output symbols

# ==============================================================================
# GUARD: Prevent double-sourcing
# ==============================================================================

if [ "${_INSTALL_LIB_LOADED:-}" = "1" ]; then
    return 0 2>/dev/null || true
fi
_INSTALL_LIB_LOADED=1

# ==============================================================================
# MODULE: Core / Initialization
# ==============================================================================

# Cached values (populated by detect_os)
_OS_ID=""
_OS_ID_LIKE=""
_OS_FAMILY=""
_PKG_MANAGER=""

# Auto-initialize on source
_install_lib_init() {
    # Detect OS silently - don't fail if detection fails
    # (some scripts may not need OS info)
    detect_os 2>/dev/null || true
}

# ==============================================================================
# MODULE: Utility
# ==============================================================================

# Check if DRY_RUN mode is active
# Returns: 0 if DRY_RUN is set to 1, 1 otherwise
is_dry_run() {
    [ "${DRY_RUN:-0}" = "1" ]
}

# ==============================================================================
# MODULE: Logging
# ==============================================================================

# Print success message with checkmark symbol
# Usage: log_success "message" ["detail"]
log_success() {
    _msg="$1"
    _detail="${2:-}"
    if [ -n "$_detail" ]; then
        printf '%s %s (%s)\n' "✓" "$_msg" "$_detail"
    else
        printf '%s %s\n' "✓" "$_msg"
    fi
}

# Print warning message with warning symbol
# Usage: log_warn "message"
log_warn() {
    printf '%s %s\n' "⚠" "$1"
}

# Print error message with cross symbol to stderr
# Usage: log_error "message"
log_error() {
    printf '%s %s\n' "✗" "$1" >&2
}

# Print informational message
# Usage: log_info "message"
log_info() {
    printf '%s\n' "$1"
}

# Print tool version if available, or report not found
# Usage: log_version "tool_name"
# Returns: 0 if tool exists and version printed, 1 if not found
log_version() {
    _tool="$1"
    if check_command "$_tool"; then
        _ver=$(get_version "$_tool")
        log_success "$_tool already installed" "$_ver"
        return 0
    fi
    return 1
}

# ==============================================================================
# MODULE: Checks
# ==============================================================================

# Check if a command exists in PATH (silent)
# Usage: check_command "command_name"
# Returns: 0 if exists, 1 if not found
check_command() {
    command -v "$1" >/dev/null 2>&1
}

# Check if a command exists, exit with error if not
# Usage: require_command "command_name" ["error message"]
# Returns: 0 if exists, exits with 1 if not found
require_command() {
    _cmd="$1"
    _msg="${2:-"Error: $_cmd is required but not found"}"
    if ! check_command "$_cmd"; then
        die "$_msg"
    fi
}

# Check if at least one of the given commands exists
# Usage: check_any_command "cmd1" "cmd2" [...]
# Returns: 0 if any exists, 1 if none found
check_any_command() {
    for _cmd in "$@"; do
        if check_command "$_cmd"; then
            return 0
        fi
    done
    return 1
}

# Require at least one of the given commands, exit if none found
# Usage: require_any_command "error message" "cmd1" "cmd2" [...]
# Returns: 0 if any exists, exits with 1 if none found
require_any_command() {
    _msg="$1"
    shift
    for _cmd in "$@"; do
        if check_command "$_cmd"; then
            return 0
        fi
    done
    die "$_msg"
}

# ==============================================================================
# MODULE: Errors
# ==============================================================================

# Print error and exit immediately
# Usage: die "message" [exit_code]
die() {
    log_error "$1"
    exit "${2:-1}"
}

# Assert a shell condition is true, exit if false
# Usage: require "-f /etc/os-release" "Cannot detect OS"
# The condition is evaluated inside [ ... ]
require() {
    _cond="$1"
    _msg="$2"
    if ! eval "[ $_cond ]"; then
        die "$_msg"
    fi
}

# Exit if a shell condition is true (inverse of require)
# Usage: fail_if "-z \"$HOME\"" "HOME not set"
fail_if() {
    _cond="$1"
    _msg="$2"
    if eval "[ $_cond ]"; then
        die "$_msg"
    fi
}

# ==============================================================================
# MODULE: Versions
# ==============================================================================

# Extract version string from command output
# Usage: get_version "command" ["version_flag"]
# Returns: Prints version string (first line), returns 0
#          Returns 1 if command not found
get_version() {
    _cmd="$1"
    _flag="${2:---version}"
    if ! check_command "$_cmd"; then
        return 1
    fi
    "$_cmd" "$_flag" 2>&1 | head -1
}

# ==============================================================================
# MODULE: OS Detection
# ==============================================================================

# Initialize OS detection by loading /etc/os-release
# Populates: _OS_ID, _OS_ID_LIKE, _OS_FAMILY, _PKG_MANAGER
# Usage: detect_os
# Returns: 0 if successful, 1 if cannot detect
detect_os() {
    if [ ! -f /etc/os-release ]; then
        return 1
    fi

    # Source os-release in a subshell-safe way
    _OS_ID=$(. /etc/os-release && printf '%s' "${ID:-}")
    _OS_ID_LIKE=$(. /etc/os-release && printf '%s' "${ID_LIKE:-}")

    # Determine OS family
    case "$_OS_ID" in
        arch|cachyos|manjaro|endeavouros)
            _OS_FAMILY="arch"
            if check_command paru; then
                _PKG_MANAGER="paru"
            else
                _PKG_MANAGER="pacman"
            fi
            ;;
        ubuntu|debian|linuxmint|pop)
            _OS_FAMILY="debian"
            _PKG_MANAGER="apt"
            ;;
        fedora|rhel|centos|rocky|almalinux)
            _OS_FAMILY="rhel"
            _PKG_MANAGER="dnf"
            ;;
        alpine)
            _OS_FAMILY="alpine"
            _PKG_MANAGER="apk"
            ;;
        *)
            # Try ID_LIKE for unknown distros
            case "$_OS_ID_LIKE" in
                *arch*)
                    _OS_FAMILY="arch"
                    if check_command paru; then
                        _PKG_MANAGER="paru"
                    else
                        _PKG_MANAGER="pacman"
                    fi
                    ;;
                *debian*|*ubuntu*)
                    _OS_FAMILY="debian"
                    _PKG_MANAGER="apt"
                    ;;
                *rhel*|*fedora*)
                    _OS_FAMILY="rhel"
                    _PKG_MANAGER="dnf"
                    ;;
                *)
                    _OS_FAMILY="unknown"
                    _PKG_MANAGER=""
                    return 1
                    ;;
            esac
            ;;
    esac

    return 0
}

# Get the OS identifier (e.g., arch, ubuntu, fedora)
# Usage: os_id=$(get_os_id)
# Returns: Prints OS ID string
get_os_id() {
    printf '%s' "$_OS_ID"
}

# Get the OS family (arch, debian, rhel, alpine)
# Usage: family=$(get_os_family)
# Returns: Prints OS family string
get_os_family() {
    printf '%s' "$_OS_FAMILY"
}

# ==============================================================================
# MODULE: Package Management
# ==============================================================================

# Detect the system package manager
# Usage: pm=$(detect_pkg_manager)
# Returns: Prints package manager name (paru, pacman, apt, dnf, apk)
detect_pkg_manager() {
    if [ -z "$_PKG_MANAGER" ]; then
        detect_os || true
    fi
    printf '%s' "$_PKG_MANAGER"
}

# Install packages using the detected system package manager
# Respects DRY_RUN mode
# Usage: install_packages "pkg1" "pkg2" [...]
# Returns: 0 if successful, 1 if failed
install_packages() {
    if [ $# -eq 0 ]; then
        log_error "install_packages: no packages specified"
        return 1
    fi

    _pm=$(detect_pkg_manager)
    if [ -z "$_pm" ]; then
        log_error "Cannot detect package manager for this system"
        return 1
    fi

    if is_dry_run; then
        log_info "[DRY RUN] Would install packages: $*"
        log_info "[DRY RUN] Using package manager: $_pm"
        return 0
    fi

    case "$_pm" in
        paru)
            paru -S --noconfirm --needed "$@"
            ;;
        pacman)
            run_privileged pacman -S --noconfirm --needed "$@"
            ;;
        apt)
            run_privileged apt-get install -y "$@"
            ;;
        dnf)
            run_privileged dnf install -y "$@"
            ;;
        apk)
            run_privileged apk add "$@"
            ;;
        *)
            log_error "Unsupported package manager: $_pm"
            return 1
            ;;
    esac
}

# Update the package manager cache/database
# Respects DRY_RUN mode
# Usage: update_package_cache
# Returns: 0 if successful
update_package_cache() {
    _pm=$(detect_pkg_manager)

    if is_dry_run; then
        log_info "[DRY RUN] Would update package cache ($_pm)"
        return 0
    fi

    case "$_pm" in
        paru)
            paru -Sy
            ;;
        pacman)
            run_privileged pacman -Sy
            ;;
        apt)
            run_privileged apt-get update
            ;;
        dnf)
            run_privileged dnf makecache
            ;;
        apk)
            run_privileged apk update
            ;;
        *)
            log_warn "Cannot update cache: unknown package manager"
            return 1
            ;;
    esac
}

# ==============================================================================
# MODULE: Privileged Operations
# ==============================================================================

# Run a command with sudo, respecting DRY_RUN mode
# Usage: run_privileged command [args...]
# Returns: Exit code of command (or 0 in dry-run)
run_privileged() {
    if is_dry_run; then
        log_info "[DRY RUN] Would run: sudo $*"
        return 0
    fi
    sudo "$@"
}

# ==============================================================================
# MODULE: Download
# ==============================================================================

# Download URL content using curl or wget
# Usage: fetch_url "url" ["output_file"]
#   If output_file is omitted, content is written to stdout
# Returns: 0 if successful, 1 if failed
fetch_url() {
    _url="$1"
    _output="${2:-}"

    if is_dry_run; then
        log_info "[DRY RUN] Would fetch: $_url"
        if [ -n "$_output" ]; then
            log_info "[DRY RUN] Would save to: $_output"
        fi
        return 0
    fi

    if check_command curl; then
        if [ -n "$_output" ]; then
            curl -fsSL "$_url" -o "$_output"
        else
            curl -fsSL "$_url"
        fi
    elif check_command wget; then
        if [ -n "$_output" ]; then
            wget -qO "$_output" "$_url"
        else
            wget -qO- "$_url"
        fi
    else
        die "Neither curl nor wget is available"
    fi
}

# Download and execute an installation script
# Respects DRY_RUN mode
# Usage: download_and_run "url" ["message"]
# Returns: Exit code of executed script (or 0 in dry-run)
download_and_run() {
    _url="$1"
    _msg="${2:-"Downloading and running installer..."}"

    log_info "$_msg"

    if is_dry_run; then
        log_info "[DRY RUN] Would download and execute: $_url"
        return 0
    fi

    if check_command curl; then
        curl -fsSL "$_url" | sh
    elif check_command wget; then
        wget -qO- "$_url" | sh
    else
        die "Neither curl nor wget is available"
    fi
}

# ==============================================================================
# AUTO-INITIALIZATION
# ==============================================================================

_install_lib_init
