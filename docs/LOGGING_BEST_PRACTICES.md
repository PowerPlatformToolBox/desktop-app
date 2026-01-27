# Logging Best Practices

This document outlines the logging and telemetry practices for the Power Platform ToolBox application.

## Overview

The application uses a hybrid logging approach:
1. **Console Logging**: All logs are written to the console for local debugging
2. **Sentry Telemetry**: Structured logs are sent to Sentry for production monitoring (environment-aware)

## Logging Architecture

### Sentry Helper (`src/common/sentryHelper.ts`)

The centralized logging module provides:
- Environment-aware log routing
- Console output for all log levels
- Sentry integration with proper context
- Machine ID tracking for all events

### Environment Detection

The logging system automatically detects the environment:
- **Development**: `NODE_ENV=development` or unpacked Electron app
- **Production**: Packaged Electron app

## Log Levels

### logTrace() - Detailed Diagnostics

**Use for**: Very detailed diagnostic information, typically only needed during development

**Behavior**:
- ✅ Always logged to console in development
- ✅ Sent to Sentry ONLY in development
- ❌ Not sent to Sentry in production (reduces noise)

**Example**:
```typescript
import { logTrace } from "../../common/sentryHelper";

logTrace("Processing user action", { actionType: "click", elementId: "submit-btn" });
```

### logDebug() - Debug Information

**Use for**: General debugging information useful during development

**Behavior**:
- ✅ Always logged to console in development
- ✅ Sent to Sentry ONLY in development
- ❌ Not sent to Sentry in production (reduces noise)

**Example**:
```typescript
import { logDebug } from "../../common/sentryHelper";

logDebug("Loading tool from registry", { toolId, version: "1.2.3" });
```

### logInfo() - Informational Messages

**Use for**: Important application events that should be tracked in all environments

**Behavior**:
- ✅ Always logged to console in all environments
- ✅ Sent to Sentry in all environments (as breadcrumbs, not Issues)

**Example**:
```typescript
import { logInfo } from "../../common/sentryHelper";

logInfo("User settings loaded successfully", { userId: "abc123" });
logInfo("Tool launched", { toolId: "tool-example", instanceId });
```

### logWarn() - Warning Conditions

**Use for**: Warning conditions that should be reviewed but don't prevent operation

**Behavior**:
- ✅ Always logged to console in all environments
- ✅ Sent to Sentry in all environments

**Example**:
```typescript
import { logWarn } from "../../common/sentryHelper";

logWarn("Connection token expired", { connectionId, connectionName });
logWarn("Failed to resolve connection", { connectionId, error: error.message });
```

### logError() - Error Conditions

**Use for**: Error conditions that need attention but may be recoverable

**Behavior**:
- ✅ Always logged to console in all environments
- ✅ Sent to Sentry in all environments

**Example**:
```typescript
import { logError } from "../../common/sentryHelper";

logError("Failed to load tool", { toolId, error: error.message });
logError("Connection test failed", { connectionId, statusCode: 401 });
```

### logFatal() - Critical Errors

**Use for**: Critical errors that require immediate attention

**Behavior**:
- ✅ Always logged to console in all environments
- ✅ Sent to Sentry in all environments

**Example**:
```typescript
import { logFatal } from "../../common/sentryHelper";

logFatal("Application initialization failed", { reason: "Cannot load settings" });
```

## Exception Handling

### captureException()

**Use for**: Capturing caught exceptions with full context

**Example**:
```typescript
import { captureException } from "../../common/sentryHelper";

try {
    await loadTool(toolId);
} catch (error) {
    captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: {
            operation: "loadTool",
            toolId,
        },
        extra: {
            timestamp: new Date().toISOString(),
        },
        level: "error",
    });
    throw error;
}
```

### captureMessage()

**Use for**: Capturing error/warning messages without an exception object
**Note**: Only use for error/warning/fatal levels. For info/debug, use log functions instead.

**Example**:
```typescript
import { captureMessage } from "../../common/sentryHelper";

captureMessage("Invalid configuration detected", "warning", {
    tags: {
        module: "settings",
    },
    extra: {
        configKey: "terminalFont",
        configValue: invalidValue,
    },
});
```

## Additional Logging Utilities

### addBreadcrumb()

**Use for**: Adding context breadcrumbs that help recreate the sequence of events

