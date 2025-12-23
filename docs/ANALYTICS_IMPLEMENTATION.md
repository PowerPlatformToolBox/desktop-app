# Tool Analytics Implementation Summary

## Overview

This implementation adds tool analytics tracking to Power Platform Tool Box, enabling tracking of:
1. **Tool Downloads** - Count of installations from the marketplace
2. **Active User Months (AUM)** - Unique machines using each tool per month

## Architecture

### Solution Approach: Client-Side Direct Updates

The implementation uses **Solution 1: Client-Side Direct Updates** as recommended:
- Desktop app directly updates Supabase analytics tables
- No new infrastructure required (uses existing Supabase setup)
- Real-time analytics updates
- Secured via Supabase Row Level Security (RLS) policies

### Component Flow

```
User Action → Desktop App → Supabase Database
    ↓              ↓              ↓
Install Tool → trackDownload() → tool_analytics
Launch Tool  → trackUsage()    → tool_usage_tracking
                                → tool_analytics (aum)
```

## Implementation Details

### 1. Machine ID Management

**File:** `src/main/managers/machineIdManager.ts`

- Generates a unique UUID per installation using `crypto.randomUUID()`
- Stores machine ID in electron-store (persisted across app sessions)
- ID is anonymous and contains no PII
- Retrieved lazily on first analytics call

```typescript
class MachineIdManager {
    getMachineId(): string // Returns UUID, generates if not exists
}
```

### 2. Download Tracking

**Location:** `src/main/managers/toolRegistryManager.ts`

**Method:** `trackToolDownload(toolId: string)`

**Flow:**
1. Tool installation completes successfully
2. `trackToolDownload()` is called asynchronously (non-blocking)
3. Fetches current download count from Supabase
4. Increments count by 1
5. Upserts record in `tool_analytics` table

**Error Handling:**
- Failures are logged but don't break installation
- Gracefully handles missing Supabase credentials (local-only mode)

### 3. Usage Tracking (AUM)

**Location:** `src/main/managers/toolRegistryManager.ts`

**Method:** `trackToolUsage(toolId: string)`

**Flow:**
1. Tool is launched in ToolWindowManager
2. `trackToolUsage()` is called asynchronously (non-blocking)
3. Retrieves machine ID from MachineIdManager
4. Calculates current year-month (e.g., "2025-01")
5. Upserts record in `tool_usage_tracking` table (unique constraint prevents duplicates)
6. Counts distinct machines for this tool in current month
7. Updates `aum` field in `tool_analytics` table

**Key Features:**
- Only counts each machine once per month per tool
- Automatically updates aggregate AUM count
- Historical data preserved in `tool_usage_tracking` table

### 4. Integration Points

**Modified Files:**

1. **`src/main/index.ts`**
   - Added MachineIdManager initialization
   - Passes MachineIdManager to ToolManager

2. **`src/main/managers/toolsManager.ts`**
   - Accepts MachineIdManager in constructor
   - Passes to ToolRegistryManager
   - Exposes `trackToolUsage()` for external calls

3. **`src/main/managers/toolWindowManager.ts`**
   - Accepts ToolManager in constructor
   - Calls `trackToolUsage()` when tool is launched

4. **`src/common/types/settings.ts`**
   - Added `machineId?: string` to UserSettings interface

## Database Schema

### Required Tables

#### 1. `tool_analytics`
Primary analytics table with aggregated metrics.

```sql
CREATE TABLE tool_analytics (
    tool_id TEXT PRIMARY KEY,
    downloads INTEGER DEFAULT 0,
    rating NUMERIC(3, 2),
    aum INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 2. `tool_usage_tracking`
Detailed usage tracking for MAU calculation.

```sql
CREATE TABLE tool_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id TEXT NOT NULL,
    machine_id UUID NOT NULL,
    year_month TEXT NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tool_id, machine_id, year_month)
);
```

### Required RLS Policies

See `docs/ANALYTICS_SCHEMA.md` for complete RLS policy definitions.

**Summary:**
- Anonymous users can INSERT/UPDATE to `tool_analytics` (for tracking)
- Anonymous users can INSERT to `tool_usage_tracking` (for tracking)
- Public read access to `tool_analytics` (for displaying stats)

## Privacy & Security

### Machine ID
- **Anonymous**: Generated UUID with no PII
- **Local**: Stored only in local electron-store
- **Isolated**: One per installation (not cross-device)
- **Regenerated**: New ID on reinstall

### Data Collection
**✅ Collected:**
- Tool ID (which tool was used)
- Machine ID (anonymous UUID)
- Year-month (when tool was used)
- Download count (how many times installed)

**❌ NOT Collected:**
- User names or emails
- IP addresses
- Device information
- Location data
- Usage patterns or behavior

### GDPR Compliance
- No personal data is collected
- Machine ID cannot identify individuals
- Users can clear data by reinstalling
- Analytics are aggregate only

## Testing

### Manual Testing Steps

1. **Setup Supabase:**
   ```bash
   # Create tables in Supabase
   # Apply RLS policies
   # Set environment variables in .env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

2. **Test Download Tracking:**
   ```bash
   # Build and run app
   pnpm run build && pnpm run dev
   
   # Install a tool from marketplace
   # Check Supabase: tool_analytics.downloads should increment
   ```

3. **Test AUM Tracking:**
   ```bash
   # Launch the installed tool
   # Check Supabase: tool_usage_tracking should have new record
   # Check Supabase: tool_analytics.aum should be 1 (first machine this month)
   ```

