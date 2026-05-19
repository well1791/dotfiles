#!/bin/sh
# Install zellij plugins based on plugins.toml manifest
#
# Usage:
#   ./install-plugins.sh [--force]
#
# Options:
#   --force    Redownload even if plugin exists
#
# Environment:
#   ZELLIJ_PLUGIN_DIR    Override plugin directory (default: ~/.config/zellij/plugins)
#   ZELLIJ_CACHE_DIR     Override cache directory (default: ~/.cache/zellij/plugins)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$CONFIG_DIR/plugins.toml"
PLUGIN_DIR="${ZELLIJ_PLUGIN_DIR:-$HOME/.config/zellij/plugins}"
CACHE_DIR="${ZELLIJ_CACHE_DIR:-$HOME/.cache/zellij/plugins}"
TEMP_DIR="/tmp/zellij-plugins-$$"

# Parse arguments
FORCE_DOWNLOAD=false
while [ $# -gt 0 ]; do
    case "$1" in
        --force|-f) FORCE_DOWNLOAD=true ;;
        --help|-h)
            echo "Usage: $0 [--force]"
            echo "Install zellij plugins from manifest"
            echo ""
            echo "Options:"
            echo "  --force    Redownload even if plugin exists"
            echo ""
            echo "Environment:"
            echo "  ZELLIJ_PLUGIN_DIR    Override plugin directory"
            echo "  ZELLIJ_CACHE_DIR     Override cache directory"
            exit 0
            ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done

# Check dependencies
if ! command -v curl >/dev/null 2>&1; then
    echo "${RED}Error: curl is required but not installed${NC}" >&2
    exit 1
fi

if ! command -v file >/dev/null 2>&1; then
    echo "${YELLOW}Warning: 'file' command not found, skipping WASM validation${NC}" >&2
fi

# Check manifest exists
if [ ! -f "$MANIFEST" ]; then
    echo "${RED}Error: Manifest not found: $MANIFEST${NC}" >&2
    exit 1
fi

# Create directories
mkdir -p "$PLUGIN_DIR" "$CACHE_DIR" "$TEMP_DIR"

# Cleanup temp on exit
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

echo "${BLUE}Installing zellij plugins from: $MANIFEST${NC}"
echo "Target directory: $PLUGIN_DIR"
echo ""

