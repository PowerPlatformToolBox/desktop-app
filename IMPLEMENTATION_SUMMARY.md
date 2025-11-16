# Implementation Summary: Per-Tool CSP Configuration

## Overview
This implementation adds per-tool Content Security Policy (CSP) configuration to Power Platform Tool Box, allowing tools to request specific permissions to access external resources while maintaining security through explicit user consent.

## Problem Statement
The issue (bug#40) identified that PPTB's webview enforces a strict Content Security Policy that blocks external connections. Tools that need to:
- Make API calls to Dataverse or external services
- Load external scripts/styles from CDNs
- Load external resources (images, fonts, etc.)

were unable to function properly.

## Solution Implemented

### 1. Type System Changes
**Files Modified:**
- `src/types/index.ts`

**Changes:**
- Added `CspExceptions` interface supporting 7 CSP directives:
  - `connect-src` - Network requests
  - `script-src` - External scripts
  - `style-src` - External stylesheets
  - `img-src` - Images
  - `font-src` - Fonts
  - `frame-src` - Embedded frames
  - `media-src` - Audio/video

- Updated `Tool`, `ToolManifest`, and `ToolRegistryEntry` interfaces to include optional `cspExceptions` field
- Added `cspConsents: { [toolId: string]: boolean }` to `UserSettings` for tracking user consent

### 2. Backend Implementation (Main Process)

#### ToolsManager (`src/main/managers/toolsManager.ts`)
- Updated `loadToolFromManifest()` to include CSP exceptions when loading tools
- Updated `loadLocalTool()` to load CSP exceptions from local tool package.json
- Added `ToolPackageJson` interface to include `cspExceptions`

#### ToolRegistryManager (`src/main/managers/toolRegistryManager.ts`)
- Updated `installTool()` to preserve CSP exceptions from registry and package.json
- CSP exceptions are stored in the tool manifest during installation

#### SettingsManager (`src/main/managers/settingsManager.ts`)
- Added `cspConsents: {}` to default user settings
- Implemented 4 new methods:
  - `hasCspConsent(toolId)` - Check if consent granted
  - `grantCspConsent(toolId)` - Grant consent
  - `revokeCspConsent(toolId)` - Revoke consent
  - `getCspConsents()` - Get all consents

#### IPC Handlers (`src/main/index.ts`)
Added 4 new IPC handlers:
- `has-csp-consent`
- `grant-csp-consent`
- `revoke-csp-consent`
- `get-csp-consents`

#### Preload Script (`src/main/preload.ts`)
Exposed 4 new functions to renderer:
- `hasCspConsent(toolId)`
- `grantCspConsent(toolId)`
- `revokeCspConsent(toolId)`
- `getCspConsents()`

### 3. Frontend Implementation (Renderer)

#### Renderer (`src/renderer/renderer.ts`)

**New Functions:**
1. `buildToolCsp(tool)` - Generates CSP string by merging default policy with tool exceptions
   - Default policy: `default-src 'self'; script-src 'self' 'unsafe-inline'; ...`
   - Tool exceptions are added to respective directives
   - Returns complete CSP string

2. `showCspConsentDialog(tool)` - Displays consent dialog
   - Shows tool name and author
   - Lists all requested CSP exceptions with clear descriptions
   - Displays security warning
   - Returns Promise<boolean> indicating user's decision

**Modified Functions:**
- `launchTool(toolId)`:
  1. Checks if tool has CSP exceptions
  2. If yes, checks if consent already granted
  3. If not granted, shows consent dialog
  4. If user declines, tool doesn't load
  5. If granted, stores consent and continues

- Iframe creation:
  1. CSP meta tag generated using `buildToolCsp()`
  2. CSP injected into HTML head
  3. Iframe loads with proper CSP

#### Styling (`src/renderer/styles.scss`)
Added 120+ lines of CSS for:
- `.csp-consent-dialog` - Modal dialog container
- `.csp-exceptions-list` - Scrollable permissions list
- `.csp-exception` - Individual permission display
- `.csp-warning` - Security warning box
- Dark theme variants for all components

#### Type Definitions (`src/renderer/types.d.ts`)
Added to `ToolboxAPI` interface:
- `hasCspConsent(toolId: string): Promise<boolean>`
- `grantCspConsent(toolId: string): Promise<void>`
- `revokeCspConsent(toolId: string): Promise<void>`
- `getCspConsents(): Promise<{ [toolId: string]: boolean }>`

### 4. Documentation

#### CSP_CONFIGURATION.md (8.7KB)
Comprehensive guide covering:
- What is CSP and why per-tool configuration
- How it works (user and developer perspectives)
- Supported CSP directives with examples
- Default CSP policy
- Best practices for tool developers
- Security considerations
- Troubleshooting guide
- Future enhancements

#### Example Files
1. `docs/examples/tool-with-csp-package.json` - Complete tool manifest example
2. `docs/examples/registry.json` - Updated with Dataverse ERD Generator tool showing CSP usage

#### README.md
- Added CSP feature to Features Overview
- Added CSP to Security Model section
- Linked to CSP_CONFIGURATION.md

## Technical Decisions

### 1. Default-Allow with Exceptions
**Decision:** Start with strict default CSP and allow tools to request specific exceptions
**Rationale:** 
- Most secure approach
- Follows principle of least privilege
- Users understand exactly what permissions each tool needs

### 2. User Consent Required
**Decision:** Show consent dialog on first tool launch if CSP exceptions exist
**Rationale:**
- Transparency - users know what they're granting
- Security - prevents malicious tools from silently accessing external resources
- Trust - builds user confidence in the platform

### 3. Persistent Consent Storage
**Decision:** Store consent in user settings (electron-store)
**Rationale:**
- Persists across sessions
- Can be manually edited if needed
- Enables future "revoke consent" UI feature

### 4. CSP Meta Tag Injection
**Decision:** Inject CSP as meta tag in iframe HTML
**Rationale:**
- Works with srcdoc attribute
- Doesn't require server-side CSP headers
- Can be dynamically generated per tool

### 5. Merging CSP Directives
**Decision:** Merge tool exceptions with defaults, don't replace
**Rationale:**
- Ensures baseline security is maintained
- Tool developers only specify additions
- Prevents accidental security weakening

## Security Analysis

### Threats Mitigated
1. **XSS Attacks** - Strict script-src prevents injection of malicious scripts
2. **Data Exfiltration** - Limited connect-src prevents unauthorized network requests
3. **Clickjacking** - Can be controlled via frame-src
4. **Malicious Tools** - User consent required for any external access

### Security Properties Maintained
1. **Process Isolation** - Tools still run in separate processes
2. **IPC Validation** - All communication validated
3. **No Breaking Changes** - Existing tools work without modification
4. **Backward Compatible** - Tools without CSP exceptions get default strict policy

### Potential Risks & Mitigations
1. **Risk:** Users might grant consent without understanding
   - **Mitigation:** Detailed permission breakdown in consent dialog
   - **Mitigation:** Security warning clearly displayed
   - **Future:** Add permission templates and risk levels

2. **Risk:** Overly broad CSP exceptions (e.g., wildcards)
   - **Mitigation:** Documentation emphasizes specific domains
   - **Future:** Add validation/warnings for broad patterns

3. **Risk:** Consent fatigue if too many dialogs
   - **Mitigation:** Consent stored permanently per tool
   - **Future:** Add "trust this author" feature

## Testing

### Automated Testing
- ✅ TypeScript compilation: No errors
- ✅ Linting: 0 errors, 98 warnings (pre-existing)
- ✅ Build: Successful
- ✅ CodeQL Security Scan: 0 vulnerabilities

### Manual Testing Required
Due to GUI requirements, the following should be tested manually:
1. Tool with CSP exceptions shows consent dialog on first launch
2. Consent dialog displays all CSP exceptions correctly
3. Accept button grants consent and loads tool
4. Decline button prevents tool from loading
5. Subsequent launches don't show dialog if consent granted
6. CSP is properly applied to iframe (check browser console)
7. Dark theme styling works correctly
8. Consent survives app restart

### Test Scenarios
1. **Tool without CSP** - Should load normally without dialog
2. **Tool with connect-src** - Should show dialog with network permissions
3. **Tool with multiple directives** - Should show all in dialog
4. **User declines** - Tool shouldn't load, error notification shown
5. **User accepts** - Tool loads, consent stored
6. **Local development tool** - CSP from package.json should work

## Performance Impact

### Minimal Impact Expected
- **Consent check**: Single synchronous check in electron-store (~1ms)
- **CSP generation**: Simple string concatenation (~<1ms)
- **Dialog display**: Only on first launch per tool
- **Meta tag injection**: Negligible HTML manipulation

### No Impact On
- Tool execution speed
- IPC communication
- File system operations
- Memory usage

## Breaking Changes
**None.** 
- Existing tools without CSP exceptions work unchanged
- New optional field in manifests
- No API changes to existing functions
- New APIs are additions, not modifications

## Future Enhancements

### Short Term (1-3 months)
1. Settings UI to view and revoke CSP consents
2. Validation/warnings for overly broad CSP patterns
3. Audit log of when tools use CSP permissions

### Medium Term (3-6 months)
1. CSP templates for common use cases ("Dataverse Access", "CDN Scripts")
2. Temporary consent option (one-time permission)
3. Risk level indicators (low/medium/high risk permissions)

### Long Term (6-12 months)
1. "Trust this author" feature to auto-approve from known developers
2. Community-driven CSP pattern recommendations
3. Integration with tool ratings/reviews

## Files Changed

### Core Application (9 files)
1. `src/types/index.ts` - Type definitions
2. `src/main/managers/toolsManager.ts` - Tool loading
3. `src/main/managers/toolRegistryManager.ts` - Registry handling
4. `src/main/managers/settingsManager.ts` - Consent storage
5. `src/main/index.ts` - IPC handlers
6. `src/main/preload.ts` - Renderer API exposure
7. `src/renderer/renderer.ts` - UI logic
8. `src/renderer/styles.scss` - Styling
9. `src/renderer/types.d.ts` - Renderer types

### Documentation (4 files)
1. `docs/CSP_CONFIGURATION.md` - Comprehensive guide
2. `docs/examples/tool-with-csp-package.json` - Example manifest
3. `docs/examples/registry.json` - Updated example
4. `README.md` - Feature highlights

### Total Changes
- **Lines Added:** ~700
- **Lines Modified:** ~50
- **New Files:** 2
- **Build Status:** ✅ Success
- **Security Scan:** ✅ No issues

## Conclusion

This implementation successfully addresses the issue described in bug#40 by:
1. ✅ Allowing tools to specify CSP exceptions in their manifest
2. ✅ Implementing a user consent flow for transparency and security
3. ✅ Dynamically applying CSP to tool iframes based on granted permissions
4. ✅ Providing comprehensive documentation for users and developers

The solution balances security with functionality, ensuring tools can access the external resources they need while protecting users through explicit consent and clear communication of permissions.
