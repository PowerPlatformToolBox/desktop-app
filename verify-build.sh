#!/bin/bash

echo "Verifying build structure..."
echo ""

# Check main process files
echo "✓ Main Process Files:"
test -f dist/main/index.js && echo "  ✓ main/index.js" || echo "  ✗ main/index.js MISSING"
test -f dist/main/preload.js && echo "  ✓ main/preload.js" || echo "  ✗ main/preload.js MISSING"
test -f dist/main/settings-manager.js && echo "  ✓ main/settings-manager.js" || echo "  ✗ main/settings-manager.js MISSING"
test -f dist/main/tool-manager.js && echo "  ✓ main/tool-manager.js" || echo "  ✗ main/tool-manager.js MISSING"
echo ""

# Check API files
echo "✓ API Files:"
test -f dist/api/toolbox-api.js && echo "  ✓ api/toolbox-api.js" || echo "  ✗ api/toolbox-api.js MISSING"
echo ""

# Check type definitions
echo "✓ Type Definitions:"
test -f dist/types/index.js && echo "  ✓ types/index.js" || echo "  ✗ types/index.js MISSING"
echo ""

# Check renderer files
echo "✓ Renderer Files:"
test -f dist/renderer/index.html && echo "  ✓ renderer/index.html" || echo "  ✗ renderer/index.html MISSING"
test -f dist/renderer/styles.css && echo "  ✓ renderer/styles.css" || echo "  ✗ renderer/styles.css MISSING"
test -f dist/renderer/renderer.js && echo "  ✓ renderer/renderer.js" || echo "  ✗ renderer/renderer.js MISSING"
echo ""

# Check package.json
echo "✓ Configuration:"
test -f package.json && echo "  ✓ package.json" || echo "  ✗ package.json MISSING"
test -f tsconfig.json && echo "  ✓ tsconfig.json" || echo "  ✗ tsconfig.json MISSING"
test -f tsconfig.renderer.json && echo "  ✓ tsconfig.renderer.json" || echo "  ✗ tsconfig.renderer.json MISSING"
echo ""

echo "✓ Build verification complete!"