# Parse TOML manifest (simple shell parser for our specific structure)
# Extract plugin entries between [[plugin]] markers
parse_manifest() {
    awk '
        /^\[\[plugin\]\]/ { 
            # New plugin block - output previous if complete
            if (name && url && version) {
                printf "%s|%s|%s|%s\n", name, version, url, sha256
            }
            # Reset for new plugin
            name=""; url=""; sha256=""; version=""
            in_plugin=1
            next
        }
        /^\[\[/ { in_plugin=0; next }
        in_plugin && /^name = / { sub(/^name = "/, ""); sub(/"$/, ""); name=$0 }
        in_plugin && /^url = / { sub(/^url = "/, ""); sub(/"$/, ""); url=$0 }
        in_plugin && /^sha256 = / { sub(/^sha256 = "/, ""); sub(/"$/, ""); sha256=$0 }
        in_plugin && /^version = / { sub(/^version = "/, ""); sub(/"$/, ""); version=$0 }
        END {
            # Output last plugin if complete
            if (name && url && version) {
                printf "%s|%s|%s|%s\n", name, version, url, sha256
            }
        }
    ' "$MANIFEST"
}

# Download and verify plugin
download_plugin() {
    local name="$1"
    local version="$2"
    local url="$3"
    local expected_sha256="$4"
    local dest="$PLUGIN_DIR/${name}.wasm"
    local cache="$CACHE_DIR/${name}-${version}.wasm"
    local temp="$TEMP_DIR/${name}.wasm"
    
    echo "${BLUE}  → Downloading $name ($version)...${NC}"
    
    # Try cache first
    if [ -f "$cache" ]; then
        echo "    ${GREEN}✓${NC} Found in cache"
        cp "$cache" "$temp"
    else
        # Download fresh
        echo "    Fetching from: $url"
        if ! curl -fsSL -o "$temp" "$url" 2>/dev/null; then
            echo "    ${RED}✗${NC} Download failed: $url" >&2
            return 1
        fi
        echo "    ${GREEN}✓${NC} Downloaded successfully"
    fi
    
    # Verify it's a WASM file
    if command -v file >/dev/null 2>&1; then
        if ! file "$temp" 2>/dev/null | grep -q "WebAssembly"; then
            echo "    ${RED}✗${NC} Not a valid WASM file" >&2
            rm -f "$temp"
            return 1
        fi
        echo "    ${GREEN}✓${NC} Valid WASM binary"
    fi
    
    # Verify checksum if provided
    if [ -n "$expected_sha256" ]; then
        if command -v sha256sum >/dev/null 2>&1; then
            actual_sha256=$(sha256sum "$temp" | cut -d' ' -f1)
            if [ "$actual_sha256" != "$expected_sha256" ]; then
                echo "    ${RED}✗${NC} Checksum mismatch!" >&2
                echo "      Expected: $expected_sha256" >&2
                echo "      Got:      $actual_sha256" >&2
                rm -f "$temp"
                return 1
            fi
            echo "    ${GREEN}✓${NC} Checksum verified"
        else
            echo "    ${YELLOW}⚠${NC} sha256sum not available, skipping verification"
        fi
    fi
    
    # Install to target location
    mv "$temp" "$dest"
    
    # Cache for future use (only if not already cached)
    if [ ! -f "$cache" ]; then
        cp "$dest" "$cache"
    fi
    
    echo "    ${GREEN}✓${NC} Installed to $dest"
    return 0
}

# Main installation loop
INSTALLED=0
SKIPPED=0
FAILED=0

while IFS='|' read -r name version url sha256; do
    # Skip empty lines
    [ -z "$name" ] && continue
    
    dest="$PLUGIN_DIR/${name}.wasm"
    
    # Check if already installed
    if [ -f "$dest" ] && [ "$FORCE_DOWNLOAD" = false ]; then
        echo "${GREEN}✓${NC} $name ($version) already installed"
        SKIPPED=$((SKIPPED + 1))
        continue
    fi
    
    # Download and install
    if download_plugin "$name" "$version" "$url" "$sha256"; then
        INSTALLED=$((INSTALLED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
    echo ""
done <<EOF
$(parse_manifest)
EOF

# Create symlinks for backward compatibility (~/.zellij/plugins/)
if [ -d "$HOME/.zellij" ] && [ "$INSTALLED" -gt 0 ]; then
    echo "${BLUE}Creating backward compatibility symlinks...${NC}"
    mkdir -p "$HOME/.zellij/plugins"
    for wasm in "$PLUGIN_DIR"/*.wasm; do
        [ -f "$wasm" ] || continue
        basename_file=$(basename "$wasm")
        ln -sf "$wasm" "$HOME/.zellij/plugins/$basename_file"
        echo "  ${GREEN}✓${NC} Linked $basename_file"
    done
    echo ""
fi

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ $INSTALLED -gt 0 ] && echo "${GREEN}✓ Installed: $INSTALLED plugin(s)${NC}"
[ $SKIPPED -gt 0 ] && echo "${GREEN}✓ Skipped: $SKIPPED plugin(s) (already installed)${NC}"
[ $FAILED -gt 0 ] && echo "${RED}✗ Failed: $FAILED plugin(s)${NC}" >&2

if [ $FAILED -eq 0 ]; then
    echo ""
    echo "${GREEN}✓ All plugins ready!${NC}"
    echo "Plugins installed to: $PLUGIN_DIR"
else
    exit 1
fi
