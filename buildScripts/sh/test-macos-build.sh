#!/bin/bash

# Script to test macOS DMG build locally
# This simulates the CI/CD environment for debugging

set -e

echo "🧹 Cleaning previous builds..."
rm -rf build/ dist/

echo "📦 Installing dependencies..."
pnpm install

echo "🔨 Building application..."
pnpm run build

echo "📦 Packaging for macOS..."
export CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_LINK=""
export CSC_KEY_PASSWORD=""
export DEBUG=electron-builder

pnpm run package

echo ""
echo "✅ Build complete!"
echo ""
echo "📍 DMG location:"
ls -lh build/*.dmg 2>/dev/null || echo "No DMG found"

echo ""
echo "🔍 Checking for quarantine attributes..."
DMG_FILE=$(find build -name "*.dmg" | head -1)
if [ -n "$DMG_FILE" ]; then
    echo "DMG: $DMG_FILE"
    ATTRS=$(xattr "$DMG_FILE" 2>/dev/null || echo "none")
    if [ "$ATTRS" = "none" ] || [ -z "$ATTRS" ]; then
        echo "✅ No quarantine attributes (good!)"
    else
        echo "⚠️  Quarantine attributes found:"
        echo "$ATTRS"
        echo ""
        echo "Removing quarantine attributes..."
        xattr -cr "$DMG_FILE"
        echo "✅ Removed!"
    fi
else
    echo "❌ No DMG file found"
    exit 1
fi

echo ""
echo "📋 Next steps:"
echo "1. Mount the DMG: open '$DMG_FILE'"
echo "2. Drag app to Applications"
echo "3. Right-click app and select 'Open' (first launch only)"
echo ""
echo "To remove quarantine from installed app:"
echo "   xattr -cr '/Applications/Power Platform ToolBox.app'"
