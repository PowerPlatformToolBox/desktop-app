#!/bin/bash

echo "Verifying Vite build structure..."
echo ""

# Check main process files (bundled by Vite)
echo "✓ Main Process Files (Vite bundled):"
test -f dist/main/index.js && echo "  ✓ main/index.js (bundled)" || echo "  ✗ main/index.js MISSING"
test -f dist/main/preload.js && echo "  ✓ main/preload.js (bundled)" || echo "  ✗ main/preload.js MISSING"
echo ""

# Check renderer files (bundled by Vite)
echo "✓ Renderer Files (Vite bundled):"
test -f dist/renderer/index.html && echo "  ✓ renderer/index.html" || echo "  ✗ renderer/index.html MISSING"
test -d dist/renderer/assets && echo "  ✓ renderer/assets/ (CSS & JS bundles)" || echo "  ✗ renderer/assets/ MISSING"
test -f dist/renderer/toolboxAPIBridge.js && echo "  ✓ renderer/toolboxAPIBridge.js" || echo "  ✗ renderer/toolboxAPIBridge.js MISSING"
test -f dist/renderer/tools.json && echo "  ✓ renderer/tools.json" || echo "  ✗ renderer/tools.json MISSING"
echo ""

# Check static assets
echo "✓ Static Assets:"
test -d dist/renderer/icons && echo "  ✓ renderer/icons/" || echo "  ✗ renderer/icons/ MISSING"
test -f dist/renderer/icons/dark/tools.svg && echo "  ✓ icons/dark/tools.svg" || echo "  ✗ icons/dark/tools.svg MISSING"
test -f dist/renderer/icons/dark/connections.svg && echo "  ✓ icons/dark/connections.svg" || echo "  ✗ icons/dark/connections.svg MISSING"
test -f dist/renderer/icons/dark/marketplace.svg && echo "  ✓ icons/dark/marketplace.svg" || echo "  ✗ icons/dark/marketplace.svg MISSING"
test -f dist/renderer/icons/dark/settings.svg && echo "  ✓ icons/dark/settings.svg" || echo "  ✗ icons/dark/settings.svg MISSING"
echo ""

# Check configuration files
echo "✓ Configuration:"
test -f package.json && echo "  ✓ package.json" || echo "  ✗ package.json MISSING"
test -f vite.config.ts && echo "  ✓ vite.config.ts" || echo "  ✗ vite.config.ts MISSING"
test -f tsconfig.json && echo "  ✓ tsconfig.json (IDE support)" || echo "  ✗ tsconfig.json MISSING"
test -f tsconfig.renderer.json && echo "  ✓ tsconfig.renderer.json (IDE support)" || echo "  ✗ tsconfig.renderer.json MISSING"
echo ""

# Summary
echo "----------------------------------------"
echo "Build verification complete!"
echo ""
echo "Note: With Vite, all TypeScript files are bundled into optimized"
echo "JavaScript bundles in dist/main/ and dist/renderer/assets/"
echo "Individual .js files for managers, API, and types are no longer"
echo "generated separately - they're included in the main bundles."
