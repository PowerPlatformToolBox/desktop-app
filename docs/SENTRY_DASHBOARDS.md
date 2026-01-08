# Sentry Dashboard Queries and Configuration Guide

This document provides queries and steps to create meaningful dashboards for the Power Platform Tool Box desktop application in Sentry.io.

## Table of Contents
1. [Key Metrics to Track](#key-metrics-to-track)
2. [Error Monitoring Queries](#error-monitoring-queries)
3. [Performance Monitoring Queries](#performance-monitoring-queries)
4. [User Experience Queries](#user-experience-queries)
5. [Dashboard Setup Steps](#dashboard-setup-steps)
6. [Alert Configuration](#alert-configuration)

## Key Metrics to Track

### Critical Metrics
- **Error Rate**: Errors per user session
- **Crash Rate**: Application crashes by version
- **Performance**: Average transaction duration
- **User Impact**: Number of unique machines affected by errors
- **Session Health**: Percentage of healthy vs errored sessions

### Process-Specific Metrics
- **Main Process**: Initialization failures, IPC errors, manager failures
- **Renderer Process**: UI errors, tool loading failures, connection errors

## Error Monitoring Queries

### 1. Errors by Machine ID
**Query**: 
```
event.type:error
```
**Group By**: `machine_id`
**Visualization**: Table
**Purpose**: Identify which machines are experiencing the most errors

### 2. Errors by Phase
**Query**:
```
event.type:error
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

### 3. Main vs Renderer Process Errors
**Query**:
```
event.type:error
```
**Group By**: `tags.process`
**Visualization**: Pie Chart
**Purpose**: Understand error distribution between processes

### 4. Critical/Fatal Errors
**Query**:
```
event.type:error level:fatal OR level:error
```
**Sort By**: Timestamp (desc)
**Purpose**: Monitor severe errors that need immediate attention

### 5. Top Error Messages
**Query**:
```
event.type:error
```
**Group By**: `message`
**Visualization**: Table
**Purpose**: Identify the most common error messages

## Performance Monitoring Queries

### 1. Application Initialization Performance
**Transaction Name**: `Application initialization started`
**Metrics**: p50, p75, p95, p99 duration
**Purpose**: Monitor how long it takes for the app to start

### 2. Tool Loading Performance
**Query**:
```
transaction:*tool*loading*
```
**Metrics**: Average duration, slowest machines
**Purpose**: Identify slow tool loading issues

### 3. Connection Test Performance
**Query**:
```
transaction:*connection*test*
```
**Metrics**: Average duration, failure rate
**Purpose**: Monitor Dataverse connection performance

### 4. Session Restore Performance
**Query**:
```
transaction:*session*restore*
```
**Metrics**: Duration by machine, failure rate
**Purpose**: Track how quickly users can resume work

## User Experience Queries

### 1. Machines by Error Count
**Query**:
```
event.type:error
```
**Group By**: `machine_id`
**Sort By**: Count (desc)
**Purpose**: Identify problematic installations

### 2. Healthy vs Errored Sessions
**Query**: Compare:
- Total sessions: `event.type:transaction`
- Errored sessions: `event.type:error`
**Visualization**: Ratio
**Purpose**: Overall application health metric

### 3. Session Replay Analysis
**Query**:
```
event.type:error has:replay
```
**Purpose**: Errors with session replays for detailed debugging

### 4. Platform Distribution (Errors by OS)
**Query**:
```
event.type:error
```
**Group By**: `contexts.os.name`
**Visualization**: Pie Chart
**Purpose**: Identify platform-specific issues

## Dashboard Setup Steps

### Step 1: Create Main Dashboard
1. Navigate to **Dashboards** in Sentry
2. Click **Create Dashboard**
3. Name it "Power Platform Tool Box - Overview"

### Step 2: Add Key Widgets

#### Widget 1: Error Rate Over Time
- **Type**: Line Chart
- **Query**: `event.type:error`
- **Y-Axis**: Count of events
- **X-Axis**: Time (1 hour intervals)
- **Size**: Full width

#### Widget 2: Errors by Machine
- **Type**: Table
- **Query**: `event.type:error`
- **Columns**: Machine ID, Error Count, Last Seen
- **Group By**: `machine_id`
- **Sort**: Count desc
- **Size**: Half width

#### Widget 3: Errors by Phase
- **Type**: Bar Chart
- **Query**: `event.type:error`
- **Group By**: `tags.phase`
- **Size**: Half width

#### Widget 4: Process Distribution
- **Type**: Pie Chart
- **Query**: `event.type:error`
- **Group By**: `tags.process`
- **Size**: Half width

#### Widget 5: Recent Critical Errors
- **Type**: Table
- **Query**: `event.type:error level:fatal OR level:error`
- **Columns**: Message, Machine ID, Timestamp, Phase
- **Sort**: Timestamp desc
- **Limit**: 10
- **Size**: Half width

#### Widget 6: Performance Metrics
- **Type**: Line Chart
- **Transaction**: `Application initialization started`
- **Metrics**: p50, p95 duration
- **Size**: Full width

### Step 3: Create Process-Specific Dashboards

#### Main Process Dashboard
Create dashboard with filter: `tags.process:main`
Add widgets for:
- Manager-specific errors (toolManager, connectionManager, etc.)
- IPC handler errors
- Initialization checkpoints

#### Renderer Process Dashboard
Create dashboard with filter: `tags.process:renderer`
Add widgets for:
- UI component errors
- Tool loading in renderer
- Session restore issues

## Alert Configuration

### Critical Alerts

#### Alert 1: High Error Rate
- **Condition**: Error count > 100 in 1 hour
- **Action**: Email team, Slack notification
- **Query**: `event.type:error`

#### Alert 2: Fatal Errors
- **Condition**: Any fatal error occurs
- **Action**: Immediate Slack notification
- **Query**: `event.type:error level:fatal`

#### Alert 3: Initialization Failure Spike
- **Condition**: >10 initialization failures in 15 minutes
- **Action**: Email team
- **Query**: `event.type:error tags.phase:initialization OR tags.phase:construction`

#### Alert 4: Performance Degradation
- **Condition**: p95 initialization time > 10 seconds
- **Action**: Email team
- **Transaction**: `Application initialization started`

### Warning Alerts

#### Alert 5: Tool Loading Failures
- **Condition**: >5 tool loading failures in 1 hour
- **Action**: Email notification
- **Query**: `event.type:error tags.phase:tool_loading`

#### Alert 6: Connection Issues
- **Condition**: >20 connection errors in 1 hour
- **Action**: Email notification
- **Query**: `event.type:error tags.phase:connections_loading`

## Advanced Queries

### Find Errors Without Replay
```
event.type:error !has:replay
```
**Purpose**: Identify errors that need better reproduction info

### Errors Affecting Multiple Machines
```
event.type:error
```
**Group By**: `message`
**Having**: `count(unique(machine_id)) > 5`
**Purpose**: Find widespread issues

### Errors by Version
```
event.type:error
```
**Group By**: `release`
**Purpose**: Track error rates across versions

### Slow Operations by Machine
```
transaction.duration:>5s
```
**Group By**: `machine_id`
**Purpose**: Identify slow machines

## Debugging with Breadcrumbs

When viewing an error in Sentry, the breadcrumb trail shows:
1. **Checkpoints**: Major application states (e.g., "ToolBoxApp constructor started")
2. **Operations**: Specific operations attempted (e.g., "Tools loaded from registry")
3. **Timestamps**: Exact timing of events
4. **Machine ID**: Included in all breadcrumb data

### Recreating Issues Locally

Given a Sentry error, follow these steps:

1. **Check Machine ID**: Note the machine_id from tags
2. **Review Breadcrumbs**: See the sequence of events leading to error
3. **Check Phase**: Identify where in the lifecycle the error occurred
4. **Review Context**: Look at os, platform, and version information
5. **Check Session Replay**: If available, watch the user's actions
6. **Reproduce**: 
   - Use the same platform (Windows/macOS/Linux)
   - Follow the breadcrumb sequence
   - Check for specific settings from context

## Best Practices

### 1. Regular Review
- Check dashboard daily for new error patterns
- Review alerts immediately
- Analyze session replays for high-impact errors

### 2. Version Tracking
- Compare error rates between versions
- Identify regressions quickly
- Track improvements in performance metrics

### 3. Machine-Specific Issues
- Use machine_id to identify problematic installations
- Reach out to affected users for more info
- Track resolution of machine-specific issues

### 4. Performance Baselines
- Establish baseline p50, p95 metrics for key operations
- Alert on deviations
- Track improvements over time
