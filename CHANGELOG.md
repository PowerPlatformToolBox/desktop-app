# Changelog

## v1.0.6 (2025-11-11)

### Bug Fix - Windows Antivirus False Positive

-   **Fixed antivirus false positive detection in v1.0.5**

    -   Rebuilt `icons/icon.ico` with multiple icon sizes (16, 32, 48, 64, 96, 128, 256)
    -   Previous v1.0.5 icon had only a single 256x256 PNG which triggered false positives
    -   New icon follows Microsoft Windows icon guidelines with proper multi-resolution format
    -   Icon file size increased from 20KB to 154KB to include all required resolutions
    -   This fix addresses Windows Defender and other antivirus software flagging the installer as malicious

-   **Technical Details**
    -   Used ImageMagick to generate properly formatted ICO file from source PNG
    -   Included standard Windows icon sizes for proper display at all resolutions
    -   Follows industry best practices for Electron application icons

## Recent Updates (2025-10-19)

### CSS Organization and CI/CD Improvements

-   **Migrated to SCSS with Modular Organization**

    -   Converted `styles.css` (2,216 lines) to `styles.scss`
    -   Created modular structure with `_variables.scss` and `_mixins.scss`
    -   Implemented SCSS variables for colors, spacing, typography, and z-index
    -   Created reusable mixins for flexbox, cards, buttons, and scrollbars
    -   Utilized SCSS nesting for better code organization
    -   Leveraged modern `@use` syntax (avoiding deprecated `@import`)
    -   Updated `index.html` to reference `styles.scss`

-   **Added CI/CD Bundle Size Tracking**

    -   Created GitHub Actions workflow (`bundle-size.yml`)
    -   Automated bundle size analysis on PRs and pushes
    -   Automatic PR comments with bundle size reports
    -   Bundle analysis artifacts uploaded for detailed review
    -   Configurable size limit checks with warnings
    -   Prevents bundle bloat through continuous monitoring

-   **Documentation**
    -   Updated `docs/BUILD_OPTIMIZATION.md` with SCSS organization guide
    -   Added CI/CD bundle tracking documentation
    -   Included examples for custom size limit checks

## Recent Updates (2025-10-18)

### Build Optimizations and ESM Migration

-   **Added Bundle Analysis**

    -   Integrated `rollup-plugin-visualizer` for bundle size analysis
    -   Generates visual reports for main and renderer processes
    -   Reports show module sizes (gzipped and brotli compressed)
    -   Treemap, sunburst, and network visualizations available
    -   Output files: `dist/stats-main.html` and `dist/stats-renderer.html`

-   **Configured Code Splitting**

    -   Automatic vendor chunk separation for better caching
    -   Manual chunks configuration for custom split points
    -   Improved load times and parallel loading
    -   Better browser caching of vendor dependencies

-   **Added CSS Preprocessing Support**

    -   Integrated Sass/SCSS preprocessor
    -   Configuration for global SCSS variables and mixins
    -   Support for Less, Stylus, and PostCSS out of the box
    -   Preprocessor options configurable in `vite.config.ts`

-   **Full ESM Migration**

    -   Migrated all `require()` calls to ES6 `import` statements
    -   Improved tree-shaking and bundle optimization
    -   Better static analysis and type checking
    -   Future-proof module system aligned with ECMAScript standards
    -   Refactored `child_process` imports in `toolsManager.ts`
    -   Refactored file system imports in `vite.config.ts`

-   **Documentation**
    -   Created comprehensive `docs/BUILD_OPTIMIZATION.md` guide
    -   Updated README.md with bundle analysis instructions
    -   Added troubleshooting and optimization tips

### Build System Migration to Vite

-   **Replaced TypeScript compiler with Vite bundler**

    -   Integrated Vite 7.1 with vite-plugin-electron for optimal Electron support
    -   Created comprehensive `vite.config.ts` with custom plugins
    -   Automatic handling of static assets (icons, JSON, bridge files)
    -   Optimized bundling with tree-shaking and code splitting

-   **Performance Improvements**

    -   Initial build time: ~5-8s → ~3.5s (50% faster)
    -   Incremental builds: ~3-5s → <1s with HMR (80% faster)
    -   Development startup: ~10s → ~3.5s (65% faster)
    -   Hot Module Replacement (HMR) for instant renderer updates

-   **Simplified Build Scripts**

    -   Consolidated multiple npm scripts into single `vite build` command
    -   Removed manual file copying operations
    -   Removed `shx` dependency (no longer needed)

-   **Bug Fixes**

    -   Fixed CSS syntax error (extra closing brace in styles.css line 2186)
    -   Fixed HTML asset paths in bundled output

-   **Documentation Updates**

    -   Updated README.md with Vite development workflow
    -   Updated CONTRIBUTING.md with new build instructions
    -   Created VITE_MIGRATION.md comprehensive migration guide
    -   Updated verify-build.sh to validate Vite output structure

-   **Maintained Compatibility**
    -   TypeScript configs preserved for IDE support
    -   ESLint configuration unchanged
    -   electron-builder packaging works seamlessly
    -   Same dist/ output structure for backward compatibility

## Recent Updates (2025-10-17)

### Documentation Reorganization

