# Tool Registry Guide

This guide explains how the Power Platform Tool Box registry system works and how to package and publish tools to the registry.

## Table of Contents

- [Overview](#overview)
- [Registry Architecture](#registry-architecture)
- [Packaging Tools for the Registry](#packaging-tools-for-the-registry)
- [Registry JSON Format](#registry-json-format)
- [Publishing Tools](#publishing-tools)
- [Tool Package Requirements](#tool-package-requirements)
- [Best Practices](#best-practices)

## Overview

The Power Platform Tool Box uses a VS Code extension-style registry architecture where tools are:

1. **Pre-built** and packaged as tar.gz archives
2. **Hosted** on a web server or CDN
3. **Downloaded** directly by the ToolBox application
4. **Cached** locally for fast access

**No npm/pnpm Required:** Users don't need any package managers installed. Tools are downloaded as ready-to-run bundles.

## Registry Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Registry Server                            │
│  (GitHub Pages, CDN, or any HTTP server)                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  registry.json                                       │    │
│  │  - List of all available tools                      │    │
│  │  - Tool metadata                                     │    │
│  │  - Download URLs                                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Tools (tar.gz archives)                            │    │
│  │  - tool-name-1.0.0.tar.gz                           │    │
│  │  - another-tool-2.0.0.tar.gz                        │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
                            ▼
        ┌───────────────────────────────────────┐
        │   Power Platform Tool Box              │
        │   - Fetches registry.json             │
        │   - Downloads selected tools          │
        │   - Extracts and caches locally       │
        └───────────────────────────────────────┘
```

## Packaging Tools for the Registry

### Step 1: Develop Your Tool

Follow the standard [Tool Development Guide](./TOOL_DEVELOPMENT.md) to create your tool with:

- `package.json` with proper metadata
- HTML/CSS/JavaScript files
- Any assets (icons, images, etc.)

### Step 2: Build Your Tool (Optional)

If your tool uses TypeScript, React, or other build tools:

```bash
# Build your tool
npm run build

# Or if using TypeScript
tsc

# The output should be in a dist/ or build/ folder
```

### Step 3: Package Your Tool

Create a tar.gz archive of your tool:

```bash
# Navigate to your tool directory
cd my-tool

# Create a tar.gz archive
tar -czf my-tool-1.0.0.tar.gz package.json index.html *.js *.css assets/

# Or include everything except node_modules and build artifacts
tar -czf my-tool-1.0.0.tar.gz \
  --exclude=node_modules \
  --exclude=.git \
  --exclude=*.log \
  --exclude=.DS_Store \
  .
```

**Important:** The archive should contain:
- `package.json` (required)
- HTML entry point (e.g., `index.html`)
- All JavaScript, CSS, and asset files
- **NO** `node_modules` folder
- **NO** build artifacts or source files (unless needed)

### Step 4: Host Your Tool

Upload the tar.gz file to:
- **GitHub Releases** (recommended)
- **CDN** (Cloudflare, AWS S3, etc.)
- **Web Server** (any HTTP/HTTPS server)

Example using GitHub Releases:

```bash
# Create a release on GitHub
gh release create v1.0.0 my-tool-1.0.0.tar.gz \
  --title "My Tool v1.0.0" \
  --notes "Initial release"
```

The download URL will be:
```
https://github.com/username/my-tool/releases/download/v1.0.0/my-tool-1.0.0.tar.gz
```

### Step 5: Add to Registry

Update the registry.json file with your tool's information (see [Registry JSON Format](#registry-json-format) below).

## Registry JSON Format

The registry is a JSON file hosted at a public URL. Default:
```
https://raw.githubusercontent.com/PowerPlatformToolBox/tool-registry/main/registry.json
```

### Registry Structure

```json
{
  "version": "1.0",
  "updatedAt": "2024-01-15T10:00:00Z",
  "tools": [
    {
      "id": "my-tool",
      "name": "My Awesome Tool",
      "description": "A tool that does amazing things",
      "author": "Your Name",
      "version": "1.0.0",
      "downloadUrl": "https://example.com/my-tool-1.0.0.tar.gz",
      "icon": "icon.png",
      "checksum": "sha256:abcdef123456...",
      "size": 1024000,
      "publishedAt": "2024-01-15T10:00:00Z",
      "tags": ["dataverse", "utility", "reporting"],
      "minToolboxVersion": "1.0.0",
      "repository": "https://github.com/username/my-tool",
      "homepage": "https://my-tool-docs.com",
      "license": "MIT"
    }
  ]
}
```

### Field Descriptions

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique tool identifier (lowercase, hyphens, no spaces) |
| `name` | ✅ | Display name of the tool |
| `description` | ✅ | Short description of what the tool does |
| `author` | ✅ | Author name or organization |
| `version` | ✅ | Semantic version (e.g., "1.0.0") |
| `downloadUrl` | ✅ | Direct URL to the tar.gz file |
| `icon` | ❌ | Relative path to icon file inside the archive |
| `checksum` | ❌ | SHA256 checksum for verification |
| `size` | ❌ | File size in bytes |
| `publishedAt` | ✅ | ISO 8601 timestamp |
| `tags` | ❌ | Array of tags for filtering/search |
| `minToolboxVersion` | ❌ | Minimum ToolBox version required |
| `repository` | ❌ | Source code repository URL |
| `homepage` | ❌ | Tool documentation/homepage URL |
| `license` | ❌ | License identifier (e.g., "MIT", "Apache-2.0") |

## Publishing Tools

### Option 1: GitHub-Based Registry (Recommended)

1. **Create a tool-registry repository** on GitHub
2. **Add your tool info** to `registry.json`
3. **Upload tool archives** to GitHub Releases
4. **Enable GitHub Pages** to serve the registry.json

Example repository structure:
```
tool-registry/
├── registry.json
├── README.md
└── tools/
    └── (optional local copies)
```

### Option 2: Using npm for Building (Server-Side)

You can use npm during your build process on the server or CI/CD:

```bash
# On your development machine or CI server
npm install
npm run build
npm run package  # Custom script to create tar.gz

# Then upload to hosting
```

Example `package.json` script:
```json
{
  "scripts": {
    "build": "tsc && vite build",
    "package": "tar -czf dist/my-tool-${npm_package_version}.tar.gz -C dist ."
  }
}
```

### Option 3: Automated Publishing with GitHub Actions

Create `.github/workflows/publish.yml`:

```yaml
name: Publish Tool

on:
  release:
    types: [published]

jobs:
  package:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Build tool
        run: npm run build
      
      - name: Package tool
        run: |
          tar -czf my-tool-${{ github.event.release.tag_name }}.tar.gz \
            --exclude=node_modules \
            package.json index.html dist/
      
      - name: Upload to release
        uses: actions/upload-release-asset@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          upload_url: ${{ github.event.release.upload_url }}
          asset_path: ./my-tool-${{ github.event.release.tag_name }}.tar.gz
          asset_name: my-tool-${{ github.event.release.tag_name }}.tar.gz
          asset_content_type: application/gzip
```

## Tool Package Requirements

### Required Files

1. **package.json** - Must include:
   ```json
   {
     "name": "my-tool",
     "displayName": "My Awesome Tool",
     "version": "1.0.0",
     "description": "Tool description",
     "author": "Your Name",
     "icon": "icon.png",
     "main": "index.html"
   }
   ```

2. **HTML entry point** (specified in `package.json` `main` field)

3. **JavaScript/CSS files** referenced by your HTML

### Optional Files

- **icon.png** - Tool icon (recommended size: 128x128px)
- **README.md** - Tool documentation
- **LICENSE** - License file

### What NOT to Include

❌ `node_modules/` - Dependencies should be bundled  
❌ `.git/` - Version control files  
❌ Source TypeScript files (unless needed for runtime)  
❌ Build configuration files (`tsconfig.json`, `webpack.config.js`, etc.)  
❌ `.env` files or secrets  
❌ Large media files (host separately and reference by URL)  

## Best Practices

### 1. Bundle Your Dependencies

If your tool uses external libraries:

```bash
# Use a bundler like Vite, Webpack, or Rollup
npm run build

# This creates a single bundle with all dependencies
```

### 2. Optimize File Size

```bash
# Minify your code
# Remove unnecessary files
# Compress images
# Use CDN links for large libraries (React, Vue, etc.)
```

### 3. Version Your Tools

Follow semantic versioning:
- **1.0.0** - Initial release
- **1.0.1** - Bug fixes
- **1.1.0** - New features (backward compatible)
- **2.0.0** - Breaking changes

### 4. Test Before Publishing

```bash
# Extract and test your archive locally
tar -xzf my-tool-1.0.0.tar.gz -C /tmp/test-tool
cd /tmp/test-tool
# Verify all files are present
```

### 5. Calculate Checksums

```bash
# Generate SHA256 checksum
sha256sum my-tool-1.0.0.tar.gz

# On macOS
shasum -a 256 my-tool-1.0.0.tar.gz
```

Add the checksum to your registry entry for verification.

### 6. Keep Archives Small

- Maximum recommended size: **10 MB**
- Use external CDNs for large libraries
- Optimize and compress assets

### 7. Provide Clear Metadata

- Write descriptive `description` field
- Add relevant `tags` for discoverability
- Include `repository` and `homepage` URLs
- Specify `license` clearly

## Example: Complete Publishing Workflow

```bash
# 1. Develop your tool
cd my-tool
npm install
npm run dev  # Develop and test

# 2. Build for production
npm run build

# 3. Create package
tar -czf ../my-tool-1.0.0.tar.gz \
  --exclude=node_modules \
  --exclude=src \
  --exclude=.git \
  package.json index.html dist/ assets/ icon.png

# 4. Calculate checksum
sha256sum ../my-tool-1.0.0.tar.gz > ../my-tool-1.0.0.tar.gz.sha256

# 5. Upload to GitHub Release
gh release create v1.0.0 ../my-tool-1.0.0.tar.gz \
  --title "My Tool v1.0.0" \
  --notes "Initial release"

# 6. Update registry.json
# Add your tool entry to the registry

# 7. Test installation
# Install the tool in ToolBox and verify it works
```

## Migrating Existing npm-Based Tools

If you have existing tools published on npm:

1. **Build your tool** with all dependencies bundled
2. **Package as tar.gz** following the format above
3. **Host the archive** on GitHub Releases or CDN
4. **Add to registry.json** with the download URL
5. **Deprecate npm package** (optional) with a notice pointing to the registry

## Troubleshooting

### Tool Won't Install

- Check that the `downloadUrl` is publicly accessible
- Verify the archive format is correct (`tar -tzf file.tar.gz`)
- Ensure `package.json` exists in the archive root

### Tool Won't Load

- Check browser console for errors
- Verify all file paths are relative
- Ensure all dependencies are included

### Large File Size

- Use a bundler to combine files
- Minify JavaScript and CSS
- Host large assets externally
- Consider splitting into multiple smaller tools

## Getting Help

- **Documentation**: [Tool Development Guide](./TOOL_DEVELOPMENT.md)
- **Examples**: Check the tool-registry repository for examples
- **Issues**: Report problems on GitHub

## Security Considerations

- **HTTPS Only**: Always use HTTPS URLs for downloads
- **Checksums**: Provide SHA256 checksums for verification
- **Code Review**: Review tool code before adding to registry
- **Sandboxing**: Tools run in isolated webviews
- **No Secrets**: Never include API keys or secrets in tools

## Registry Hosting Options

### GitHub Pages (Free, Recommended)
- Free for public repositories
- Reliable and fast
- Easy to update via git

### Cloudflare Pages/Workers (Free)
- Unlimited bandwidth
- Global CDN
- Fast worldwide access

### AWS S3 + CloudFront
- Highly scalable
- Pay as you go
- Good for large registries

### Custom Server
- Full control
- Can add authentication
- Custom logic for tool filtering

---

For more information, see the [Tool Development Guide](./TOOL_DEVELOPMENT.md) and [Architecture Documentation](./ARCHITECTURE.md).
