#!/bin/sh
# Update zellij plugins to latest versions
#
# Checks GitHub releases for each plugin and updates plugins.toml
# with the latest version information.
#
# Usage:
#   ./update-plugins.sh [--check-only] [--plugin NAME] [--dry-run]
#
# Options:
#   --check-only       Only check for updates, don't modify manifest
#   --plugin NAME      Update only specified plugin
#   --dry-run          Show what would be updated

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_DIR="$(dirname "$SCRIPT_DIR")"
MANIFEST="$CONFIG_DIR/plugins.toml"

# Parse arguments
CHECK_ONLY=false
DRY_RUN=false
TARGET_PLUGIN=""

while [ $# -gt 0 ]; do
    case "$1" in
        --check-only) CHECK_ONLY=true ;;
        --dry-run) DRY_RUN=true ;;
        --plugin) TARGET_PLUGIN="$2"; shift ;;
        --help|-h)
            echo "Usage: $0 [--check-only] [--plugin NAME] [--dry-run]"
            echo "Update zellij plugins to latest versions"
            echo ""
            echo "Options:"
            echo "  --check-only       Only check for updates, don't modify manifest"
            echo "  --plugin NAME      Update only specified plugin"
            echo "  --dry-run          Show what would be updated"
            exit 0
            ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
    esac
    shift
done

# Check dependencies
if ! command -v curl >/dev/null 2>&1; then
    echo "${RED}Error: curl required${NC}" >&2
    exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
    echo "${RED}Error: jq required for parsing GitHub API responses${NC}" >&2
    echo "Install with: ${BLUE}sudo pacman -S jq${NC}" >&2
    exit 1
fi

# Fetch latest release info from GitHub
get_latest_release() {
    local repo="$1"
    local api_url="https://api.github.com/repos/$repo/releases/latest"
    
    # Fetch release info
    if ! response=$(curl -fsSL "$api_url" 2>/dev/null); then
        echo "" # Return empty on error
        return 1
    fi
    
    # Parse tag_name
    echo "$response" | jq -r '.tag_name // empty'
}

# Generate SHA256 for a URL
download_and_hash() {
    local url="$1"
    local temp="/tmp/plugin-hash-$$.wasm"
    
    if ! curl -fsSL -o "$temp" "$url" 2>/dev/null; then
        echo ""
        rm -f "$temp"
        return 1
    fi
    
    local hash
    if command -v sha256sum >/dev/null 2>&1; then
        hash=$(sha256sum "$temp" | cut -d' ' -f1)
    else
        echo ""
        rm -f "$temp"
        return 1
    fi
    
    rm -f "$temp"
    echo "$hash"
}

echo "${BLUE}Checking for plugin updates...${NC}"
echo ""

