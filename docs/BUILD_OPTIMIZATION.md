# Build Optimization Guide

This document describes the build optimizations and analysis tools available in PowerPlatform ToolBox.

## Bundle Analysis

The project includes bundle analysis to help visualize and optimize the size of compiled bundles.

### How to Use

After running a production build with `npm run build`, two HTML reports are generated:

-   **`dist/stats-main.html`** - Bundle analysis for the main Electron process
-   **`dist/stats-renderer.html`** - Bundle analysis for the renderer process

These reports show:

-   Module sizes (original, minified, gzipped, and brotli compressed)
-   Dependency tree visualization
-   Largest modules and dependencies
-   Import/export relationships

### Opening the Reports

Simply open the HTML files in a web browser:

```bash
# On macOS
open dist/stats-main.html

# On Linux
xdg-open dist/stats-main.html

# On Windows
start dist/stats-main.html
```

Or navigate to the `dist/` directory and double-click the files.

### Interpreting the Results

-   **Treemap View**: Shows a visual representation where larger rectangles represent larger modules
-   **Sunburst View**: Displays a circular hierarchical view of dependencies
-   **Network View**: Shows module relationships as a network graph

Use these visualizations to:

-   Identify large dependencies that could be replaced or lazy-loaded
-   Find duplicate dependencies that could be deduplicated
-   Spot opportunities for code splitting
-   Verify that tree-shaking is working correctly

## Code Splitting

The renderer process is configured with automatic code splitting to improve load times and caching.

### Current Configuration

-   **Vendor Chunk**: All `node_modules` dependencies are split into a separate `vendor` chunk
-   **Manual Chunks**: Additional chunks can be configured in `vite.config.ts`

### Benefits

-   Smaller initial bundle size
-   Better browser caching (vendor code changes less frequently)
-   Parallel loading of chunks
-   Faster rebuilds during development

### Customizing Code Splitting

Edit the `manualChunks` configuration in `vite.config.ts`:

```typescript
output: {
    manualChunks: (id) => {
        // Split vendor dependencies
        if (id.includes("node_modules")) {
            return "vendor";
        }
        // Add custom chunks here
        // Example: Split a specific library
        // if (id.includes("some-large-library")) {
        //     return "library-chunk";
        // }
    },
},
```

## CSS Preprocessing with SCSS

The project now uses Sass/SCSS for better stylesheet organization and maintainability.

### Project Structure

The main stylesheet has been migrated to SCSS with a modular organization:

```
src/renderer/
├── styles.scss              # Main stylesheet (imports partials)
├── styles/
│   ├── _variables.scss      # SCSS variables (colors, spacing, etc.)
│   └── _mixins.scss         # Reusable SCSS mixins
└── example.scss             # Example SCSS file for reference
```

### Using SCSS Features

The project now leverages SCSS features like:

**Variables** (defined in `_variables.scss`):
```scss
$primary-color: #0078d4;
$font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
$spacing-md: 16px;
```

**Mixins** (defined in `_mixins.scss`):
```scss
@use './styles/variables' as *;
@use './styles/mixins' as *;

.my-component {
    @include flex-center;
    padding: $spacing-md;
    font-family: $font-family;
}
```

**Nesting**:
```scss
.button {
    background: $primary-color;
    
    &:hover {
        background: $primary-hover;
    }
    
    &.disabled {
        opacity: 0.5;
    }
}
```

### Adding New Styles

1. **Modify existing files**: Edit `styles.scss` or create new partial files in `styles/`
2. **Create new partials**: Name with underscore prefix (e.g., `_components.scss`)
3. **Import partials**: Add `@use './styles/components' as *;` in `styles.scss`
4. **Use variables and mixins**: Access shared styles across your SCSS files

### Global SCSS Variables

Configure global variables/mixins in `vite.config.ts`:

```typescript
css: {
    preprocessorOptions: {
        scss: {
            additionalData: `@import "@/styles/variables.scss";`
        },
    },
},
```

### Supported Preprocessors

Vite supports the following CSS preprocessors without additional configuration:

-   **Sass/SCSS** (.scss, .sass)
-   **Less** (.less)
-   **Stylus** (.styl, .stylus)
-   **PostCSS** (via postcss.config.js)

Just install the preprocessor you need:

```bash
# For Less
npm install --save-dev less

# For Stylus
npm install --save-dev stylus

# For PostCSS plugins
npm install --save-dev postcss autoprefixer
```

## ES Module Migration

The codebase has been fully migrated to ES modules (ESM) for better compatibility and performance.

### Benefits of ESM

-   **Better tree-shaking**: Unused exports are eliminated during bundling
-   **Static analysis**: Better type checking and IDE support
-   **Future-proof**: ESM is the standard module system for JavaScript
-   **Improved performance**: Faster module resolution and loading

### Migration Details

