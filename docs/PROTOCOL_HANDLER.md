# Custom Protocol Handler Implementation - `pptb://`

## Overview

This document describes the implementation of the `pptb://` custom protocol handler for the Power Platform ToolBox (PPTB) desktop application. This feature enables deep linking from external sources (such as a web-based tool catalog) to trigger tool installations in the desktop app.

## Architecture

The implementation follows VS Code's extension architecture pattern with security-first design:

### Key Components

1. **ProtocolHandlerManager** (`src/main/managers/protocolHandlerManager.ts`)
    - Manages protocol registration and URL parsing
    - Implements security validations and rate limiting
    - Handles single-instance application locking
2. **IPC Communication** (`src/common/ipc/channels.ts`)
    - New event channel: `PROTOCOL_INSTALL_TOOL_REQUEST`
    - Enables main → renderer communication for protocol events

3. **UI Handler** (`src/renderer/modules/marketplaceManagement.ts`)
    - `handleProtocolInstallToolRequest()` function
    - Shows tool detail modal for user confirmation
    - Integrates with existing tool installation flow

4. **Protocol Registration** (electron-builder configs)
    - Windows: `buildScripts/electron-builder-win.json`
    - macOS: `buildScripts/electron-builder-mac.json`
    - Linux: `buildScripts/electron-builder-linux.json`

## URL Format

```
pptb://install?toolId={toolId}&toolName={toolName}
```

### Parameters

- **`toolId`** (required): Unique identifier of the tool
    - Must be alphanumeric with hyphens/underscores only
    - Maximum length: 100 characters
    - Validation regex: `/^[a-zA-Z0-9_-]+$/`

- **`toolName`** (optional): Human-readable name of the tool
    - URL-encoded automatically (spaces as `%20`, etc.)
    - Maximum length: 200 characters
    - Used for display purposes only

### Example URLs

```
pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer
pptb://install?toolId=pcf-builder&toolName=PCF%20Component%20Builder
pptb://install?toolId=solution-viewer
```

## Security Features

### 1. URL Validation

- ✅ Whitelisted actions (only "install" allowed)
- ✅ Strict toolId format validation
- ✅ Length limits on all parameters
- ✅ URL decoding with error handling

### 2. Rate Limiting

- **Window**: 5 seconds
- **Max Requests**: 3 per window
- Prevents protocol spam/DOS attacks

### 3. Input Sanitization

```typescript
// Only alphanumeric, hyphens, and underscores allowed
const TOOL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

// Malicious examples that are BLOCKED:
pptb://install?toolId=../../etc/passwd        // ❌ Blocked
pptb://install?toolId=<script>alert(1)</script>  // ❌ Blocked
pptb://install?toolId='; DROP TABLE tools; --    // ❌ Blocked
```

### 4. User Confirmation Flow

1. Protocol URL detected
2. App brought to foreground
3. Tool detail modal shown
4. User must explicitly click "Install"
5. No automatic installation

### 5. Single Instance Lock

- Ensures only one app instance runs
- Second instance passes URL to first instance
- Prevents race conditions

## Platform-Specific Behavior

### macOS

- Handled via `app.on('open-url')` event
- Protocol registration in `.plist` file (handled by electron-builder)
- Works when app is not running or already running

### Windows

- Registered via Windows Registry during installation
- Handled via `app.on('second-instance')` or command-line args
- Protocol URL passed in command-line arguments

### Linux

- Registered in `.desktop` file (AppImage)
- Handled similarly to Windows via command-line args
- May require desktop environment restart to register

## Implementation Flow

```
┌─────────────────┐
│  Web App/Link   │
│  clicks:        │
│  pptb://install │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ OS Protocol     │ ◄──── Registered during installation
│ Handler         │       (Windows Registry / macOS .plist / Linux .desktop)
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ PPTB App (Main Process)                         │
│ ProtocolHandlerManager                          │
│ ┌─────────────────────────────────────────────┐ │
│ │ 1. Check single instance lock               │ │
│ │ 2. Parse & validate URL                     │ │
│ │ 3. Rate limit check                         │ │
│ │ 4. Sanitize toolId                          │ │
│ │ 5. Send IPC event to renderer               │ │
│ └─────────────────────────────────────────────┘ │
└────────┬────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────┐
│ Renderer Process                                │
│ marketplaceManagement.ts                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ 1. Fetch tool library                       │ │
│ │ 2. Find tool by toolId                      │ │
│ │ 3. Check if already installed               │ │
│ │ 4. Show tool detail modal                   │ │
│ │ 5. User clicks "Install"                    │ │
│ │ 6. Install via installToolFromRegistry()    │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Testing Instructions

### Prerequisites

```bash
pnpm install
pnpm run build
pnpm run package  # To create installer
```

### Manual Testing

#### macOS

```bash
# Test with app running
open "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"

# Test with app not running
killall "Power Platform ToolBox"
open "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"
```

#### Windows (PowerShell)

```powershell
# Test with app running
Start-Process "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"

# Test with app not running
taskkill /IM "Power Platform ToolBox.exe" /F
Start-Process "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"
```

#### Linux

```bash
# Test with app running
xdg-open "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"