# Parse manifest and check each plugin
parse_manifest() {
    awk '
        /^\[\[plugin\]\]/ { 
            # New plugin block - output previous if complete
            if (name && repo && version && url) {
                printf "%s|%s|%s|%s\n", name, repo, version, url
            }
            # Reset for new plugin
            name=""; repo=""; version=""; url=""
            in_plugin=1
            next
        }
        /^\[\[/ { in_plugin=0; next }
        in_plugin && /^name = / { sub(/^name = "/, ""); sub(/"$/, ""); name=$0 }
        in_plugin && /^repo = / { sub(/^repo = "/, ""); sub(/"$/, ""); repo=$0 }
        in_plugin && /^url = / { sub(/^url = "/, ""); sub(/"$/, ""); url=$0 }
        in_plugin && /^version = / { sub(/^version = "/, ""); sub(/"$/, ""); version=$0 }
        END {
            # Output last plugin if complete
            if (name && repo && version && url) {
                printf "%s|%s|%s|%s\n", name, repo, version, url
            }
        }
    ' "$MANIFEST"
}

UPDATES_AVAILABLE=0

while IFS='|' read -r name repo current_version current_url; do
    [ -z "$name" ] && continue
    
    # Skip if specific plugin requested and this isn't it
    if [ -n "$TARGET_PLUGIN" ] && [ "$name" != "$TARGET_PLUGIN" ]; then
        continue
    fi
    
    echo "${BLUE}Checking $name...${NC}"
    echo "  Current: ${YELLOW}$current_version${NC}"
    
    # Fetch latest version
    latest_version=$(get_latest_release "$repo")
    
    if [ -z "$latest_version" ]; then
        echo "  ${RED}⚠${NC} Could not fetch latest version from $repo"
        echo ""
        continue
    fi
    
    echo "  Latest:  ${GREEN}$latest_version${NC}"
    
    # Compare versions
    if [ "$current_version" = "$latest_version" ]; then
        echo "  ${GREEN}✓${NC} Up to date"
    else
        echo "  ${YELLOW}→${NC} Update available: $current_version → $latest_version"
        UPDATES_AVAILABLE=$((UPDATES_AVAILABLE + 1))
        
        # Construct new URL (assuming same pattern)
        new_url=$(echo "$current_url" | sed "s|$current_version|$latest_version|")
        
        if [ "$CHECK_ONLY" = false ] && [ "$DRY_RUN" = false ]; then
            echo "    Fetching new binary for hash calculation..."
            new_hash=$(download_and_hash "$new_url")
            
            if [ -n "$new_hash" ]; then
                echo "    New SHA256: ${BLUE}$new_hash${NC}"
                
                # Update manifest using sed
                # Create backup
                cp "$MANIFEST" "$MANIFEST.bak"
                
                # Update version, url, and sha256 for this plugin
                # This is a simplified approach - finds the plugin block and updates fields
                awk -v name="$name" -v new_version="$latest_version" -v new_url="$new_url" -v new_hash="$new_hash" '
                    /^\[\[plugin\]\]/ { 
                        in_plugin=1
                        current_plugin=""
                        print
                        next
                    }
                    /^\[\[/ { 
                        in_plugin=0 
                        current_plugin=""
                    }
                    in_plugin && /^name = / {
                        sub(/^name = "/, "")
                        sub(/"$/, "")
                        current_plugin=$0
                        print "name = \"" current_plugin "\""
                        next
                    }
                    in_plugin && current_plugin == name && /^version = / {
                        print "version = \"" new_version "\""
                        next
                    }
                    in_plugin && current_plugin == name && /^url = / {
                        print "url = \"" new_url "\""
                        next
                    }
                    in_plugin && current_plugin == name && /^sha256 = / {
                        print "sha256 = \"" new_hash "\""
                        next
                    }
                    { print }
                ' "$MANIFEST.bak" > "$MANIFEST"
                
                echo "    ${GREEN}✓${NC} Updated manifest"
            else
                echo "    ${RED}✗${NC} Could not download new version for verification"
            fi
        elif [ "$DRY_RUN" = true ]; then
            echo "    ${YELLOW}[DRY RUN]${NC} Would update to: $new_url"
        fi
    fi
    
    echo ""
done <<EOF
$(parse_manifest)
EOF

# Summary
if [ $UPDATES_AVAILABLE -eq 0 ]; then
    echo "${GREEN}✓ All plugins are up to date${NC}"
    exit 0
elif [ "$CHECK_ONLY" = true ]; then
    echo "${YELLOW}⚠ $UPDATES_AVAILABLE update(s) available${NC}"
    echo "  Run without --check-only to update manifest"
    exit 0
elif [ "$DRY_RUN" = true ]; then
    echo "${YELLOW}⚠ $UPDATES_AVAILABLE update(s) available (dry-run, no changes made)${NC}"
    exit 0
else
    echo "${GREEN}✓ Updated $UPDATES_AVAILABLE plugin(s) in manifest${NC}"
    echo "  Review changes: ${BLUE}git diff $MANIFEST${NC}"
    echo "  Install updates: ${BLUE}./scripts/install-plugins.sh --force${NC}"
    exit 0
fi
