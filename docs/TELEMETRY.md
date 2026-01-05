# Telemetry and Application Insights

This document describes the telemetry and monitoring capabilities of Power Platform Tool Box using Azure Application Insights.

## Overview

Power Platform Tool Box uses [Azure Application Insights](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview) for application monitoring, telemetry tracking, and diagnostics. The implementation provides:

- **Application lifecycle tracking** (start, ready, quit)
- **User operation tracking** (tool installs, connection management, etc.)
- **Error and exception tracking** (automatic and manual)
- **Performance metrics** (custom metrics and automatic performance counters)
- **Structured logging** with severity levels
- **Privacy-first approach** (machine ID based, no PII collected)

## Configuration

### Environment Variables

Telemetry is **optional** and requires an Azure Application Insights connection string to be configured:

1. Create a `.env` file in the project root (or copy `.env.example`)
2. Add your Application Insights connection string:

```bash
APPINSIGHTS_CONNECTION_STRING=InstrumentationKey=00000000-0000-0000-0000-000000000000;IngestionEndpoint=https://region.applicationinsights.azure.com/;LiveEndpoint=https://region.livediagnostics.monitor.azure.com/
```

**Note**: If no connection string is provided, the application will run normally but telemetry will be disabled.

### Getting a Connection String

1. Create an Azure Application Insights resource in the [Azure Portal](https://portal.azure.com)
2. Navigate to your Application Insights resource
3. Go to **Settings** → **Properties**
4. Copy the **Connection String** value

## Architecture

### TelemetryManager

The `TelemetryManager` class (`src/main/managers/telemetryManager.ts`) is the central component for all telemetry operations:

```typescript
export class TelemetryManager {
    // Track custom events
    trackEvent(eventName: TelemetryEvent | string, properties?: TelemetryProperties, metrics?: TelemetryMetrics): void

    // Track exceptions/errors
    trackException(error: Error, properties?: TelemetryProperties): void

    // Track log messages with severity
    trackTrace(message: string, level: LogLevel, properties?: TelemetryProperties): void

    // Track custom metrics
    trackMetric(name: string, value: number, properties?: TelemetryProperties): void

    // Check if telemetry is enabled
    isActive(): boolean
}
```

### Common Properties

All telemetry data includes these common properties automatically:

- `appVersion` - Current application version
- `sessionId` - Unique session identifier
- `machineId` - Anonymized machine identifier (UUID, persisted across sessions)
- `platform` - Operating system (win32, darwin, linux)
- `arch` - CPU architecture (x64, arm64, etc.)
- `nodeVersion` - Node.js version
- `electronVersion` - Electron version

## Tracked Events

### Application Lifecycle

| Event | Properties | Description |
|-------|-----------|-------------|
| `app_started` | `version`, `platform`, `arch` | Application started |
| `app_ready` | `version` | Application ready for user interaction |
| `app_quit` | `version` | Application shutting down |

### Tool Operations

| Event | Properties | Description |
|-------|-----------|-------------|
| `tool_installed` | `toolId`, `source`, `toolVersion` | Tool successfully installed |
| `tool_uninstalled` | `packageName`, `toolId` | Tool uninstalled |
| `tool_loaded` | `toolId`, `toolName`, `toolVersion` | Tool loaded and activated |
| `tool_unloaded` | `toolId`, `toolName` | Tool unloaded |

### Connection Operations

| Event | Properties | Description |
|-------|-----------|-------------|
| `connection_created` | `connectionId`, `authenticationType`, `environmentType` | New connection created |
| `connection_updated` | `connectionId` | Connection updated |
| `connection_deleted` | `connectionId` | Connection deleted |
| `connection_authenticated` | `connectionId`, `authenticationType` | Successful authentication |
| `connection_test_success` | `authenticationType` | Test connection succeeded |
| `connection_test_failed` | `authenticationType`, `error` | Test connection failed |
| `token_refreshed` | `connectionId` | Access token refreshed successfully |
| `token_refresh_failed` | `connectionId` | Token refresh failed (exception tracked) |

### Terminal Operations

| Event | Properties | Description |
|-------|-----------|-------------|
| `terminal_created` | `terminalId`, `shell` | Terminal session created |
| `terminal_closed` | `terminalId` | Terminal session closed |

### Update Operations

| Event | Properties | Description |
|-------|-----------|-------------|
| `update_available` | `newVersion`, `currentVersion` | New version available |
| `update_downloaded` | `version` | Update downloaded and ready |
| `update_error` | (exception tracked) | Update check or download failed |

### Error Tracking

| Event | Properties | Description |
|-------|-----------|-------------|
| `unhandled_error` | `handled: false` | Uncaught exception in main process |
| `unhandled_rejection` | `handled: false` | Unhandled promise rejection |

## Exception Tracking

All exceptions are automatically tracked with full stack traces and custom properties:

```typescript
// Automatic tracking of unhandled errors
process.on('uncaughtException', (error) => {
    telemetryManager.trackException(error, {
        event: 'unhandled_error',
        handled: false
    });
});

// Manual exception tracking in try-catch blocks
try {
    await someOperation();
} catch (error) {
    telemetryManager.trackException(error as Error, {
        operation: 'someOperation',
        context: 'additional context'
    });
    throw error;
}
```

## Structured Logging

Use `trackTrace()` for structured logging with severity levels:

```typescript
enum LogLevel {
    VERBOSE = "verbose",    // Detailed diagnostic information
    INFO = "info",         // General informational messages
    WARNING = "warning",   // Warning messages for non-critical issues
    ERROR = "error",       // Error messages for failures
    CRITICAL = "critical"  // Critical failures requiring immediate attention
}

// Example usage
telemetryManager.trackTrace("Operation completed successfully", LogLevel.INFO, {
    operationName: "toolInstall",
    duration: 1234
});

telemetryManager.trackTrace("Connection timeout", LogLevel.WARNING, {
    connectionId: "conn-123",
    timeoutMs: 5000
});
```

## Custom Metrics

Track custom performance metrics and counters:

```typescript
// Track operation duration
const startTime = Date.now();
await performOperation();
const duration = Date.now() - startTime;

telemetryManager.trackMetric("operation_duration_ms", duration, {
    operationType: "install",
    toolId: "tool-123"
});

// Track counter values
telemetryManager.trackMetric("active_connections", connectionCount);
telemetryManager.trackMetric("installed_tools", toolCount);
```

## Privacy and Security

### Data Collection

The telemetry system is designed with privacy in mind:

✅ **Collected**:
- Application version, platform, architecture
- Anonymous machine ID (UUID, generated once per installation)
- Event names and timestamps
- Performance metrics (duration, counts)
- Exception types and stack traces
- Connection types (but not URLs or credentials)

❌ **NOT Collected**:
- Personal Identifiable Information (PII)
- Connection URLs or environment URLs
- User credentials or tokens
- Dataverse record data
- Connection names or descriptions
- File paths with usernames

### Machine ID

The machine ID is a randomly generated UUID that:
- Uniquely identifies an installation
- Persists across app restarts
- Is stored in the app's settings
- Cannot be used to identify a user or machine outside the app
- Allows tracking of unique active users without PII

### Opt-Out

Telemetry is automatically disabled if:
- No Application Insights connection string is configured
- The connection string is empty or invalid

## Development and Testing

### Local Development

During development, telemetry can be enabled or disabled:

1. **Disabled** (default): Don't set `APPINSIGHTS_CONNECTION_STRING` in `.env`
2. **Enabled**: Set a valid connection string in `.env`

### Testing Telemetry

To test telemetry locally:

```bash
# 1. Set up Application Insights connection string
echo 'APPINSIGHTS_CONNECTION_STRING=your-connection-string' >> .env

# 2. Build and run the app
pnpm run build
pnpm run dev

# 3. Perform actions (install tools, create connections, etc.)

# 4. Check Application Insights portal for events (may take 1-3 minutes to appear)
```

### Debugging

Enable console logging to see telemetry operations:

```typescript
// Telemetry operations log to console:
// [Telemetry] Application Insights initialized successfully
// [Telemetry] Application Insights connection string not provided. Telemetry disabled.
```

## Monitoring in Azure Portal

### Key Metrics to Monitor

1. **User Adoption**:
   - `app_started` events - Daily/monthly active installations
   - Unique `machineId` count - Active user base

2. **Tool Usage**:
   - `tool_installed` events - Most popular tools
   - `tool_loaded` events - Actual tool usage

3. **Connection Health**:
   - `connection_authenticated` success rate
   - `token_refresh_failed` frequency
   - `connection_test_failed` error messages

4. **Application Stability**:
   - `unhandled_error` and `unhandled_rejection` count
   - Exception rate by version
   - Update adoption rate

5. **Performance**:
   - Custom metrics (operation durations)
   - Dependency tracking (npm installs, API calls)
   - Performance counters (CPU, memory)

### Creating Dashboards

Use Azure Portal to create dashboards with:

1. **Usage Dashboard**:
   - Daily active users (unique `machineId` per day)
   - Tool installation trends
   - Platform distribution

2. **Health Dashboard**:
   - Exception count and rate
   - Failed operations
   - Token refresh failures

3. **Performance Dashboard**:
   - Operation duration metrics
   - Tool installation times
   - Connection authentication times

## Best Practices

### When to Track Events

✅ **Do track**:
- User-initiated operations (install, uninstall, connect)
- Operation success and failure
- Application lifecycle events
- Performance-impacting operations

❌ **Don't track**:
- Every user interaction (e.g., button clicks)
- High-frequency events (e.g., terminal output)
- Events with PII
- Test/debug operations in production

### Adding New Telemetry

When adding new tracked events:

1. Define the event in `TelemetryEvent` enum
2. Add clear property names and types
3. Include context properties for debugging
4. Document in this file
5. Test that PII is not included

Example:

```typescript
// 1. Add to TelemetryEvent enum
export enum TelemetryEvent {
    // ... existing events
    CUSTOM_FEATURE_USED = "custom_feature_used",
}

// 2. Track the event with properties
this.telemetryManager.trackEvent(TelemetryEvent.CUSTOM_FEATURE_USED, {
    featureName: "my-feature",
    optionSelected: "option-a",
    duration: 123
});

// 3. Update this documentation
```

## Troubleshooting

### Telemetry Not Working

1. **Check connection string**: Ensure `APPINSIGHTS_CONNECTION_STRING` is set in `.env`
2. **Build the app**: Run `pnpm run build` to inject the connection string
3. **Check logs**: Look for initialization messages in console
4. **Verify Application Insights**: Check Azure Portal for resource health
5. **Wait for data**: Events may take 1-3 minutes to appear in portal

### Common Issues

| Issue | Solution |
|-------|----------|
| "Telemetry disabled" message | Set `APPINSIGHTS_CONNECTION_STRING` in `.env` and rebuild |
| Events not in portal | Wait 1-3 minutes, check Application Insights resource status |
| Build fails | Check connection string format, ensure no special characters in `.env` |
| High data volume | Reduce tracked event frequency, use sampling if needed |

## Future Enhancements

Potential improvements for the telemetry system:

1. **User Consent**: Add opt-in/opt-out UI for telemetry
2. **Sampling**: Implement sampling for high-frequency events
3. **Custom Dimensions**: Add more contextual properties
4. **Alerts**: Set up Azure alerts for critical errors
5. **A/B Testing**: Track feature flag usage
6. **Session Replay**: Add detailed session information
7. **Performance Profiling**: Add more granular performance metrics

## References

- [Azure Application Insights Documentation](https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview)
- [Application Insights Node.js SDK](https://github.com/microsoft/ApplicationInsights-node.js)
- [Telemetry Data Model](https://learn.microsoft.com/en-us/azure/azure-monitor/app/data-model)
- [Privacy and GDPR](https://learn.microsoft.com/en-us/azure/azure-monitor/logs/personal-data-mgmt)