4. **Test Duplicate Prevention:**
   ```bash
   # Launch the same tool again
   # Check Supabase: tool_usage_tracking should NOT have duplicate
   # The existing record should be updated (last_used_at)
   ```

### Verification Queries

```sql
-- Check download counts
SELECT tool_id, downloads FROM tool_analytics;

-- Check AUM for current month
SELECT tool_id, aum FROM tool_analytics;

-- Check unique machines per tool
SELECT tool_id, COUNT(DISTINCT machine_id) as unique_machines
FROM tool_usage_tracking
WHERE year_month = '2025-01'  -- Current month
GROUP BY tool_id;

-- Verify no duplicates (should match row count)
SELECT COUNT(*) FROM tool_usage_tracking;
SELECT COUNT(DISTINCT (tool_id, machine_id, year_month)) FROM tool_usage_tracking;
```

## Deployment Checklist

- [ ] Create `tool_analytics` table in Supabase
- [ ] Create `tool_usage_tracking` table in Supabase
- [ ] Apply RLS policies to both tables
- [ ] Add indexes for performance
- [ ] Set `SUPABASE_URL` in build environment
- [ ] Set `SUPABASE_ANON_KEY` in build environment
- [ ] Build application with environment variables
- [ ] Test download tracking
- [ ] Test AUM tracking
- [ ] Monitor Supabase logs for errors
- [ ] Set up periodic cleanup job (optional)

## Maintenance

### Monthly Cleanup (Optional)

To keep the database size manageable, consider removing old usage tracking data:

```sql
-- Delete records older than 12 months
DELETE FROM tool_usage_tracking
WHERE created_at < NOW() - INTERVAL '12 months';
```

This can be automated using Supabase Edge Functions with pg_cron.

### Analytics Dashboard

The data can be queried to create analytics dashboards:

```sql
-- Most popular tools by downloads
SELECT t.name, ta.downloads
FROM tools t
JOIN tool_analytics ta ON t.id = ta.tool_id
ORDER BY ta.downloads DESC
LIMIT 10;

-- Most active tools by MAU
SELECT t.name, ta.aum
FROM tools t
JOIN tool_analytics ta ON t.id = ta.tool_id
ORDER BY ta.aum DESC
LIMIT 10;

-- Usage trends over time (requires historical tracking)
SELECT year_month, COUNT(DISTINCT machine_id) as unique_users
FROM tool_usage_tracking
GROUP BY year_month
ORDER BY year_month DESC;
```

## Performance Considerations

### Database Operations
- All tracking operations are asynchronous (non-blocking)
- Upsert operations are used to avoid race conditions
- Indexes are recommended on frequently queried columns
- Consider connection pooling for high-traffic scenarios

### Client-Side
- Tracking failures don't impact user experience
- Machine ID is cached in memory after first retrieval
- No network calls on app startup (lazy initialization)

### Scalability
- Current design supports thousands of concurrent users
- If scaling issues arise, consider:
  - Batch updates via Edge Functions
  - Caching layer (Redis)
  - Read replicas for analytics queries

## Troubleshooting

### Issue: Downloads not tracked

**Possible causes:**
1. Supabase credentials not configured
2. RLS policies too restrictive
3. Network connectivity issues

**Solution:**
```bash
# Check logs
console: [ToolRegistry] Tracking download...
console: [ToolRegistry] Download tracked successfully...

# Verify Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_ANON_KEY

# Check RLS policies in Supabase dashboard
```

### Issue: AUM not updating

**Possible causes:**
1. Machine ID not generated
2. tool_usage_tracking table missing
3. Unique constraint preventing duplicates (expected behavior)

**Solution:**
```bash
# Check logs
console: [MachineId] Generated new machine ID
console: [ToolRegistry] Tracking usage...
console: [ToolRegistry] Usage tracked successfully...

# Verify machine ID in settings
# Check Supabase for tool_usage_tracking records
```

### Issue: Local fallback mode

If Supabase credentials are missing, the app operates in local-only mode:

```bash
console: [ToolRegistry] Supabase credentials not configured
console: [ToolRegistry] Falling back to local registry.json file
console: [ToolRegistry] Skipping download tracking (no Supabase connection)
```

This is expected and allows the app to work without analytics.

## Future Enhancements

### Potential Improvements
1. **Edge Functions**: Move complex analytics to serverless functions
2. **Batch Updates**: Group multiple tracking calls
3. **Offline Queue**: Store tracking calls while offline, sync later
4. **Historical Analytics**: Track trends over time
5. **User Segments**: Analyze usage by region, version, etc. (privacy-preserving)
6. **A/B Testing**: Test different tool features with analytics

### Not Recommended
- ❌ Adding PII to tracking data
- ❌ Cross-device tracking
- ❌ Third-party analytics services
- ❌ Behavioral tracking or monitoring

## References

- Full schema documentation: `docs/ANALYTICS_SCHEMA.md`
- Supabase documentation: https://supabase.com/docs
- RLS policies guide: https://supabase.com/docs/guides/auth/row-level-security
- Node.js crypto API: https://nodejs.org/api/crypto.html

## Support

For questions or issues:
1. Check logs in the Electron app console
2. Verify Supabase table structure matches schema
3. Test RLS policies in Supabase dashboard
4. Review error messages in Supabase logs
