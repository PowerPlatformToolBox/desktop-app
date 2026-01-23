# Sentry Dashboard Queries and Configuration Guide

This document provides a practical, step-by-step process to set up meaningful dashboards for the Power Platform ToolBox desktop application in Sentry.io.

## Overview

The application uses comprehensive Sentry telemetry with:

-   **Exception Tracking**: Captured via `captureException()` with severity levels
-   **Structured Logging**: Via `Sentry.logger` API (info, warn, error, fatal)
-   **Breadcrumb Tracking**: User actions, operations, and HTTP requests with timing
-   **Machine ID Tagging**: All events tagged with machine ID for per-installation analysis
-   **Geographical Data**: Country and region information from user contexts

## Sentry Data Organization

Sentry organizes data into three main sources:

| Data Source     | Contains                                                                     | Access                                          |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------- |
| **Issues**      | Grouped exceptions and errors with full stack traces, user context, and tags | Main Issues tab or Discover > Issues            |
| **Performance** | Transaction data with traces, spans, and timing information                  | Performance tab (requires transaction tracking) |
| **Releases**    | Version tracking with error rate comparisons across versions                 | Releases tab                                    |

## Table of Contents

1. [Step-by-Step Setup Process](#step-by-step-setup-process)
2. [Dashboard Definitions](#dashboard-definitions)
3. [Widget Specifications](#widget-specifications)
4. [Alert Configuration](#alert-configuration)
5. [Best Practices](#best-practices)

---

## Step-by-Step Setup Process

### Phase 1: Pre-Dashboard Preparation

Before creating dashboards, ensure your Sentry project is properly configured:

#### 1.1 Verify Sentry Integration

1. Log in to [Sentry.io](https://sentry.io)
2. Navigate to **Projects** → Select "Power Platform ToolBox"
3. Go to **Settings** → **Integrations**
4. Verify these are enabled:
    - Slack (for alert notifications)
    - GitHub (for release tracking)
    - Custom integrations as needed

#### 1.2 Configure Release Tracking

1. Go to **Settings** → **Releases**
2. Ensure your CI/CD pipeline sends release information when deploying
3. Releases should follow the format: `app-version` (e.g., `app-1.0.0`)
4. Each release will automatically track error rates and regressions

#### 1.3 Set Up Team and Members

1. Go to **Settings** → **Members**
2. Add team members who will monitor dashboards
3. Assign appropriate roles (Manager, Developer, Viewer)

#### 1.4 Configure Issue Owners (Optional)

1. Go to **Settings** → **Issue Owners**
2. Create rules to auto-assign issues based on:
    - Error path
    - Stack trace patterns
    - Tags (e.g., `tags.process:main` → Backend team)

### Phase 2: Understanding Available Data

#### Issue Data Available in Sentry

When you navigate to **Issues**, each issue contains:

-   **Title**: Error message or exception type
-   **Count**: Total occurrences
-   **Users Affected**: Unique `machine_id` values (for our app)
-   **First Seen**: When error first appeared
-   **Last Seen**: Most recent occurrence
-   **Tags**: Custom tags added during exception capture:
    -   `machine_id`: Unique installation identifier
    -   `process`: Either `main` or `renderer`
    -   `phase`: App lifecycle phase (initialization, tool_loading, etc.)
    -   `release`: App version
-   **Breadcrumbs**: Sequence of events before the error
-   **Context**: Additional data like OS, architecture, environment
-   **Geographic Data**: Country and city derived from user IP

#### Creating Custom Insights in Sentry

Sentry provides **Discover** for custom queries:

1. Go to **Discover** (top navigation)
2. Click **Build a new query**
3. Filter by fields:
    - `environment`
    - `release`
    - `tags.machine_id`
    - `tags.process`
    - `tags.phase`
    - `geo.country_code`
    - `geo.city`
4. Group by dimensions (e.g., `tags.process`, `geo.country_code`)
5. Display metrics (count, unique count, avg, p95, etc.)

### Phase 3: Creating Dashboards

#### 3.1 Access Dashboard Creation

1. Navigate to **Dashboards** (left sidebar)
2. Click **Create Dashboard** (top right)
3. Name it descriptively (e.g., "Error Monitoring - Daily")
4. Set display preference (auto-refresh: 5 minutes is typical)

#### 3.2 Dashboard Types

Create multiple dashboards for different purposes:

-   **Operational Dashboard**: Real-time error monitoring
-   **Product Dashboard**: User impact and feature health
-   **Performance Dashboard**: Speed and reliability metrics
-   **Geographic Dashboard**: User distribution and regional issues

### Phase 4: Adding Widgets

Each dashboard is built from widgets. Widgets can be:

-   **Existing Issues**: List of errors
-   **Discover Queries**: Custom analysis
-   **Release Charts**: Version comparison
-   **Alert Rules**: Alert status

To add a widget:

1. Click **Add Widget**
2. Choose widget type:
    - **Discover** (custom query visualization) - Most flexible
    - **Issues** (list of issues)
    - **Release** (compare versions)
    - **Alert** (alert status)
3. Configure the widget (see specifications below)
4. Save

---

## Dashboard Definitions

### Dashboard 1: Error Monitoring - Daily

**Purpose**: Primary operational dashboard for daily error monitoring

**Refresh Rate**: Auto-refresh every 5 minutes

**Target Audience**: Engineering team lead, on-call engineer

#### Layout

```
[Widget 1: Total Errors (24h)]  [Widget 2: Error Trend (7d)]

[Widget 3: Top 5 Errors]        [Widget 4: Error Distribution by Process]

[Widget 5: Errors by Phase]     [Widget 6: New Errors (24h)]

[Widget 7: Geographic Distribution][Widget 8: Affected Machines]
```

### Dashboard 2: Application Health

**Purpose**: Overall application stability and user impact

**Refresh Rate**: Daily

**Target Audience**: Product managers, leadership

#### Layout

```
[Widget 1: Total Unique Users]  [Widget 2: Users with Errors]

[Widget 3: Top Error Messages] [Widget 4: Platform Distribution]

[Widget 5: Error Rate by Release][Widget 6: Geographic Heatmap]
```

### Dashboard 3: Performance & Operations

**Purpose**: Monitor operation success rates and performance

**Refresh Rate**: Hourly

**Target Audience**: Performance engineer, backend team

#### Layout

```
[Widget 1: Initialization Failures (24h)][Widget 2: Tool Loading Errors (24h)]

[Widget 3: Main vs Renderer Process Errors][Widget 4: Connection Loading Errors]

[Widget 5: Slowest Installations (by machine_id)]
```

### Dashboard 4: Geographic & User Distribution

**Purpose**: Understand user base and identify regional issues

**Refresh Rate**: Daily

**Target Audience**: Product team, support team

#### Layout

```
[Widget 1: Users by Country (World Map)]

[Widget 2: Top 10 Countries by User Count][Widget 3: Top 10 Countries by Error Count]

[Widget 4: Error Rate by Country][Widget 5: Regional Issues Breakdown]
```

---

## Widget Specifications

### Dashboard 1: Error Monitoring - Daily Widgets

#### Widget 1: Total Errors (24h) - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Conditions**: `age:-24h` (last 24 hours)
    3. Set **Display**: `count()`
    4. Save
-   **Display**: Large number showing total error count
-   **Position**: Top left, small
-   **Purpose**: Quick health check - detect spikes vs normal
-   **Alert threshold**: If this number is 2x higher than yesterday, investigate

#### Widget 2: Error Trend (7d) - Line Chart

-   **Widget Type**: Line Chart
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `Date`
    4. Set **Conditions**: `age:-7d`
    5. Save
-   **Display**: Line chart with daily counts
-   **Position**: Top right, medium
-   **Purpose**: Identify trends - are errors increasing or decreasing?
-   **Ideal Result**: Flat or declining line
-   **Action**: If line is rising, something is degrading

#### Widget 3: Top 5 Errors - Table/Issues List

-   **Widget Type**: Issues list
-   **Create via**: Create new Issue Alert widget
-   **How to create**:
    1. Click **Add Widget** → **Issues**
    2. Set **Filter**: `age:-24h` (last 24 hours)
    3. Save
-   **Display**: Table showing:
    -   Error message/title
    -   Number of events
    -   Number of affected machines (users)
    -   Last occurrence time
-   **Position**: Middle left, medium
-   **Purpose**: Quick identification of top problems
-   **Action**: Click on any error to see full details, stack trace, and affected machines

#### Widget 4: Error Distribution by Process - Pie Chart

-   **Widget Type**: Pie Chart
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `tags.process`
    4. Set **Conditions**: `age:-24h`
    5. Save
-   **Display**: Pie chart showing percentage split
-   **Slices**: `main` process vs `renderer` process
-   **Position**: Middle right, small
-   **Purpose**: Understand which Electron process has more issues
-   **Interpretation**:
    -   Main heavy: Core app logic issues
    -   Renderer heavy: UI or tool-related issues

#### Widget 5: Errors by Phase - Bar Chart

-   **Widget Type**: Bar Chart (horizontal)
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `tags.phase`
    4. Set **Conditions**: `age:-24h`
    5. Set **Sort by**: count (descending)
    6. Save
-   **Display**: Horizontal bar chart with phases on Y-axis
-   **Phases**: initialization, tool_loading, connections_loading, session_restore, etc.
-   **Position**: Middle, full width
-   **Purpose**: Identify which lifecycle phase has most errors
-   **Use case**: If initialization has spike = app startup failing for users

#### Widget 6: New Errors (24h) - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Conditions**: `age:-24h` AND `firstSeen:-24h`
    4. Save
-   **Display**: Count of previously unseen error types
-   **Position**: Top right corner, small
-   **Purpose**: Alert on new error types appearing
-   **Action**: Click to drill into new errors and prioritize investigation

#### Widget 7: Geographic Distribution - World Map

-   **Widget Type**: World Map (Discover)
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)` (count unique installations)
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-24h`
    5. Save
-   **Display**: Interactive world map with country heatmap
-   **Color Scale**: Darker = more users/installations
-   **Position**: Bottom left, wide
-   **Purpose**: Visualize user distribution and where errors are occurring
-   **Interaction**:
    -   Hover over countries to see exact counts
    -   Click on country to drill down
-   **Use case**: "Most of our users are in US, but we're seeing error spike in Asia"

#### Widget 8: Affected Machines - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)`
    3. Set **Conditions**: `age:-24h`
    4. Save
-   **Display**: Number of unique installations with errors
-   **Position**: Right side, small
-   **Purpose**: Understand scope of impact
-   **Interpretation**:
    -   If 100 errors from 5 machines = concentrated issue (local/regional problem)
    -   If 100 errors from 100 machines = widespread issue (urgent)

### Dashboard 2: Application Health Widgets

#### Widget 1: Total Unique Users - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)`
    3. Set **Conditions**: `age:-7d` (all events in last 7 days)
    4. Save
-   **Display**: Total unique installations
-   **Position**: Top left, small
-   **Purpose**: Understand total user base size
-   **Trend**: Should be relatively stable or growing

#### Widget 2: Users with Errors - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)`
    3. Set **Conditions**: `age:-7d` (only issues)
    4. Save
-   **Display**: Unique installations that experienced errors
-   **Position**: Top middle, small
-   **Purpose**: Calculate health percentage
-   **Formula**: (Total Users - Users with Errors) / Total Users \* 100 = % Healthy
-   **Target**: >95% healthy

#### Widget 3: Top Error Messages - Table

-   **Widget Type**: Table
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `message` (error title/message)
    4. Set **Conditions**: `age:-7d`
    5. Set **Sort by**: count (descending)
    6. Set **Limit**: 10
    7. Save
-   **Display**: Table with error message and occurrence count
-   **Position**: Middle left, wide
-   **Purpose**: Identify most impactful errors affecting users
-   **Action**: Click on message to see full issue

#### Widget 4: Platform Distribution - Pie Chart

-   **Widget Type**: Pie Chart
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `contexts.os.name`
    4. Set **Conditions**: `age:-7d`
    5. Save
-   **Display**: Pie chart with OS distribution (Windows, macOS, Linux)
-   **Position**: Middle right, small
-   **Purpose**: Identify OS-specific issues
-   **Use case**: If Windows errors spike = platform-specific bug

#### Widget 5: Error Rate by Release - Bar Chart

-   **Widget Type**: Bar Chart
-   **Create via**: Release comparison or Discover
-   **How to create**:
    1. Navigate to **Releases** tab
    2. Look at "Release Stability" section
    3. Shows error count and rate per release
    4. Alternatively, use Discover:
        - Display: `count()`
        - Group by: `release`
        - Sort by: most recent releases first
-   **Display**: Chart showing error rate per version
-   **Position**: Bottom left, wide
-   **Purpose**: Detect regressions introduced by versions
-   **Look For**: Spikes in newer releases
-   **Action**: If a release has 3x more errors than previous = revert immediately

#### Widget 6: Geographic Heatmap - World Map

-   **Widget Type**: World Map (Discover)
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()` (total errors) OR `count(unique tags.machine_id)` (unique users)
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-7d`
    5. Save
-   **Display**: World map with country coloring
-   **Color Scale**: Red/dark = more errors, green/light = fewer
-   **Position**: Bottom, full width
-   **Purpose**: Visualize geographic distribution of errors
-   **Insight**: "Why does Brazil have 10x more errors than other countries?"

### Dashboard 3: Performance & Operations Widgets

#### Widget 1: Initialization Failures (24h) - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Conditions**: `age:-24h` AND `tags.phase:initialization`
    4. Save
-   **Display**: Count of initialization phase errors
-   **Position**: Top left, small
-   **Purpose**: Early warning system for startup problems
-   **Alert**: Any spike indicates release regression (app won't start for new users)
-   **Action**: If spike after release, rollback immediately

#### Widget 2: Tool Loading Errors (24h) - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Conditions**: `age:-24h` AND `tags.phase:tool_loading`
    4. Save
-   **Display**: Count of tool loading phase errors
-   **Position**: Top middle, small
-   **Purpose**: Monitor tool marketplace/registry loading
-   **Trend**: Should be near zero
-   **Action**: Investigate if trending upward

#### Widget 3: Main vs Renderer Process Errors - Pie Chart

-   **Widget Type**: Pie Chart
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Group by**: `tags.process`
    4. Set **Conditions**: `age:-24h`
    5. Save
-   **Display**: Pie showing process split
-   **Position**: Middle left, small
-   **Purpose**: Understand which process has more issues

#### Widget 4: Connection Loading Errors (24h) - Number Widget

-   **Widget Type**: Number
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()`
    3. Set **Conditions**: `age:-24h` AND `tags.phase:connections_loading`
    4. Save
-   **Display**: Count of connection loading errors
-   **Position**: Middle right, small
-   **Purpose**: Monitor Dataverse connection issues
-   **Trend**: Indicates network or authentication problems

#### Widget 5: Slowest Installations - Table

-   **Widget Type**: Table
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `tags.machine_id`, `avg(duration)` if available
    3. Set **Group by**: `tags.machine_id`
    4. Set **Conditions**: `age:-7d`
    5. Set **Sort by**: duration descending
    6. Set **Limit**: 10
    7. Save
-   **Display**: Table with machine IDs and average operation duration
-   **Columns**: Machine ID, Operation count, Duration
-   **Position**: Bottom, full width
-   **Purpose**: Identify machines with performance issues
-   **Action**:
    -   Reach out to these users for support
    -   Ask about network conditions, disk space, CPU
    -   May indicate local environment issues

### Dashboard 4: Geographic & User Distribution Widgets

#### Widget 1: Users by Country (World Map) - Primary Visualization

-   **Widget Type**: World Map (Discover)
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)` (count unique users)
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-30d` (month for user distribution)
    5. Save
-   **Display**: Interactive world map with country coloring
-   **Color Scale**: Darker/redder = more users, lighter/blue = fewer
-   **Position**: Top, full width
-   **Purpose**: Visualize global user distribution
-   **Interaction**:
    -   Hover to see country name and user count
    -   Click to drill down to that country's issues
-   **Use case**: "Our top markets are US (1000 users), India (500), UK (300)"

#### Widget 2: Top 10 Countries by User Count - Bar Chart

-   **Widget Type**: Horizontal Bar Chart
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count(unique tags.machine_id)`
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-30d`
    5. Set **Sort by**: count descending
    6. Set **Limit**: 10
    7. Save
-   **Display**: Top countries ranked by user count
-   **Position**: Middle left, wide
-   **Purpose**: Quick ranking of primary markets
-   **Columns**: Country name, User count
-   **Use case**: Product prioritization - focus on top 3 countries

#### Widget 3: Top 10 Countries by Error Count - Bar Chart

-   **Widget Type**: Horizontal Bar Chart (color different from Widget 2)
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `count()` (error count)
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-7d`
    5. Set **Sort by**: count descending
    6. Set **Limit**: 10
    7. Save
-   **Display**: Top countries by error volume
-   **Color**: Red/orange to indicate problems
-   **Position**: Middle right, wide
-   **Purpose**: Identify countries with highest error volume
-   **Insight**: May differ from user distribution
    -   Example: Brazil = 100 users, 2000 errors = regional issue
    -   Example: US = 1000 users, 500 errors = healthy

#### Widget 4: Error Rate by Country - Table

-   **Widget Type**: Table
-   **Create via**: Discover query (requires custom field)
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `geo.country_code`, `count()`, `count(unique tags.machine_id)`
    3. Set **Group by**: `geo.country_code`
    4. Set **Conditions**: `age:-7d`
    5. Set **Sort by**: (errors/machines) descending
    6. Save
    7. Manually add calculated column: Error Rate = Total Errors / Unique Machines
-   **Display**: Table showing:
    -   Country code/name
    -   Total errors
    -   Unique machines
    -   **Error rate** (errors per machine)
-   **Position**: Bottom left, wide
-   **Purpose**: Identify countries with highest error rate per user
-   **Interpretation**:
    -   High total errors, low machines = concentrated issue affecting specific users
    -   High rate per machine = systemic problem affecting all users in that country
-   **Example**:
    -   Brazil: 5000 errors, 100 machines = 50 errors/machine → CRITICAL (environmental issue)
    -   Germany: 3000 errors, 500 machines = 6 errors/machine → NORMAL
-   **Action**: Reach out to high-rate countries first

#### Widget 5: Regional Issues Breakdown - Table

-   **Widget Type**: Table
-   **Create via**: Discover query
-   **How to create**:
    1. Click **Add Widget** → **Discover**
    2. Set **Display**: `geo.country_code`, `tags.phase`, `count()`
    3. Set **Group by**: `geo.country_code`, `tags.phase`
    4. Set **Conditions**: `age:-7d`
    5. Set **Sort by**: count descending
    6. Save
-   **Display**: Table showing error breakdown by country and phase
-   **Columns**:
    -   Country
    -   Initialization errors
    -   Tool loading errors
    -   Connection errors
    -   Other phase errors
    -   Total
-   **Position**: Bottom, full width
-   **Purpose**: Identify if regional issues are tied to specific lifecycle phases
-   **Use cases**:
    -   "Spain has high initialization errors" → Possible DNS/network issue in that region
    -   "Brazil has tool_loading spike" → Specific tool marketplace issue or Supabase latency
    -   "All countries have connection_loading errors" → Global infrastructure problem
-   **Action**: Route to appropriate team based on phase and region

---

## Alert Configuration

### Critical Alerts (Email + Slack)

#### Alert 1: High Error Spike (24h)

-   **Data Source**: Issues
-   **Condition**: Error count today > error count yesterday × 2 (100% increase)
-   **Action**: Email team, Slack to #incidents
-   **Query**: Create alert in **Alerts & Actions** → **Create Alert Rule**
-   **Purpose**: Detect major regressions immediately

#### Alert 2: Fatal Errors

-   **Data Source**: Issues
-   **Condition**: Any new error with level `fatal`
-   **Action**: Immediate Slack notification
-   **How to create**:
    1. Go to **Alerts & Actions**
    2. Click **Create Alert Rule**
    3. Set **Trigger**: New issue with `level:fatal`
    4. Set **Action**: Send Slack notification to #critical
-   **Purpose**: Critical errors need immediate attention

#### Alert 3: Initialization Failure Spike

-   **Data Source**: Issues
-   **Condition**: >10 new `tags.phase:initialization` issues in 15 minutes
-   **Action**: Email team
-   **Purpose**: App startup failures affect all users immediately
-   **Note**: High priority - indicates release regression

#### Alert 4: Regional Error Spike

-   **Data Source**: Issues
-   **Condition**: Error rate in single country increases 3x in 1 hour
-   **Action**: Email team with region information
-   **Purpose**: Identify localized outages
-   **How to create**:
    1. Go to **Alerts & Actions**
    2. Click **Create Alert Rule**
    3. For each critical country:
        - Set **Trigger**: `geo.country_code:"us" age:-1h count() > [baseline*3]`
        - Set **Action**: Email with country name

### Warning Alerts (Email Only)

#### Alert 5: Tool Loading Failures

-   **Data Source**: Issues
-   **Condition**: >5 new `tags.phase:tool_loading` issues in 1 hour
-   **Action**: Email notification
-   **Purpose**: Tool marketplace functionality is core feature

#### Alert 6: Connection Issues

-   **Data Source**: Issues
-   **Condition**: >20 `tags.phase:connections_loading` errors in 1 hour
-   **Action**: Email notification
-   **Purpose**: Dataverse connectivity is critical for app function

#### Alert 7: Performance Degradation

-   **Data Source**: Issues
-   **Condition**: Average error-per-machine rate increases 50% from baseline
-   **Action**: Email to performance team
-   **Purpose**: Track overall health trends

---

## Best Practices

### Daily Monitoring Routine

#### Morning Check (5 minutes)

1. **Check Dashboard 1: Error Monitoring - Daily**

    - Look at "Total Errors (24h)" widget - compare to yesterday
    - Check "Error Trend (7d)" - is it going up or down?
    - Review "Top 5 Errors" - any new errors?
    - Check "Geographic Distribution" - any spikes in specific countries?

2. **Review Alerts**

    - Any critical alerts overnight?
    - Any fatal errors?
    - Any region-specific spikes?

3. **Quick Drill Down**
    - Click on top error to see stack trace
    - Check how many machines affected
    - Decide if urgent (>100 machines) or can be scheduled

#### Weekly Deep Dive (30 minutes)

1. **Review Dashboard 2: Application Health**

    - Check overall healthy percentage
    - Review platform distribution - any OS-specific issues?
    - Look at error rates per release - which version is most stable?

2. **Analyze Dashboard 4: Geographic Distribution**

    - Review top countries by user count and error count
    - Compare user distribution vs error distribution
    - Identify countries with disproportionate error rates
    - Plan regional support or outreach

3. **Performance Check**
    - Review Dashboard 3: Performance & Operations
    - Check initialization, tool loading, connection errors
    - Identify any performance degradation trends
    - Review slowest installations table

### Regional Support Strategy

#### Using Geographic Data

1. **Identify Problem Regions**

    - Go to Dashboard 4 Widget 4 (Error Rate by Country)
    - Sort by error rate (errors per machine)
    - Countries with >10 errors/machine need attention

2. **Understand Root Cause**

    - Use Dashboard 4 Widget 5 (Regional Issues Breakdown)
    - Check which phase is causing issues in that region
    - Examples:
        - Initialization errors → DNS/network issues
        - Tool loading → CDN or marketplace latency
        - Connection → Authentication or network

3. **Take Action**
    - Create support ticket with country info
    - Reach out to users in affected region
    - Check if regional ISP or network provider has known issues
    - Document findings for future reference

### Version Release Monitoring

#### Before Release

1. Review all open issues for current version
2. Ensure error rate is stable
3. Establish baseline error metrics

#### After Release (First 24 Hours)

1. Monitor Dashboard 1: Error Monitoring - Daily
2. Use Widget 2 (Error Trend) to check for regression
3. Check Widget 6 (New Errors) - any unexpected new errors?
4. Compare initialization errors (Widget 1 on Dashboard 3)
5. If error rate > 2x baseline = **ROLLBACK IMMEDIATELY**

#### First Week

1. Compare error rate with previous version (Dashboard 2 Widget 5)
2. Check geographic distribution for region-specific regressions
3. Monitor error rate trends daily
4. Document any new errors and their fixes

### Effective Machine-Specific Investigation

#### Identifying Problematic Machines

1. Go to Dashboard 1, Widget 3 (Top 5 Errors)
2. Click on top error
3. Scroll to "Affected Machines" section
4. Look for machines with high event counts

#### Investigating a Specific Machine

1. Note the `machine_id` from the issue
2. Go to **Discover**
3. Create new query with filter: `tags.machine_id:"[machine_id]"`
4. View all issues from that machine
5. Look at breadcrumbs and stack traces
6. Check if machine is in high-error region (use Dashboard 4)
7. Contact user for support or diagnostics

#### Resolution Tracking

-   Tag issue with machine ID and region
-   Document resolution steps
-   Monitor machine after fix (should see error drop)
-   Update support documentation if common issue