All CommonJS `require()` calls have been replaced with ES6 `import` statements:

**Before:**

```typescript
// CommonJS
const { spawn } = require("child_process");
```

**After:**

```typescript
// ES Module
import { spawn } from "child_process";
```

### Current Module Configuration

-   **Main Process**: Uses `Node16` module system (TypeScript config)
-   **Renderer Process**: Uses `ES2022` module system with bundler resolution
-   **API/Types**: Uses `Node16` module system for compatibility

### Adding New Dependencies

When adding new dependencies, prefer packages that support ESM:

```typescript
// Good - ESM import
import somePackage from "some-package";

// Avoid when possible - CommonJS
const somePackage = require("some-package");
```

## Performance Tips

### 1. Minimize Bundle Size

-   Use bundle analysis to identify large dependencies
-   Consider replacing large libraries with smaller alternatives
-   Use dynamic imports for infrequently used code

### 2. Optimize Images and Assets

-   Use appropriate image formats (WebP, AVIF)
-   Compress images before including them
-   Consider lazy-loading images

### 3. Tree-Shaking

-   Import only what you need from libraries
-   Avoid barrel exports (index.js files that re-export everything)
-   Use named imports instead of default imports when possible

```typescript
// Good - tree-shakeable
import { specific, functions } from "library";

// Less optimal - may include unused code
import * as library from "library";
```

### 4. Code Splitting Strategies

-   Split routes/views in renderer process
-   Lazy-load heavy features
-   Split by feature or domain

## CI/CD Bundle Size Tracking

The project includes automated bundle size tracking in the CI/CD pipeline to prevent bundle bloat.

### GitHub Actions Workflow

The `bundle-size.yml` workflow runs on:
-   **Pull Requests** to `main` or `develop` branches
-   **Pushes** to `main` or `develop` branches

### What It Does

1. **Builds the project** in CI environment
2. **Analyzes bundle sizes** for all output files
3. **Generates a report** in the workflow summary
4. **Comments on PRs** with bundle size comparison
5. **Uploads bundle analysis** reports as artifacts
6. **Checks size limits** and warns if exceeded

### Viewing Reports

**In Pull Requests:**
- The workflow automatically comments with bundle sizes
- Download artifacts from the "Actions" tab to view detailed analysis

**In Workflow Runs:**
- Go to Actions → Bundle Size Tracking
- View the summary for a quick size report
- Download artifacts for detailed HTML reports

### Size Limits

Current limits configured:
-   **Main Process**: 1 MB (warning if exceeded)
-   More limits can be added as needed

### Adding Custom Checks

Edit `.github/workflows/bundle-size.yml` to:
-   Add more size limit checks
-   Compare with previous builds
-   Set up notifications
-   Fail builds on size regressions

Example:
```yaml
- name: Check bundle size limits
  run: |
    RENDERER_SIZE=${{ steps.analyze.outputs.renderer_js_size }}
    RENDERER_LIMIT=524288  # 512 KB limit
    
    if [ "$RENDERER_SIZE" -gt "$RENDERER_LIMIT" ]; then
      echo "::error::Renderer bundle exceeds 512 KB limit!"
      exit 1
    fi
```

## Build Configuration Reference

### Vite Configuration Files

-   **`vite.config.ts`** - Main Vite configuration
-   **`tsconfig.json`** - TypeScript configuration for main process
-   **`tsconfig.renderer.json`** - TypeScript configuration for renderer

### Build Scripts

-   **`npm run build`** - Production build with optimizations
-   **`npm run dev`** - Development build with HMR
-   **`npm run watch`** - Watch mode for continuous builds

### Environment Variables

Set these in your build environment to customize behavior:

-   **`NODE_ENV`** - Set to `production` for optimizations
-   **`VITE_*`** - Custom environment variables (accessible in renderer)

## Troubleshooting

### Bundle Analysis Reports Not Generated

If the stats files aren't created:

1. Check that `rollup-plugin-visualizer` is installed
2. Verify the plugin configuration in `vite.config.ts`
3. Ensure the build completes successfully

### Build Size Issues

If bundles are larger than expected:

1. Check the bundle analysis reports
2. Look for duplicate dependencies
3. Verify tree-shaking is working
4. Check for large assets being bundled

### CSS Preprocessing Errors

If SCSS/Sass compilation fails:

1. Verify `sass` is installed: `npm list sass`
2. Check for syntax errors in .scss files
3. Ensure import paths are correct

## Further Reading

-   [Vite Guide](https://vitejs.dev/guide/)
-   [Rollup Plugin Visualizer](https://github.com/btd/rollup-plugin-visualizer)
-   [Vite Code Splitting](https://vitejs.dev/guide/build.html#chunking-strategy)
-   [ES Modules Specification](https://tc39.es/ecma262/#sec-modules)
