#!/bin/bash
#
# Merge macOS latest-mac.yml Script
# 
# This script generates a merged latest-mac.yml file containing both x64 and ARM64
# macOS ZIP artifacts for electron-updater auto-update functionality.
#
# Usage:
#   ./merge-macos-latest-yml.sh <version> [release-tag]
#
# Examples:
#   # Generate for v1.1.3 (downloads from GitHub release)
#   ./merge-macos-latest-yml.sh 1.1.3 v1.1.3
#
#   # Generate for local files in build/ directory
#   ./merge-macos-latest-yml.sh 1.1.3
#
# The script will:
# 1. Download or locate both x64 and ARM64 macOS ZIP files
# 2. Calculate SHA256 and SHA512 hashes
# 3. Generate a merged latest-mac.yml with both architectures
#
# Output: latest-mac.yml (in current directory)
#

set -e

VERSION="${1}"
RELEASE_TAG="${2}"

if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 <version> [release-tag]"
    echo ""
    echo "Examples:"
    echo "  $0 1.1.3 v1.1.3     # Download from GitHub release"
    echo "  $0 1.1.3            # Use local files from build/ directory"
    exit 1
fi

echo "=== macOS latest-mac.yml Merger ==="
echo "Version: $VERSION"
echo ""

# Temporary directory for downloads
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Function to find or download x64 ZIP
find_x64_zip() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading x64 ZIP from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-x64-mac.zip"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-x64-mac.zip"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download x64 ZIP from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for x64 ZIP in build/ directory..." >&2
        local zip=$(find build -name "*-x64-mac.zip" -type f 2>/dev/null | head -n 1)
        if [[ -n "$zip" && -f "$zip" ]]; then
            echo "$zip"
        else
            echo "❌ Could not find x64 ZIP in build/ directory" >&2
            return 1
        fi
    fi
}

# Function to find or download ARM64 ZIP
find_arm64_zip() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading ARM64 ZIP from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-arm64-mac.zip"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-arm64-mac.zip"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download ARM64 ZIP from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for ARM64 ZIP in build/ directory..." >&2
        local zip=$(find build -name "*-arm64-mac.zip" -type f 2>/dev/null | head -n 1)
        if [[ -n "$zip" && -f "$zip" ]]; then
            echo "$zip"
        else
            echo "❌ Could not find ARM64 ZIP in build/ directory" >&2
            return 1
        fi
    fi
}

# Find/download the ZIP files
X64_ZIP=$(find_x64_zip)
ARM64_ZIP=$(find_arm64_zip)

if [[ -z "$X64_ZIP" || -z "$ARM64_ZIP" ]]; then
    echo "❌ Could not find both ZIP files"
    exit 1
fi

echo ""
echo "✅ Found x64 ZIP: $(basename "$X64_ZIP")"
echo "✅ Found ARM64 ZIP: $(basename "$ARM64_ZIP")"
echo ""

# Calculate hashes for x64
echo "🔐 Calculating hashes for x64 ZIP..."
X64_SHA256=$(shasum -a 256 "$X64_ZIP" | awk '{print $1}')
X64_SHA512=$(shasum -a 512 "$X64_ZIP" | awk '{print $1}')
# Try macOS stat first, then Linux stat
if stat -f '%z' "$X64_ZIP" >/dev/null 2>&1; then
    X64_SIZE=$(stat -f '%z' "$X64_ZIP")
else
    X64_SIZE=$(stat -c '%s' "$X64_ZIP")
fi

echo "  SHA256: $X64_SHA256"
echo "  SHA512: $X64_SHA512"
echo "  Size: $X64_SIZE bytes"
echo ""

# Calculate hashes for ARM64
echo "🔐 Calculating hashes for ARM64 ZIP..."
ARM64_SHA256=$(shasum -a 256 "$ARM64_ZIP" | awk '{print $1}')
ARM64_SHA512=$(shasum -a 512 "$ARM64_ZIP" | awk '{print $1}')
# Try macOS stat first, then Linux stat
if stat -f '%z' "$ARM64_ZIP" >/dev/null 2>&1; then
    ARM64_SIZE=$(stat -f '%z' "$ARM64_ZIP")
else
    ARM64_SIZE=$(stat -c '%s' "$ARM64_ZIP")
fi

echo "  SHA256: $ARM64_SHA256"
echo "  SHA512: $ARM64_SHA512"
echo "  Size: $ARM64_SIZE bytes"
echo ""

# Generate release date in ISO 8601 format
RELEASE_DATE=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

# Create merged latest-mac.yml
OUTPUT_FILE="latest-mac.yml"

printf "version: %s\nfiles:\n  - url: %s\n    sha512: %s\n    sha256: %s\n    size: %s\n    blockMapSize: null\n  - url: %s\n    sha512: %s\n    sha256: %s\n    size: %s\n    blockMapSize: null\nreleaseDate: %s\n" \
    "$VERSION" \
    "$(basename "$X64_ZIP")" \
    "$X64_SHA512" \
    "$X64_SHA256" \
    "$X64_SIZE" \
    "$(basename "$ARM64_ZIP")" \
    "$ARM64_SHA512" \
    "$ARM64_SHA256" \
    "$ARM64_SIZE" \
    "$RELEASE_DATE" > "$OUTPUT_FILE"

echo "✅ Merged latest-mac.yml created successfully!"
echo ""
echo "=== Output: $OUTPUT_FILE ==="
cat "$OUTPUT_FILE"
echo ""
echo "=== Next Steps ==="
echo "1. Review the generated latest-mac.yml file above"
echo "2. Upload it to the GitHub release, replacing the existing latest-mac.yml"
echo ""
echo "To upload to GitHub release manually:"
echo "  gh release upload $RELEASE_TAG $OUTPUT_FILE --clobber"
echo ""
echo "Or use the GitHub web UI:"
echo "  https://github.com/PowerPlatformToolBox/desktop-app/releases/edit/$RELEASE_TAG"
