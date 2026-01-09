# Sentry Dashboard Queries and Configuration Guide

This document provides queries and steps to create meaningful dashboards for the Power Platform Tool Box desktop application in Sentry.io.

## Overview

The application uses comprehensive Sentry telemetry with:
- **Structured Logging**: All logs at 6 severity levels (trace, debug, info, warn, error, fatal)
- **Breadcrumb-Based Tracing**: Performance tracking for critical async operations via breadcrumbs
- **Console Capture Integration**: Automatic capture of console errors/warnings
- **Machine ID Tracking**: All events tagged with machine ID for per-installation analysis

## Data Sources in Sentry

### Logs Tab
- Structured logs from `Sentry.logger` API (trace, debug, info, warn, error, fatal)
- Console errors and warnings via `captureConsoleIntegration`
- All checkpoint logs (20+ throughout app)
- Exception logs with severity levels

### Breadcrumbs Tab
- Checkpoint breadcrumbs showing application state transitions
- Operation start/completion timing with duration
- HTTP request traces (main process)
- Browser navigation and interaction traces (renderer)
- Custom operation breadcrumbs with context data

### Issues Tab
- Captured exceptions with full context
- Error grouping by message and stack trace
- Session replay data (when errors occur)

## Table of Contents
1. [Key Metrics to Track](#key-metrics-to-track)
2. [Logs Queries](#logs-queries)
3. [Error Monitoring Queries](#error-monitoring-queries)
4. [Performance Monitoring Queries (Breadcrumbs)](#performance-monitoring-queries-breadcrumbs)
5. [User Experience Queries](#user-experience-queries)
6. [Dashboard Setup Steps](#dashboard-setup-steps)
7. [Alert Configuration](#alert-configuration)

## Key Metrics to Track

### Critical Metrics
- **Error Rate**: Errors per user session (Issues/Logs)
- **Crash Rate**: Application crashes by version (Issues)
- **Performance**: Operation durations from breadcrumbs (Breadcrumbs)
- **User Impact**: Number of unique machines affected by errors (Issues/Logs)
- **Session Health**: Percentage of healthy vs errored sessions (Issues)
- **Log Volume**: Structured log entries by severity (Logs)

### Process-Specific Metrics
- **Main Process**: Initialization failures, IPC errors, manager failures (Logs/Issues)
- **Renderer Process**: UI errors, tool loading failures, connection errors (Logs/Issues)

### What's Tracked Where
| Metric Type | Data Source | Example |
|-------------|-------------|---------|
| Structured Logs | **Logs Tab** | Checkpoint logs, operation status, debug info |
| Errors & Exceptions | **Issues Tab** | Captured exceptions with context |
| Performance Timing | **Breadcrumbs** | Operation duration, HTTP requests |
| Console Output | **Logs Tab** | console.error(), console.warn() |
| User Actions | **Breadcrumbs** | Click sequences, navigation |

## Logs Queries

**Data Source**: Sentry **Logs Tab**

### 1. Structured Logs by Severity
**Query**: 
```
level:info OR level:warn OR level:error OR level:fatal
```
**Group By**: `level`
**Visualization**: Stacked Bar Chart
**Purpose**: Monitor log volume and severity distribution over time
**Note**: Uses structured logger API (logInfo, logWarn, logError, logFatal)

### 2. Checkpoint Logs (Application Flow)
**Query**:
```
message:"*checkpoint*" OR message:"*started" OR message:"*completed"
```
**Visualization**: Timeline
**Purpose**: Track application initialization and operation flow
**Contains**: All logCheckpoint() calls (20+ throughout app)

### 3. Error Logs by Machine ID
**Query**: 
```
level:error OR level:fatal
```
**Group By**: `machine_id`
**Visualization**: Table
**Purpose**: Identify machines with most error logs

### 4. Debug/Trace Logs (Development)
**Query**:
```
level:debug OR level:trace
```
**Time Range**: Recent (last 1 hour)
**Purpose**: Detailed diagnostic information for troubleshooting
**Note**: High volume - useful for specific debugging sessions

### 5. Console Capture Logs
**Query**:
```
logger:"console"
```
**Purpose**: View captured console.error() and console.warn() calls
**Note**: Automatic capture via captureConsoleIntegration

### 6. Operation Status Logs
**Query**:
```
message:"*operation*" (message:"*started" OR message:"*completed" OR message:"*failed")
```
**Purpose**: Track async operation execution status
**Includes**: wrapAsyncOperation logs with start/completion/failure

## Error Monitoring Queries

**Data Source**: Sentry **Issues Tab**

### 1. Errors by Machine ID
**Query**: 
```
is:unresolved
```
**Group By**: `machine_id`
**Visualization**: Table
**Sort By**: Event count (desc)
**Purpose**: Identify which machines are experiencing the most errors
**Columns**: Machine ID, Error Count, Last Seen, Unique Errors

### 2. Errors by Phase
**Query**:
```
is:unresolved
```
**Group By**: `tags.phase`
**Visualization**: Bar Chart
**Purpose**: Identify which initialization/operation phase has the most errors
**Key Phases**:
- `construction` - App constructor failures
- `initialization` - Main app initialization
- `tool_loading` - Tool registry loading
- `renderer_initialization` - Renderer process startup
- `connections_loading` - Connection loading failures
- `session_restore` - Session restoration issues
- `tool_launch` - Tool launching errors
- `tool_management` - Tool switching/closing errors

### 3. Main vs Renderer Process Errors
**Query**:
```
is:unresolved
```
**Group By**: `tags.process`
**Values**: `main` or `renderer`
**Visualization**: Pie Chart
**Purpose**: Understand error distribution between Electron processes

### 4. Critical/Fatal Exceptions
**Query**:
```
is:unresolved level:fatal
```
**Sort By**: Timestamp (desc)
**Purpose**: Monitor severe errors that need immediate attention
**Note**: These are captured via captureException with "fatal" severity

### 5. Errors with Session Replay
**Query**:
```
is:unresolved has:replay
```
**Purpose**: Prioritize errors with session replay for easier debugging
**Action**: Review replay to see exact user actions leading to error

### 6. Top Error Messages
**Query**:
```
is:unresolved
```
**Group By**: `message`
**Visualization**: Table
**Sort By**: Count (desc)
**Purpose**: Identify the most common error messages

### 7. Errors by Operation Type
**Query**:
```
is:unresolved tags.instanceId:*
```
**Group By**: Operation name from breadcrumbs
**Purpose**: Track which async operations fail most frequently
**Operations**: load_tools, load_marketplace, load_connections, restore_session, etc.

## Performance Monitoring Queries (Breadcrumbs)

**Data Source**: Sentry **Breadcrumbs** (within Issues or via Discover)

**Note**: Performance tracking uses breadcrumb-based approach for universal SDK compatibility. Operations wrapped in `wrapAsyncOperation` create breadcrumbs with timing data.

### 1. Critical Async Operations Timing
**Query in Discover**:
```
breadcrumbs.message:"*operation completed*" OR breadcrumbs.message:"*operation failed*"
```
**Group By**: Operation name
**Metrics**: Duration from breadcrumb data
**Purpose**: Monitor performance of 7 critical operations:
- `load_initial_settings` - Initial settings load
- `load_tools_library` - Registry tools loading
- `load_sidebar_tools` - Sidebar tools loading
- `load_marketplace` - Marketplace data loading
- `load_sidebar_connections` - Connections loading
- `update_footer_connection` - Footer status update
- `load_homepage_data` - Homepage data loading
- `restore_session` - Session restoration

### 2. Operation Success vs Failure Rate
**Find in Issue Details**: Look at breadcrumbs
**Pattern**: 
- Success: `"[operation_name] operation completed"` with `status: "success"`
- Failure: `"[operation_name] operation failed"` with `status: "failure"`
**Purpose**: Track reliability of critical operations
**View**: Check breadcrumbs in any error event to see operation outcomes

### 3. HTTP Request Performance (Main Process)
**Data Source**: Breadcrumbs from `httpIntegration()`
**Pattern**: HTTP request breadcrumbs with:
- URL
- Method
- Status code
- Duration
**Purpose**: Monitor API call performance in main process
**View**: Breadcrumbs show all HTTP requests with timing

### 4. Browser Performance (Renderer Process)
**Data Source**: Breadcrumbs from `browserTracingIntegration()`
**Metrics**:
- Page navigation timing
- Long task detection
- Interaction to Next Paint (INP)
**Purpose**: Monitor UI responsiveness
**View**: Breadcrumbs show browser navigation and interaction timing

### 5. Initialization Sequence Timing
**Method**: Review breadcrumbs for initialization phase
**Checkpoints**:
1. `ToolBoxApp constructor started`
2. `ToolBoxApp constructor completed`
3. `Main process initialization started`
4. `Managers initialized`
5. `Window created`
6. `Renderer initialization started`
7. `Tools loaded`
8. `Connections loaded`
9. `Homepage loaded`
**Purpose**: Identify bottlenecks in app startup
**View**: Check breadcrumb timestamps to calculate time between checkpoints

### 6. Slowest Operations by Machine
**Query**:
```
breadcrumbs.message:"*operation completed*"
```
**Group By**: `machine_id`, operation name
**Sort By**: Duration (desc)
**Purpose**: Identify machines with performance issues
**Note**: Duration is in breadcrumb data field

### 7. Operation Timing Distribution
**Analysis**: Export breadcrumb data for operations
**Calculate**: p50, p75, p95, p99 of operation durations
**Purpose**: Establish performance baselines and identify outliers
**Visualization**: Histogram of operation durations

## User Experience Queries

**Data Sources**: Mix of **Issues**, **Logs**, and **Breadcrumbs**

### 1. Machines by Error Count (Issues)
**Query**:
```
is:unresolved
```
**Group By**: `machine_id`
**Sort By**: Count (desc)
**Purpose**: Identify problematic installations
**Action**: Prioritize support for machines with highest error counts

### 2. Machines by Log Volume (Logs)
**Query**:
```
level:error OR level:fatal
```
**Group By**: `machine_id`
**Time Range**: Last 24 hours
**Purpose**: Track which machines are logging the most errors

### 3. Session Replay Analysis (Issues)
**Query**:
```
is:unresolved has:replay
```
**Purpose**: Errors with session replays for detailed debugging
**Replay Capture**: 100% on errors, 10% of normal sessions (prod)
**Note**: All text masked, all media blocked for privacy

### 4. Platform Distribution (Issues)
**Query**:
```
is:unresolved
```
**Group By**: `contexts.os.name`
**Visualization**: Pie Chart
**Purpose**: Identify platform-specific issues (Windows/macOS/Linux)

### 5. Healthy vs Errored Sessions (Issues + Logs)
**Method**: Compare metrics:
- Total unique machines: Count unique `machine_id` in Logs
- Machines with errors: Count unique `machine_id` in Issues
**Calculation**: (Machines without errors / Total machines) × 100%
**Purpose**: Overall application health metric

### 6. First-Time Errors (Issues)
**Query**:
```
is:unresolved firstSeen:>24h
```
**Purpose**: Catch new error types early
**Action**: Investigate new errors quickly to prevent spread

### 7. User Journey Analysis (Breadcrumbs)
**Method**: Review breadcrumbs for any issue
**Shows**:
- Sequence of checkpoint logs
- Operations attempted before error
- Timing between actions
- Machine ID for correlation
**Purpose**: Understand what users were doing when errors occurred

### 8. Error-Free Usage Patterns (Logs)
**Query**:
```
level:info message:"*checkpoint*"
```
**Filter**: Exclude sessions with errors
**Purpose**: Understand normal usage patterns to compare against errored sessions

## Dashboard Setup Steps

### Dashboard 1: Error & Issue Monitoring (Main Dashboard)

**Purpose**: Primary dashboard for tracking errors and application health

#### Step 1: Create Dashboard
1. Navigate to **Dashboards** in Sentry
2. Click **Create Dashboard**
3. Name it "Power Platform Tool Box - Error Monitoring"

#### Step 2: Add Widgets

##### Widget 1: Error Rate Over Time (Issues)
- **Type**: Line Chart
- **Data Source**: Issues
- **Query**: `is:unresolved`
- **Y-Axis**: Count of issues
- **X-Axis**: Time (1 hour intervals)
- **Size**: Full width
- **Purpose**: Spot error trends and spikes

##### Widget 2: Top Errors by Machine (Issues)
- **Type**: Table
- **Data Source**: Issues
- **Query**: `is:unresolved`
- **Columns**: Machine ID, Error Count, Unique Issues, Last Seen
- **Group By**: `machine_id`
- **Sort**: Count desc
- **Limit**: 20
- **Size**: Half width
- **Purpose**: Identify problematic installations

##### Widget 3: Errors by Phase (Issues)
- **Type**: Bar Chart
- **Data Source**: Issues
- **Query**: `is:unresolved`
- **Group By**: `tags.phase`
- **Size**: Half width
- **Purpose**: Identify problem areas in app lifecycle

##### Widget 4: Process Distribution (Issues)
- **Type**: Pie Chart
- **Data Source**: Issues
- **Query**: `is:unresolved`
- **Group By**: `tags.process`
- **Values**: main, renderer
- **Size**: Quarter width
- **Purpose**: Main vs Renderer error distribution

##### Widget 5: Platform Distribution (Issues)
- **Type**: Pie Chart
- **Data Source**: Issues
- **Query**: `is:unresolved`
- **Group By**: `contexts.os.name`
- **Size**: Quarter width
- **Purpose**: OS-specific issues

##### Widget 6: Critical Errors (Issues)
- **Type**: Table
- **Data Source**: Issues
- **Query**: `is:unresolved level:fatal`
- **Columns**: Message, Machine ID, Timestamp, Phase, Has Replay
- **Sort**: Timestamp desc
- **Limit**: 10
- **Size**: Half width
- **Purpose**: Immediate attention items

##### Widget 7: Errors with Replay (Issues)
- **Type**: Number
- **Data Source**: Issues
- **Query**: `is:unresolved has:replay`
- **Display**: Count and percentage
- **Size**: Quarter width
- **Purpose**: Track replay capture rate

##### Widget 8: New Errors (24h) (Issues)
- **Type**: Number
- **Data Source**: Issues
- **Query**: `is:unresolved firstSeen:>24h`
- **Display**: Count
- **Size**: Quarter width
- **Purpose**: Monitor new error types

### Dashboard 2: Structured Logging Dashboard

**Purpose**: Monitor application logging and diagnostic data

#### Widgets

##### Widget 1: Log Volume by Severity (Logs)
- **Type**: Stacked Bar Chart
- **Data Source**: Logs
- **Query**: None (all logs)
- **Group By**: `level`
- **X-Axis**: Time (1 hour intervals)
- **Size**: Full width
- **Purpose**: Monitor logging patterns

##### Widget 2: Error Logs by Machine (Logs)
- **Type**: Table
- **Data Source**: Logs
- **Query**: `level:error OR level:fatal`
- **Columns**: Machine ID, Log Count, Last Seen
- **Group By**: `machine_id`
- **Sort**: Count desc
- **Size**: Half width

##### Widget 3: Recent Error Logs (Logs)
- **Type**: Table
- **Data Source**: Logs
- **Query**: `level:error OR level:fatal`
- **Columns**: Message, Machine ID, Level, Timestamp
- **Sort**: Timestamp desc
- **Limit**: 20
- **Size**: Half width

##### Widget 4: Checkpoint Logs (Logs)
- **Type**: Timeline
- **Data Source**: Logs
- **Query**: `message:"*checkpoint*"`
- **Display**: Event timeline
- **Size**: Full width
- **Purpose**: Visualize app initialization flow

##### Widget 5: Console Capture (Logs)
- **Type**: Table
- **Data Source**: Logs
- **Query**: `logger:"console"`
- **Size**: Full width
- **Purpose**: Monitor console output

### Dashboard 3: Performance & Operations Dashboard

**Purpose**: Monitor operation timing and performance via breadcrumbs

#### Widgets

##### Widget 1: Operation Success Rate
- **Type**: Table
- **Data Source**: Issues with breadcrumbs
- **Method**: Manual analysis of breadcrumbs
- **Metrics**: Success vs failure rate per operation
- **Size**: Half width
- **Note**: Requires custom analysis of breadcrumb data

##### Widget 2: Critical Operations Timeline
- **Type**: Timeline
- **Data Source**: Breadcrumbs
- **Filter**: Issues containing operation breadcrumbs
- **Display**: Operation sequence and timing
- **Size**: Full width

##### Widget 3: HTTP Performance (Main Process)
- **Type**: Table
- **Data Source**: Breadcrumbs
- **Filter**: HTTP request breadcrumbs
- **Display**: URL, method, duration, status
- **Size**: Half width
- **Note**: Visible in issue breadcrumbs

##### Widget 4: Slowest Machines
- **Type**: Table
- **Data Source**: Breadcrumbs analysis
- **Group By**: `machine_id`
- **Metric**: Average operation duration
- **Size**: Half width

### Dashboard 4: Main Process Dashboard

**Filter**: Apply `tags.process:main` to all widgets

#### Widgets
- Error rate over time (Issues)
- Top error messages (Issues)
- Errors by phase (construction, initialization, tool_loading) (Issues)
- HTTP requests performance (Breadcrumbs)
- Manager initialization logs (Logs: `message:"*Manager*"`)

### Dashboard 5: Renderer Process Dashboard

**Filter**: Apply `tags.process:renderer` to all widgets

#### Widgets
- Error rate over time (Issues)
- Tool management errors (Issues: `tags.phase:tool_*`)
- UI component errors (Issues)
- Browser performance metrics (Breadcrumbs)
- Renderer initialization logs (Logs: `message:"*renderer*initialization*"`)

## Alert Configuration

### Critical Alerts (Issues)

#### Alert 1: High Error Rate
- **Data Source**: Issues
- **Condition**: New issue count > 50 in 1 hour
- **Action**: Email team, Slack notification
- **Query**: `is:unresolved`
- **Purpose**: Detect error spikes immediately

#### Alert 2: Fatal Errors
- **Data Source**: Issues
- **Condition**: Any new issue with level:fatal
- **Action**: Immediate Slack notification
- **Query**: `is:unresolved level:fatal`
- **Purpose**: Critical errors need immediate attention

#### Alert 3: Initialization Failure Spike
- **Data Source**: Issues
- **Condition**: >10 new issues in 15 minutes
- **Action**: Email team
- **Query**: `is:unresolved (tags.phase:initialization OR tags.phase:construction OR tags.phase:renderer_initialization)`
- **Purpose**: App startup failures affect all users

#### Alert 4: Multiple Machines Affected
- **Data Source**: Issues
- **Condition**: Any issue affecting >10 unique machines
- **Action**: Email team, Slack notification
- **Query**: Custom - monitor unique machine_id count per issue
- **Purpose**: Widespread issues need immediate attention

### Warning Alerts (Issues)

#### Alert 5: Tool Loading Failures
- **Data Source**: Issues
- **Condition**: >5 new tool-related issues in 1 hour
- **Action**: Email notification
- **Query**: `is:unresolved tags.phase:tool_loading OR tags.phase:tool_launch OR tags.phase:tool_management`
- **Purpose**: Tool functionality is core feature

#### Alert 6: Connection Issues
- **Data Source**: Issues
- **Condition**: >20 connection errors in 1 hour
- **Action**: Email notification
- **Query**: `is:unresolved tags.phase:connections_loading`
- **Purpose**: Dataverse connectivity is critical

#### Alert 7: Session Restore Failures
- **Data Source**: Issues
- **Condition**: >10 session restore failures in 1 hour
- **Action**: Email notification
- **Query**: `is:unresolved tags.phase:session_restore`
- **Purpose**: Users expect seamless session continuation

### Log Volume Alerts (Logs)

#### Alert 8: Error Log Spike
- **Data Source**: Logs
- **Condition**: >200 error/fatal logs in 15 minutes
- **Action**: Email notification
- **Query**: `level:error OR level:fatal`
- **Purpose**: High error log volume may indicate systemic issues

#### Alert 9: Excessive Warning Logs
- **Data Source**: Logs
- **Condition**: >1000 warning logs in 1 hour
- **Action**: Email notification (low priority)
- **Query**: `level:warn`
- **Purpose**: Warnings may indicate degraded performance

## Advanced Queries

### Issues Tab Queries

#### Find Errors Without Replay
**Data Source**: Issues
```
is:unresolved !has:replay
```
**Purpose**: Identify errors that need better reproduction info
**Action**: Review breadcrumbs and logs for these errors

#### Errors Affecting Multiple Machines
**Data Source**: Issues
```
is:unresolved
```
**Group By**: `message`
**Filter**: Issues with >5 unique machine_id values
**Purpose**: Find widespread issues that need priority fixing

#### Errors by Version
**Data Source**: Issues
```
is:unresolved
```
**Group By**: `release`
**Purpose**: Track error rates across versions
**Use Case**: Identify regressions in new releases

#### New Errors in Latest Release
**Data Source**: Issues
```
is:unresolved release:latest firstSeen:>7d
```
**Purpose**: Catch new errors introduced in recent releases

### Logs Tab Queries

#### High-Frequency Error Logs
**Data Source**: Logs
```
level:error
```
**Group By**: `message`
**Sort By**: Count desc
**Purpose**: Find the most common logged errors

#### Debug Logs for Specific Machine
**Data Source**: Logs
```
machine_id:"specific-machine-id" level:debug OR level:trace
```
**Purpose**: Deep dive into specific installation issues

#### Operation Logs Timeline
**Data Source**: Logs
```
message:"*operation*" (message:"*started" OR message:"*completed" OR message:"*failed")
```
**Visualization**: Timeline
**Purpose**: Visualize async operation execution sequence

#### Console Errors Only
**Data Source**: Logs
```
logger:"console" level:error
```
**Purpose**: Review errors captured from console output

### Cross-Data Source Analysis

#### Errors with Full Context
**Method**: Combine data from Issues, Logs, and Breadcrumbs
1. Start with Issue
2. Check Logs tab for structured logs from same machine/time
3. Review Breadcrumbs for operation sequence
4. Watch Session Replay if available
**Purpose**: Complete picture of what happened

#### Machine Performance Profile
**Method**: Analyze specific machine across all sources
1. **Issues**: Count and type of errors
2. **Logs**: Log volume and error frequency
3. **Breadcrumbs**: Operation timings
**Purpose**: Identify machines needing support or having environment issues

## Debugging with Multiple Data Sources

### Breadcrumbs

When viewing an error in Sentry Issues tab, breadcrumbs show:
1. **Checkpoints**: Major application states (e.g., "ToolBoxApp constructor started")
2. **Operations**: Async operations with timing:
   - `"[operation_name] operation started"` with timestamp
   - `"[operation_name] operation completed"` with duration and status
   - `"[operation_name] operation failed"` with error details
3. **HTTP Requests**: URL, method, status code, duration (main process)
4. **Browser Events**: Navigation, clicks, long tasks (renderer process)
5. **Timestamps**: Exact timing of all events
6. **Machine ID**: Included in all breadcrumb data

### Structured Logs

Navigate to Logs tab to see:
1. **Checkpoint Logs**: logInfo calls showing app flow (20+ checkpoints)
2. **Error Logs**: logError/logFatal from captureException calls
3. **Debug Logs**: logDebug/logTrace for detailed diagnostics
4. **Console Output**: Captured console.error() and console.warn()
5. **Severity Levels**: Filter by trace/debug/info/warn/error/fatal
6. **Machine ID**: Tagged on all log entries

### Recreating Issues Locally

Given a Sentry error, follow these steps:

#### Step 1: Gather Information from Issue
1. **Machine ID**: Note the `machine_id` from tags
2. **Phase**: Check `tags.phase` (construction, initialization, tool_loading, etc.)
3. **Process**: Check `tags.process` (main or renderer)
4. **Error Message**: Full exception details
5. **Has Replay**: Check if session replay is available

#### Step 2: Review Breadcrumbs
1. **Sequence**: Read breadcrumb trail chronologically
2. **Timing**: Note duration between events
3. **Operations**: Identify which operations ran before error
4. **Status**: Check if any operations failed before the main error
5. **HTTP Calls**: Note any failing API calls

#### Step 3: Check Structured Logs
1. Navigate to **Logs** tab for the same time period
2. Filter by `machine_id` to see logs from same installation
3. Look for checkpoint logs showing app state
4. Check for error/warn logs preceding the issue
5. Review debug logs if available

#### Step 4: Watch Session Replay
1. If `has:replay` is true, watch the replay
2. See exact user actions leading to error
3. Note any unusual behavior or sequences
4. Observe timing of user interactions

#### Step 5: Review Platform Context
1. **OS**: Check `contexts.os.name` and version
2. **Release**: Check app version from `release` tag
3. **Environment**: Production vs development
4. **Settings**: Look for relevant settings in logs

#### Step 6: Reproduce
1. Use same platform (Windows/macOS/Linux)
2. Use same app version if possible
3. Follow breadcrumb sequence of operations
4. Replicate user actions from session replay
5. Check console for additional output
6. Enable debug logging locally for more detail

## Best Practices

### 1. Daily Monitoring Routine

**Morning Check** (5 minutes):
1. Review **Error Monitoring Dashboard**
   - Check error rate trend (Issues)
   - Note any spikes or new patterns
2. Check **Critical Alerts**
   - Any fatal errors overnight? (Issues)
   - Any high error rate alerts? (Issues)
3. Review **Recent Critical Errors** widget (Issues)
   - Prioritize issues with most affected machines
   - Check for errors with session replay

**Weekly Deep Dive** (30 minutes):
1. **Logs Analysis**
   - Review error log volume trends (Logs)
   - Check for excessive warning logs (Logs)
   - Analyze checkpoint logs for abnormal patterns (Logs)
2. **Performance Review**
   - Check operation timing in breadcrumbs
   - Identify slowest machines
   - Look for performance degradation trends
3. **Machine Health**
   - Review machines by error count (Issues)
   - Contact users with persistent issues
   - Update documentation based on common problems

### 2. Version Tracking

**Before Release**:
- Review all open issues for current version
- Ensure critical bugs are fixed
- Check performance metrics baseline

**After Release**:
- Monitor **New Errors (24h)** widget (Issues)
- Compare error rates with previous version (Issues)
- Check **Errors by Version** query (Issues)
- Review logs for new warning patterns (Logs)

**Regression Detection**:
```
is:unresolved release:latest firstSeen:>7d
```
Identify errors unique to new release

### 3. Machine-Specific Support

**Identifying Problem Machines**:
1. Use **Top Errors by Machine** widget (Issues)
2. Check **Error Logs by Machine** (Logs)
3. Review breadcrumb timing for slow machines

**Investigation Process**:
1. Filter all data sources by specific `machine_id`
2. Review full error history (Issues)
3. Check log patterns (Logs)
4. Analyze operation timing (Breadcrumbs)
5. Watch session replays if available (Issues)
6. Contact user if needed

**Resolution Tracking**:
- Tag issue with machine_id
- Document resolution steps
- Monitor machine after fix deployment

### 4. Performance Baselines

**Establish Baselines** (First Month):
- Export breadcrumb data for all 7 critical operations
- Calculate duration percentiles (p50, p75, p95, p99)
- Document baselines in team wiki

**Operations to Baseline**:
1. `load_initial_settings` - Target: <500ms
2. `load_tools_library` - Target: <2s
3. `load_sidebar_tools` - Target: <1s
4. `load_marketplace` - Target: <3s
5. `load_sidebar_connections` - Target: <2s
6. `load_homepage_data` - Target: <2s
7. `restore_session` - Target: <1s

**Monitoring**:
- Review operation timing weekly in breadcrumbs
- Alert on >20% degradation from baseline
- Track improvements after optimization

### 5. Effective Use of Structured Logs

**Development**:
- Use trace/debug logs liberally (Logs)
- Filter by machine_id to debug specific issues (Logs)
- Review checkpoint sequences (Logs)

**Production**:
- Focus on info/warn/error/fatal logs (Logs)
- Use error logs to identify trends (Logs)
- Console capture shows user-facing errors (Logs)

**Log Volume Management**:
- Monitor log volume with **Log Volume by Severity** widget
- Adjust sampling rates if too much data
- Use log level filtering to reduce noise

### 6. Breadcrumb-Based Performance Analysis

**Operation Timing**:
- Review breadcrumbs in any error to see operation durations
- Compare timing across different machines
- Identify bottlenecks in operation sequences

**HTTP Performance**:
- Monitor HTTP request breadcrumbs (main process)
- Track API response times
- Identify failing endpoints

**Browser Performance**:
- Review long task breadcrumbs (renderer)
- Check INP metrics for interaction responsiveness
- Monitor page navigation timing

### 7. Session Replay Best Practices

**When to Watch**:
- High-impact errors (>10 machines affected)
- Critical errors (level:fatal)
- Confusing errors without clear cause
- User-reported issues

**Privacy Note**:
- All text is masked automatically
- All media is blocked
- Only UI interactions and layout visible
- Safe for production debugging

**Combining with Other Data**:
1. Watch replay to see user actions
2. Check breadcrumbs for timing
3. Review logs for detailed diagnostic info
4. Check error context for technical details

### 8. Cross-Team Collaboration

**Share with Product Team**:
- Top error messages affecting users (Issues)
- Feature-specific error rates (Issues filtered by phase)
- Session replays showing UX issues

**Share with DevOps**:
- Platform-specific errors (Issues by OS)
- Performance degradation trends (Breadcrumbs)
- Machine-specific issues (filtered by machine_id)

**Share with Support**:
- Machine error profiles (Issues + Logs by machine_id)
- Steps to reproduce from breadcrumbs
- Known issues and workarounds
