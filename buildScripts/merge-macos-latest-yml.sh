#!/bin/bash
#
# Merge macOS latest-mac.yml Script
# 
# This script generates a merged latest-mac.yml file containing both x64 and ARM64
# macOS installers for electron-updater auto-update functionality.
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
# 1. Download or locate both x64 and ARM64 macOS DMG files
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

# Function to find or download x64 DMG
find_x64_dmg() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading x64 DMG from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-x64-mac.dmg"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-x64-mac.dmg"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download x64 DMG from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for x64 DMG in build/ directory..." >&2
        local dmg=$(find build -name "*-x64-mac.dmg" -type f 2>/dev/null | head -n 1)
        if [[ -n "$dmg" && -f "$dmg" ]]; then
            echo "$dmg"
        else
            echo "❌ Could not find x64 DMG in build/ directory" >&2
            return 1
        fi
    fi
}

# Function to find or download ARM64 DMG
find_arm64_dmg() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading ARM64 DMG from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-arm64-mac.dmg"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-arm64-mac.dmg"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download ARM64 DMG from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for ARM64 DMG in build/ directory..." >&2
        local dmg=$(find build -name "*-arm64-mac.dmg" -type f 2>/dev/null | head -n 1)
        if [[ -n "$dmg" && -f "$dmg" ]]; then
            echo "$dmg"
        else
            echo "❌ Could not find ARM64 DMG in build/ directory" >&2
            return 1
        fi
    fi
}

# Find/download the DMG files
X64_DMG=$(find_x64_dmg)
ARM64_DMG=$(find_arm64_dmg)

if [[ -z "$X64_DMG" || -z "$ARM64_DMG" ]]; then
    echo "❌ Could not find both DMG files"
    exit 1
fi

echo ""
echo "✅ Found x64 DMG: $(basename "$X64_DMG")"
echo "✅ Found ARM64 DMG: $(basename "$ARM64_DMG")"
echo ""

# Calculate hashes for x64
echo "🔐 Calculating hashes for x64 DMG..."
X64_SHA256=$(shasum -a 256 "$X64_DMG" | awk '{print $1}')
X64_SHA512=$(shasum -a 512 "$X64_DMG" | awk '{print $1}')
# Try macOS stat first, then Linux stat
if stat -f '%z' "$X64_DMG" >/dev/null 2>&1; then
    X64_SIZE=$(stat -f '%z' "$X64_DMG")
else
    X64_SIZE=$(stat -c '%s' "$X64_DMG")
fi

echo "  SHA256: $X64_SHA256"
echo "  SHA512: $X64_SHA512"
echo "  Size: $X64_SIZE bytes"
echo ""

# Calculate hashes for ARM64
echo "🔐 Calculating hashes for ARM64 DMG..."
ARM64_SHA256=$(shasum -a 256 "$ARM64_DMG" | awk '{print $1}')
ARM64_SHA512=$(shasum -a 512 "$ARM64_DMG" | awk '{print $1}')
# Try macOS stat first, then Linux stat
if stat -f '%z' "$ARM64_DMG" >/dev/null 2>&1; then
    ARM64_SIZE=$(stat -f '%z' "$ARM64_DMG")
else
    ARM64_SIZE=$(stat -c '%s' "$ARM64_DMG")
fi

echo "  SHA256: $ARM64_SHA256"
echo "  SHA512: $ARM64_SHA512"
echo "  Size: $ARM64_SIZE bytes"
echo ""

# Generate release date in ISO 8601 format
RELEASE_DATE=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

# Create merged latest-mac.yml
OUTPUT_FILE="latest-mac.yml"

cat > "$OUTPUT_FILE" << EOF
version: $VERSION
files:
  - url: $(basename "$X64_DMG")
    sha512: $X64_SHA512
    sha256: $X64_SHA256
    size: $X64_SIZE
    blockMapSize: null
  - url: $(basename "$ARM64_DMG")
    sha512: $ARM64_SHA512
    sha256: $ARM64_SHA256
    size: $ARM64_SIZE
    blockMapSize: null
releaseDate: $RELEASE_DATE
EOF

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