# Test with app not running
pkill -f "Power Platform ToolBox"
xdg-open "pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"
```

### Test Cases

1. **Valid Tool ID**

    ```
    pptb://install?toolId=valid-tool-123&toolName=Test%20Tool
    ✅ Should open tool detail modal
    ```

2. **Invalid Tool ID (Special Characters)**

    ```
    pptb://install?toolId=../../../etc/passwd
    ❌ Should be blocked, show error
    ```

3. **Missing Tool ID**

    ```
    pptb://install?toolName=Test%20Tool
    ❌ Should be blocked, show error
    ```

4. **Non-existent Tool**

    ```
    pptb://install?toolId=nonexistent-tool-xyz
    ⚠️ Should show "Tool Not Found" notification
    ```

5. **Already Installed Tool**

    ```
    pptb://install?toolId=already-installed-tool
    ℹ️ Should show "Already Installed" notification
    ```

6. **Rate Limiting**

    ```bash
    # Click protocol link 4 times rapidly
    ⚠️ 4th request should be blocked
    ```

7. **URL Encoding**
    ```
    pptb://install?toolId=test-tool&toolName=Test%20Tool%20With%20Spaces
    ✅ Should decode correctly
    ```

### Debugging

Enable verbose logging by checking Sentry logs:

```typescript
// In development, check console for:
[ProtocolHandler] Received open-url event: pptb://install?...
[ProtocolHandler] Handling protocol URL: pptb://install?...
[Protocol] Handling install request for tool: {toolId}
```

### Integration with Web App

Example HTML:

```html
<a href="pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer"> Install in Desktop App </a>
```

Example JavaScript:

```javascript
function installInDesktop(toolId, toolName) {
    const url = `pptb://install?toolId=${encodeURIComponent(toolId)}&toolName=${encodeURIComponent(toolName)}`;
    window.location.href = url;
}

// Usage
installInDesktop("dataverse-explorer", "Dataverse Explorer");
```

## Error Handling

### Graceful Degradation

1. **Tool Not Found**: Shows notification, doesn't crash
2. **Invalid URL**: Logged to Sentry, silently ignored
3. **Rate Limited**: Logged to Sentry, request dropped
4. **Installation Failure**: Shows error notification with details

### Monitoring

All protocol events are logged to Sentry with appropriate tags:

- `manager: ProtocolHandler`
- `phase: parse_url|handle_callback|protocol_install`
- `trigger: open-url|second-instance|startup`

## Best Practices & Recommendations

### For Web Developers

1. **Always URL-encode parameters**:

    ```javascript
    const toolName = "My Tool 2.0 (Beta)";
    const encoded = encodeURIComponent(toolName);
    // Result: "My%20Tool%202.0%20%28Beta%29"
    ```

2. **Provide fallback for browsers without handler**:

    ```javascript
    function installTool(toolId, toolName) {
        const protocolUrl = `pptb://install?toolId=${toolId}&toolName=${encodeURIComponent(toolName)}`;

        // Try protocol first
        window.location.href = protocolUrl;

        // Fallback after 2 seconds if app not installed
        setTimeout(() => {
            if (confirm("Desktop app not installed. Download now?")) {
                window.location.href = "https://github.com/PowerPlatformToolBox/desktop-app/releases";
            }
        }, 2000);
    }
    ```

3. **Validate toolId before generating link**:

    ```javascript
    const TOOL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;

    if (!TOOL_ID_REGEX.test(toolId)) {
        console.error("Invalid toolId format");
        return;
    }
    ```

### For Desktop App Maintainers

1. **Never auto-install**: Always show confirmation dialog
2. **Log all protocol events**: Essential for debugging
3. **Update rate limits**: If needed based on usage patterns
4. **Monitor Sentry**: Check for blocked malicious attempts

## Future Enhancements

### Potential Features

1. **Multi-action support**:
    - `pptb://uninstall?toolId={toolId}`
    - `pptb://launch?toolId={toolId}&connectionId={connectionId}`
    - `pptb://update?toolId={toolId}`

2. **Deep linking parameters**:
    - `pptb://install?toolId={toolId}&autoStart=true`
    - `pptb://install?toolId={toolId}&category={category}`

3. **Analytics tracking**:
    - Track protocol install vs manual install
    - Monitor success/failure rates
    - A/B test different web flows

4. **Enhanced security**:
    - Token-based authentication
    - Time-limited install URLs
    - Signed URLs from trusted sources

## Troubleshooting

### Protocol Not Registered

**Symptoms**: Clicking link does nothing or opens browser

**Solutions**:

- **Windows**: Reinstall app (protocol registered during install)
- **macOS**: App must be moved to `/Applications` folder
- **Linux**: Run `update-desktop-database` after install

### App Not Launching

**Symptoms**: Error message "No application found"

**Solutions**:

1. Verify app is installed correctly
2. Check protocol registration:
    - **Windows**: Check `HKEY_CLASSES_ROOT\pptb` in Registry
    - **macOS**: Check `/Applications/Power Platform ToolBox.app/Contents/Info.plist`
    - **Linux**: Check `~/.local/share/applications/*.desktop`

### Rate Limiting Issues

**Symptoms**: Protocol clicks not working after multiple attempts

**Solutions**:

- Wait 5 seconds between requests
- Restart app to reset rate limiter
- Check Sentry logs for rate limit warnings

## References

- [Electron Custom Protocol API](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron App setAsDefaultProtocolClient](https://www.electronjs.org/docs/latest/api/app#appsetasdefaultprotocolclientprotocol-path-args)
- [VS Code URI Handlers](https://code.visualstudio.com/api/references/vscode-api#Uri)
- [Deep Linking Best Practices](https://developer.apple.com/documentation/xcode/defining-a-custom-url-scheme-for-your-app)