**Example**:
```typescript
import { addBreadcrumb } from "../../common/sentryHelper";

addBreadcrumb("User initiated connection test", "user-action", "info", {
    connectionId,
    connectionType: "interactive",
});
```

### logCheckpoint()

**Use for**: Critical application flow checkpoints

**Behavior**:
- Logs to console
- Logs to Sentry via logInfo
- Adds a breadcrumb

**Example**:
```typescript
import { logCheckpoint } from "../../common/sentryHelper";

logCheckpoint("Application initialized", { version: app.getVersion() });
logCheckpoint("Tool system ready", { toolCount: tools.length });
```

### wrapAsyncOperation()

**Use for**: Wrapping critical async operations with automatic error capture and performance tracking

**Example**:
```typescript
import { wrapAsyncOperation } from "../../common/sentryHelper";

const loadUserSettings = () => wrapAsyncOperation(
    "loadUserSettings",
    async () => {
        const settings = await settingsManager.get();
        return settings;
    },
    {
        tags: { module: "settings" },
        extra: { source: "initialization" },
    }
);
```

## What NOT to Do

### ❌ Don't Use console.* in Production Code

```typescript
// BAD - No telemetry, not environment-aware
console.log("User logged in");
console.warn("Connection failed");
console.error("Tool crashed");

// GOOD - Proper logging with telemetry
logInfo("User logged in", { userId });
logWarn("Connection failed", { connectionId, reason });
logError("Tool crashed", { toolId, error: error.message });
```

**Exception**: console.* can be used in:
- Injected script strings for modals (no access to sentryHelper)
- Temporary debugging during development (with clear TODO comment)

### ❌ Don't Log Sensitive Data

```typescript
// BAD - Logging sensitive credentials
logInfo("User authenticated", { username, password, accessToken });

// GOOD - Log without sensitive data
logInfo("User authenticated", { username, authType: "interactive" });
```

### ❌ Don't Over-log in Production

```typescript
// BAD - Too verbose for production
logInfo("Processing item 1 of 1000");
logInfo("Processing item 2 of 1000");
// ... creates 1000 Sentry events

// GOOD - Use debug level or batch logging
logDebug("Processing batch", { startIndex: 0, endIndex: 1000 });
logInfo("Batch processing complete", { itemCount: 1000, duration: "2.5s" });
```

## Sentry Configuration

### Main Process (`src/main/index.ts`)

```typescript
Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    tracesSampleRate: sentryConfig.tracesSampleRate,
    // Only enable structured logging in development to reduce noise
    enableLogs: sentryConfig.environment === "development",
    integrations: [
        Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
        // ... other integrations
    ],
});
```

### Renderer Process (`src/renderer/modules/initialization.ts`)

```typescript
Sentry.init({
    dsn: sentryConfig.dsn,
    environment: sentryConfig.environment,
    release: sentryConfig.release,
    // Only enable structured logging in development to reduce noise
    enableLogs: sentryConfig.environment === "development",
    integrations: [
        Sentry.captureConsoleIntegration({ levels: ["error", "warn"] }),
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration(),
    ],
});
```

## Benefits of This Approach

1. **Reduced Telemetry Noise**: Only critical logs sent to Sentry in production
2. **Easy Debugging**: All logs visible in console for local development
3. **Environment-Aware**: Automatically adjusts verbosity based on environment
4. **Centralized**: Single source of truth for logging configuration
5. **Contextual**: Machine ID and tags automatically added to all events
6. **Performance Tracking**: Built-in support for operation timing and breadcrumbs

## Migration Guide

If you find code using old logging patterns:

### Before
```typescript
console.log("Loading tool:", toolId);
console.warn("Connection expired");
Sentry.captureMessage("Tool loaded", "info"); // Creates Sentry Issue unnecessarily
```

### After
```typescript
import { logDebug, logWarn } from "../../common/sentryHelper";

logDebug("Loading tool", { toolId }); // Console + Sentry in dev only
logWarn("Connection expired", { connectionId }); // Console + Sentry always
// Don't use captureMessage for info - it creates Issues
```

## Questions?

For questions about logging:
1. Check this document first
2. Review `src/common/sentryHelper.ts` for implementation details
3. Look at existing usage in `src/main/index.ts` or `src/renderer/modules/initialization.ts`
4. Ask the team in discussions
