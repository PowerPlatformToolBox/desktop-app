#!/bin/bash
#
# Merge Windows latest.yml Script
# 
# This script generates a merged latest.yml file containing both x64 and ARM64
# Windows installers for electron-updater auto-update functionality.
#
# Usage:
#   ./merge-latest-yml.sh <version> [release-tag]
#
# Examples:
#   # Generate for v1.1.3 (downloads from GitHub release)
#   ./merge-latest-yml.sh 1.1.3 v1.1.3
#
#   # Generate for local files in build/ directory
#   ./merge-latest-yml.sh 1.1.3
#
# The script will:
# 1. Download or locate both x64 and ARM64 Windows EXE files
# 2. Calculate SHA256 and SHA512 hashes
# 3. Generate a merged latest.yml with both architectures
#
# Output: latest.yml (in current directory)
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

echo "=== Windows latest.yml Merger ==="
echo "Version: $VERSION"
echo ""

# Temporary directory for downloads
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# Function to find or download x64 EXE
find_x64_exe() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading x64 installer from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-x64-win.exe"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-x64-win.exe"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download x64 installer from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for x64 installer in build/ directory..." >&2
        local exe=$(find build -name "*-x64-win.exe" -type f 2>/dev/null | head -n 1)
        if [[ -n "$exe" && -f "$exe" ]]; then
            echo "$exe"
        else
            echo "❌ Could not find x64 installer in build/ directory" >&2
            return 1
        fi
    fi
}

# Function to find or download ARM64 EXE
find_arm64_exe() {
    if [[ -n "$RELEASE_TAG" ]]; then
        echo "📥 Downloading ARM64 installer from GitHub release $RELEASE_TAG..." >&2
        local url="https://github.com/PowerPlatformToolBox/desktop-app/releases/download/${RELEASE_TAG}/Power-Platform-ToolBox-${VERSION}-arm64-win.exe"
        local dest="$TEMP_DIR/Power-Platform-ToolBox-${VERSION}-arm64-win.exe"
        
        if curl -sL -f -o "$dest" "$url"; then
            echo "$dest"
        else
            echo "❌ Failed to download ARM64 installer from $url" >&2
            return 1
        fi
    else
        echo "🔍 Looking for ARM64 installer in build/ directory..." >&2
        local exe=$(find build -name "*-arm64-win.exe" -type f 2>/dev/null | head -n 1)
        if [[ -n "$exe" && -f "$exe" ]]; then
            echo "$exe"
        else
            echo "❌ Could not find ARM64 installer in build/ directory" >&2
            return 1
        fi
    fi
}

# Find/download the EXE files
X64_EXE=$(find_x64_exe)
ARM64_EXE=$(find_arm64_exe)

if [[ -z "$X64_EXE" || -z "$ARM64_EXE" ]]; then
    echo "❌ Could not find both installers"
    exit 1
fi

echo ""
echo "✅ Found x64 installer: $(basename "$X64_EXE")"
echo "✅ Found ARM64 installer: $(basename "$ARM64_EXE")"
echo ""

# Calculate hashes for x64
echo "🔐 Calculating hashes for x64 installer..."
X64_SHA256=$(sha256sum "$X64_EXE" | awk '{print $1}')
X64_SHA512=$(sha512sum "$X64_EXE" | awk '{print $1}')
X64_SIZE=$(stat -c %s "$X64_EXE" 2>/dev/null || stat -f %z "$X64_EXE" 2>/dev/null)

echo "  SHA256: $X64_SHA256"
echo "  SHA512: $X64_SHA512"
echo "  Size: $X64_SIZE bytes"
echo ""

# Calculate hashes for ARM64
echo "🔐 Calculating hashes for ARM64 installer..."
ARM64_SHA256=$(sha256sum "$ARM64_EXE" | awk '{print $1}')
ARM64_SHA512=$(sha512sum "$ARM64_EXE" | awk '{print $1}')
ARM64_SIZE=$(stat -c %s "$ARM64_EXE" 2>/dev/null || stat -f %z "$ARM64_EXE" 2>/dev/null)

echo "  SHA256: $ARM64_SHA256"
echo "  SHA512: $ARM64_SHA512"
echo "  Size: $ARM64_SIZE bytes"
echo ""

# Generate release date in ISO 8601 format
RELEASE_DATE=$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')

# Create merged latest.yml
OUTPUT_FILE="latest.yml"

cat > "$OUTPUT_FILE" << EOF
version: $VERSION
files:
  - url: $(basename "$X64_EXE")
    sha512: $X64_SHA512
    sha256: $X64_SHA256
    size: $X64_SIZE
    blockMapSize: null
  - url: $(basename "$ARM64_EXE")
    sha512: $ARM64_SHA512
    sha256: $ARM64_SHA256
    size: $ARM64_SIZE
    blockMapSize: null
releaseDate: $RELEASE_DATE
EOF

echo "✅ Merged latest.yml created successfully!"
echo ""
echo "=== Output: $OUTPUT_FILE ==="
cat "$OUTPUT_FILE"
echo ""
echo "=== Next Steps ==="
echo "1. Review the generated latest.yml file above"
echo "2. Upload it to the GitHub release, replacing the existing latest.yml"
echo ""
echo "To upload to GitHub release manually:"
echo "  gh release upload $RELEASE_TAG $OUTPUT_FILE --clobber"
echo ""
echo "Or use the GitHub web UI:"
echo "  https://github.com/PowerPlatformToolBox/desktop-app/releases/edit/$RELEASE_TAG"
