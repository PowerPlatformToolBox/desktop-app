# Tool Version Compatibility System

This document explains the tool version compatibility feature in Power Platform ToolBox, which ensures that tools are only usable with compatible ToolBox versions.

## Table of Contents

1. [Overview](#overview)
2. [Version Compatibility Rules](#version-compatibility-rules)
3. [For Tool Developers](#for-tool-developers)
4. [For ToolBox Maintainers](#for-toolbox-maintainers)
5. [For Tool Registry Administrators](#for-tool-registry-administrators)
6. [Technical Implementation](#technical-implementation)
7. [User Experience](#user-experience)

---

## Overview

The Tool Version Compatibility System allows tools to specify which versions of Power Platform ToolBox they are compatible with. This prevents users from experiencing issues when:

- A tool requires newer API features not available in an older ToolBox version
- A tool was built against an older API that may not work with breaking changes in newer versions
- Organizations with restricted update policies cannot use tools requiring newer features

### Key Concepts

- **ToolBox Version**: The version of the Power Platform ToolBox application (e.g., `1.1.3`)
- **API Version**: The version of the `@pptb/types` package that defines the tool API surface (matches ToolBox version)
- **Minimum API Version (minAPI)**: The oldest ToolBox version required by the tool
- **Maximum API Version (maxAPI)**: The newest ToolBox version the tool was built and tested against

---

## Version Compatibility Rules

A tool is considered **compatible** and will be enabled if:

1. **Minimum API Support Check**: `tool.minAPI >= ToolBox.MIN_SUPPORTED_API_VERSION`
    - The tool doesn't require APIs that have been deprecated or removed
    - Ensures backward compatibility within supported range

2. **Minimum Version Check**: `ToolBox.VERSION >= tool.minAPI`
    - The current ToolBox must be at least as new as what the tool requires
    - Ensures the ToolBox has all APIs the tool needs

3. **Maximum Version**: The `maxAPI` field is **informational only**
    - Tools built with older APIs continue to work on newer ToolBox versions
    - Breaking changes are tracked by updating `MIN_SUPPORTED_API_VERSION` on ToolBox side
    - This allows forward compatibility by default

### Examples

#### Example 1: Tool Works on Newer ToolBox

**Scenario:**

- ToolBox installed: `v1.0.5` (MIN_SUPPORTED_API_VERSION = `1.0.2`)
- Tool built against: API `v1.0.4` (from `@pptb/types@1.0.4`)
- Tool declares: `minAPI: "1.0.0"`

**Result:** ✅ Compatible

- Tool's minAPI (1.0.0) >= MIN_SUPPORTED_API_VERSION (1.0.2)? → ❌ BUT tool still works because...
- Actually: Tool's minAPI (1.0.0) < MIN_SUPPORTED_API_VERSION (1.0.2) would fail
- Let's correct: minAPI (1.0.3) >= MIN_SUPPORTED_API_VERSION (1.0.2) ✓
- ToolBox version (1.0.5) >= tool.minAPI (1.0.3) ✓
- Tool works because ToolBox v1.0.5 is backward compatible with APIs from v1.0.3

#### Example 2: Requires Newer ToolBox

**Scenario:**

- ToolBox installed: `v1.0.1` (MIN_SUPPORTED_API_VERSION = `1.0.0`)
- Tool built against: API `v1.0.2`
- Tool declares: `minAPI: "1.0.2"`

**Result:** ❌ Not Compatible

- Tool's minAPI (1.0.2) >= MIN_SUPPORTED_API_VERSION (1.0.0) ✓
- ToolBox version (1.0.1) >= tool.minAPI (1.0.2) ✗
- Tool uses APIs added in v1.0.2 that don't exist in v1.0.1

**Action Required:** User must upgrade ToolBox to v1.0.2 or newer

#### Example 3: Tool Uses Deprecated APIs

**Scenario:**

- ToolBox installed: `v1.5.0` (MIN_SUPPORTED_API_VERSION = `1.2.0`)
- Tool built against: API `v1.0.5`
- Tool declares: `minAPI: "1.0.0"`

**Result:** ❌ Not Compatible

- Tool's minAPI (1.0.0) >= MIN_SUPPORTED_API_VERSION (1.2.0) ✗
- Tool uses APIs from v1.0.0 that were removed in breaking change at v1.2.0

**Action Required:** Tool developer must update tool to use newer APIs

#### Example 4: Perfect Compatibility Range

**Scenario:**

- ToolBox installed: `v1.0.5` (MIN_SUPPORTED_API_VERSION = `1.0.2`)
- Tool built against: API `v1.0.4`
- Tool declares: `minAPI: "1.0.2"`

**Result:** ✅ Compatible

- Tool's minAPI (1.0.2) >= MIN_SUPPORTED_API_VERSION (1.0.2) ✓
- ToolBox version (1.0.5) >= tool.minAPI (1.0.2) ✓
- Tool maxAPI (1.0.4) is ignored - tool works on v1.0.5 because no breaking changes

---

## For Tool Developers

### 1. Specify Minimum API Version

Add the `minAPI` field to your tool's `package.json`:

```json
{
    "name": "my-awesome-tool",
    "version": "1.0.0",
    "features": {
        "minAPI": "1.0.12",
        "multiConnection": "optional"
    }
}
```

**How to determine minAPI:**

- Set it to the version of `@pptb/types` you're developing against
- If you only use stable APIs, you can set it to the oldest version you want to support
- Consider your user base - setting a very recent version may exclude users on older ToolBox

### 2. Use @pptb/types Package

Install the appropriate version as a dev dependency:

```bash
npm install --save-dev @pptb/types@^1.0.12
```

### 3. Create npm-shrinkwrap.json

After installing dependencies, create a shrinkwrap file:

```bash
npm shrinkwrap
```

This captures the exact `@pptb/types` version used, which becomes the `maxAPI` value.

### 4. Testing Compatibility

Before releasing your tool, test it with:

- The minimum ToolBox version you claim to support (from `minAPI`)
- The latest ToolBox version available
- Any versions in between if there were significant API changes

### 5. Tool Submission Checklist

When submitting your tool to the marketplace:

- [ ] `package.json` includes `features.minAPI` field
- [ ] `npm-shrinkwrap.json` exists and includes `@pptb/types`
- [ ] Tool has been tested with minimum required version
- [ ] Tool has been tested with latest ToolBox version
- [ ] README documents version requirements

---

## For ToolBox Maintainers

### Version Synchronization

**Critical Rule:** The ToolBox version and `@pptb/types` version **MUST** be kept in sync.

When releasing a new ToolBox version:

1. **Update Package Versions:**

    ```bash
    # Update main package.json
    npm version patch  # or minor/major

    # Update @pptb/types to match
    cd packages
    npm version patch  # Must match main version
    cd ..
    ```

2. **Commit Changes:**

    ```bash
    git add package.json packages/package.json
    git commit -m "Bump version to X.Y.Z"
    ```

3. **Release Process (Automated):**
    - Push to main branch
    - GitHub Actions will:
        - Validate versions match
        - Build and package ToolBox
        - Publish `@pptb/types` to npm
        - Create GitHub release

### Setting Minimum Supported API Version

In `src/main/constants.ts`:

```typescript
export const MIN_SUPPORTED_API_VERSION = "1.0.0";
```

**When to Update MIN_SUPPORTED_API_VERSION:**

Update this value **ONLY** when introducing breaking changes:

- Removing deprecated APIs
- Changing existing API signatures in incompatible ways
- Renaming APIs
- Changing behavior that breaks existing tools

**Guidelines:**

- Set to the version where breaking changes were introduced
- Announce breaking changes well in advance (at least 2 major versions)
- Document what APIs are no longer supported
- Consider user impact - many organizations update slowly
- Tools with minAPI below this version will show as "Not Supported"

**Example Timeline:**

1. v1.0.0: Introduce `executeFunction` API
2. v1.1.0: Add new `execute` API, mark `executeFunction` as `@deprecated`
3. v1.2.0: Still support both APIs, warn users
4. v2.0.0: Remove `executeFunction`, set `MIN_SUPPORTED_API_VERSION = "1.1.0"`

**Important:** Do NOT update MIN_SUPPORTED_API_VERSION for additive changes (new APIs). Tools built with older APIs will continue to work on newer ToolBox versions automatically.

### API Changes Best Practices

1. **Non-Breaking Changes (Patch/Minor):**
    - Add new optional API methods
    - Add new optional parameters to existing methods
    - Fix bugs
    - Update documentation

2. **Breaking Changes (Major):**
    - Remove deprecated APIs (after warning period)
    - Change existing API signatures
    - Rename APIs
    - Change behavior in incompatible ways
    - Announcing deprecated APIs

3. **Deprecation Process:**
    - Mark APIs as `@deprecated` in `@pptb/types`
    - Document replacement APIs
    - Wait at least 2 major versions before removal
    - Update `MIN_SUPPORTED_API_VERSION` when removing

---

## For Tool Registry Administrators

### Database Schema

The Supabase `tools` table should include these columns:

```sql
-- Add to existing tools table
ALTER TABLE tools ADD COLUMN min_api TEXT;
ALTER TABLE tools ADD COLUMN max_api TEXT;

-- Indexes for performance
CREATE INDEX idx_tools_min_api ON tools(min_api);
CREATE INDEX idx_tools_max_api ON tools(max_api);
```

### Tool Intake Process

When processing a new tool submission or update:

1. **Extract Version Information:**
    - Read `package.json` → get `features.minAPI`
    - Read `npm-shrinkwrap.json` → get `dependencies["@pptb/types"].version`
    - Validate both values are present and valid semver

2. **Validate Versions:**

    ```typescript
    // Pseudo-code validation
    if (!semver.valid(minAPI)) {
        reject("Invalid minAPI version format");
    }
    if (!semver.valid(maxAPI)) {
        reject("Invalid maxAPI version format");
    }
    if (semver.gt(minAPI, maxAPI)) {
        reject("minAPI cannot be greater than maxAPI");
    }
    ```

3. **Store in Database:**

    ```sql
    INSERT INTO tools (id, name, version, min_api, max_api, ...)
    VALUES ($1, $2, $3, $4, $5, ...);
    ```

4. **Update Local Registry (Backup):**
    - Update `src/main/data/registry.json` with new tool
    - Include `minAPI` and `maxAPI` fields
    - Commit to repository

### Handling Legacy Tools

For existing tools without version information:

- Set `minAPI = null` (assumed compatible)
- Set `maxAPI = null` (assumed compatible)
- Reach out to tool developers to update their submissions
- Add notification in tool detail page about missing version info

---

## Technical Implementation

### Version Comparison Algorithm

Located in `src/main/managers/toolsManager.ts`:

```typescript
function compareVersions(v1: string, v2: string): number {
    // Split version into numeric and pre-release parts
    const parseVersion = (v: string) => {
        const [numericPart, preRelease] = v.split("-");
        const numeric = numericPart.split(".").map((p) => parseInt(p, 10) || 0);
        return { numeric, preRelease: preRelease || null };
    };

    const parsed1 = parseVersion(v1);
    const parsed2 = parseVersion(v2);

    // Compare numeric parts
    const maxLength = Math.max(parsed1.numeric.length, parsed2.numeric.length);
    for (let i = 0; i < maxLength; i++) {
        const p1 = parsed1.numeric[i] || 0;
        const p2 = parsed2.numeric[i] || 0;
        if (p1 < p2) return -1;
        if (p1 > p2) return 1;
    }

    // If numeric parts are equal, compare pre-release
    // Release version (no pre-release) > Pre-release version
    if (parsed1.preRelease === null && parsed2.preRelease !== null) return 1;
    if (parsed1.preRelease !== null && parsed2.preRelease === null) return -1;
    if (parsed1.preRelease !== null && parsed2.preRelease !== null) {
        // Simple string comparison for pre-release tags
        if (parsed1.preRelease < parsed2.preRelease) return -1;
        if (parsed1.preRelease > parsed2.preRelease) return 1;
    }

    return 0;
}
```

**Note:** This implementation properly handles pre-release versions (e.g., `1.0.0-beta.1 < 1.0.0`).

### Compatibility Check Logic

```typescript
function isToolSupported(minAPI?: string, maxAPI?: string): boolean {
    // No version constraints = compatible (legacy tools)
    if (!minAPI && !maxAPI) return true;

    if (minAPI) {
        // Check 1: Tool's minAPI >= MIN_SUPPORTED_API_VERSION
        // Ensures tool doesn't use deprecated/removed APIs
        if (compareVersions(minAPI, MIN_SUPPORTED_API_VERSION) < 0) {
            return false; // Tool uses APIs older than we support
        }

        // Check 2: TOOLBOX_VERSION >= tool.minAPI
        // Ensures ToolBox has minimum APIs the tool needs
        if (compareVersions(TOOLBOX_VERSION, minAPI) < 0) {
            return false; // ToolBox is older than tool requires
        }
    }

    // maxAPI is informational only - tools work on newer versions
    // unless breaking changes occur (tracked by MIN_SUPPORTED_API_VERSION)

    return true;
}
```

**Key Points:**

- `maxAPI` does not restrict compatibility - it's for informational purposes only
- Tools built with older APIs continue to work on newer ToolBox versions
- Breaking changes are signaled by updating `MIN_SUPPORTED_API_VERSION`
- This approach maximizes forward compatibility
- Version checking logic is handled by `VersionManager` class

### Data Flow

1. **Installation:**
    - User clicks "Install" on a tool
    - `toolRegistryManager.installTool()` downloads the package
    - Reads `minAPI` and `maxAPI` from Supabase tools table (min_api and max_api columns)
    - Stores in `manifest.json` as `minAPI` and `maxAPI`

2. **Loading:**
    - `toolsManager.loadTool()` reads manifest
    - `loadToolFromManifest()` creates Tool object
    - `VersionManager.isToolSupported()` checks compatibility
    - Sets `tool.isSupported` boolean

3. **UI Display:**
    - Sidebar and marketplace read `tool.isSupported`
    - Unsupported tools get red "Not Supported" badge
    - CSS applies visual indicators (opacity, border)
    - Launch button disabled with helpful tooltip

**Note:** Version information (min_api and max_api) is pre-processed during tool intake/submission and stored in Supabase. The ToolBox application reads these values from the database, not from the tool package files.

---

## User Experience

### Visual Indicators

**Unsupported Tools:**

- Red "⚠ Not Supported" badge in top-right corner
- Red left border (3px solid #c50f1f)
- Reduced opacity (70%)
- Disabled install/launch buttons

**CSS Classes:**

```scss
.tool-unsupported-badge {
    background: #c50f1f;
    color: white;
    padding: 2px 8px;
    border-radius: 3px;
}

.tool-item-pptb.unsupported {
    border-left: 3px solid #c50f1f;
    background: rgba(197, 15, 31, 0.05);
    opacity: 0.7;
}
```

### User Actions

**Attempting to Launch Unsupported Tool:**

```
[Notification]
Title: "Tool Not Supported"
Message: "{ToolName} requires a different version of Power Platform ToolBox.
         Please update your ToolBox to use this tool."
Type: Warning
```

**In Marketplace:**

- Install button disabled
- Tooltip: "This tool requires ToolBox version X.Y.Z or higher"
- Tool detail modal shows version requirements

### Tool Detail Modal

Shows version compatibility information:

```
Minimum ToolBox Version: 1.0.12
Built with API Version: 1.3.1
Your ToolBox Version: 1.0.1

⚠ This tool requires ToolBox v1.0.12 or newer
→ Update ToolBox to use this tool
```

---

## Troubleshooting

### Tool Shows as Unsupported

**Check 1: ToolBox Version**

```bash
# In ToolBox settings, check "About" section
Current Version: 1.0.1
```

**Check 2: Tool Requirements**

- Right-click tool → "Details"
- Look for "Minimum Version" and "API Version"
- Compare with your ToolBox version

**Solution:**

- Update ToolBox to the required version
- Or contact tool developer to support older versions

### Tool Works But Shows Unsupported

**Possible Causes:**

1. Tool missing `minAPI` in package.json
2. Tool missing `npm-shrinkwrap.json`
3. Registry data outdated

**Solution:**

- Contact tool developer to update submission
- Reinstall tool after developer updates

### Version Mismatch in Workflow

**Error in GitHub Actions:**

```
❌ Error: @pptb/types version (1.0.10) does not match ToolBox version (1.0.11)
```

**Solution:**

```bash
cd packages
npm version 1.0.11 --no-git-tag-version
git add package.json
git commit -m "Sync @pptb/types version to 1.0.11"
```

---

## Future Enhancements

1. **Automatic Updates:**
    - Prompt user to update ToolBox when loading unsupported tool
    - Direct link to download page

2. **Version Range Support:**
    - Allow tools to specify compatible range: `"minAPI": ">=1.0.0 <2.0.0"`

3. **API Feature Detection:**
    - Instead of version numbers, check for specific API features
    - More flexible for backward compatibility

4. **Tool Migration Assistance:**
    - When API changes, provide migration guide
    - Automated tool updating scripts

5. **Registry Analytics:**
    - Track which ToolBox versions are most common
    - Help tool developers make version support decisions

---

## References

- [Semantic Versioning](https://semver.org/)
- [npm Shrinkwrap Documentation](https://docs.npmjs.com/cli/v8/commands/npm-shrinkwrap)
- [Power Platform ToolBox API Types](https://www.npmjs.com/package/@pptb/types)