-   **Moved all documentation to `docs/` folder**

    -   `ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
    -   `TOOL_DEVELOPMENT.md` → `docs/TOOL_DEVELOPMENT.md`
    -   `TOOL_HOST_ARCHITECTURE.md` → `docs/TOOL_HOST_ARCHITECTURE.md`
    -   `CONTRIBUTING.md` → `CONTRIBUTING.md`

-   **Removed temporary documentation files**

    -   Deleted `IMPLEMENTATION_SUMMARY.md`
    -   Deleted `PROJECT_SUMMARY.md`
    -   Deleted `PR_SUMMARY.md`
    -   Deleted `REQUIREMENTS_CHECKLIST.md`

-   **Updated all documentation references**
    -   Updated `README.md` with new documentation paths
    -   Fixed all internal links to point to `docs/` folder
    -   Added comprehensive branch and PR naming conventions to `CONTRIBUTING.md`

### TypeScript Configuration Updates

-   **Updated root `tsconfig.json`**

    -   Target: ES2022 (from ES2020)
    -   Module: Node16 (from commonjs)
    -   Module Resolution: Node16 (from node)
    -   Added `allowSyntheticDefaultImports` and `isolatedModules`

-   **Updated `tsconfig.renderer.json`**

    -   Target: ES2022 (from ES2020)
    -   Lib: ES2022 + DOM (from ES2020 + DOM)
    -   Module: ES2022 (from inherited commonjs)
    -   Module Resolution: bundler (modern strategy)

-   **Updated `examples/example-tool/tsconfig.json`**
    -   Target: ES2022 (from ES2020)
    -   Module: ES2022 (from ES2020)
    -   Module Resolution: bundler (from node)
    -   Added `allowSyntheticDefaultImports` and `isolatedModules`

### New Framework Examples

Added three new complete example tools demonstrating modern framework integration:

#### React Example (`examples/react-example/`)

-   **Framework**: React 18 with TypeScript
-   **Build Tool**: Vite 6
-   **Features**:
    -   React Hooks (useState, useEffect)
    -   ToolBox API integration
    -   Connection management
    -   Event handling
    -   Modern component architecture
    -   Full TypeScript support

#### Vue Example (`examples/vue-example/`)

-   **Framework**: Vue 3 with Composition API
-   **Build Tool**: Vite 6
-   **Features**:
    -   Composition API with `<script setup>`
    -   ToolBox API integration
    -   Reactive state management
    -   Template syntax with v-if, v-for
    -   Full TypeScript support

#### Svelte Example (`examples/svelte-example/`)

-   **Framework**: Svelte 5 with TypeScript
-   **Build Tool**: Vite 6
-   **Features**:
    -   Reactive programming
    -   ToolBox API integration
    -   Svelte lifecycle hooks
    -   Component-based architecture
    -   Full TypeScript support

All examples include:

-   Complete project setup with package.json
-   Vite configuration for fast development
-   TypeScript configuration
-   README with usage instructions
-   .gitignore for proper version control
-   Integration with ToolBox API (window.toolboxAPI)
-   Connection URL and access token handling
-   Event subscription and handling
-   Interactive UI with notifications

### Documentation Improvements

-   **Updated `ARCHITECTURE.md`**

    -   Added accurate file structure reflecting `src/main/managers/` organization
    -   Added descriptions for all manager modules:
        -   `settingsManager.ts`
        -   `toolsManager.ts`
        -   `authManager.ts` (OAuth with Azure AD)
        -   `autoUpdateManager.ts` (electron-updater integration)
    -   Updated technology stack with versions
    -   Removed "Auto-updates" from future enhancements (already implemented)

-   **Updated `TOOL_DEVELOPMENT.md`**

    -   Added comprehensive section on all example tools
    -   Included framework-specific examples
    -   Updated with locations and package names

-   **Updated `CONTRIBUTING.md`**

    -   Added detailed branch naming conventions:
        -   `feature/` for new features
        -   `fix/` for bug fixes
        -   `docs/` for documentation
        -   `refactor/` for refactoring
        -   `chore/` for maintenance
        -   `test/` for tests
    -   Added Conventional Commits format for commit messages
    -   Added PR title format guidelines
    -   Updated documentation section with all doc file locations

-   **Updated `README.md`**
    -   Fixed all documentation links to point to `docs/` folder
    -   Added section showcasing all framework examples
    -   Updated contributing section with proper link

### Verification

-   ✅ All builds pass (`npm run build`)
-   ✅ All linting passes (`npm run lint`)
-   ✅ All documentation links are valid
-   ✅ File structure is properly organized
-   ✅ TypeScript configurations are modern and correct
-   ✅ electron-updater is properly integrated and documented

### Breaking Changes

None. All changes are non-breaking:

-   Documentation moves don't affect code
-   TypeScript config updates are compatible
-   New examples are additions only

### Migration Notes

If you have bookmarks or links to documentation:

-   Update `ARCHITECTURE.md` → `docs/ARCHITECTURE.md`
-   Update `TOOL_DEVELOPMENT.md` → `docs/TOOL_DEVELOPMENT.md`
-   Update `TOOL_HOST_ARCHITECTURE.md` → `docs/TOOL_HOST_ARCHITECTURE.md`
