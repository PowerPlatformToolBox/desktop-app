# Quick Start Guide for Maintainers

This guide helps maintainers deploy the tool analytics tracking feature.

## What Was Implemented

Tool analytics tracking for:
- **Downloads**: Count each time a tool is installed from marketplace
- **AUM (Active User Months)**: Count unique machines using each tool per month

## Step 1: Create Supabase Tables

Run these SQL commands in your Supabase SQL Editor:

### Create tool_analytics table
```sql
CREATE TABLE tool_analytics (
    tool_id TEXT PRIMARY KEY REFERENCES tools(id) ON DELETE CASCADE,
    downloads INTEGER DEFAULT 0,
    rating NUMERIC(3, 2),
    aum INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Create tool_usage_tracking table
```sql
CREATE TABLE tool_usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_id TEXT NOT NULL REFERENCES tools(id) ON DELETE CASCADE,
    machine_id UUID NOT NULL,
    year_month TEXT NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(tool_id, machine_id, year_month)
);

CREATE INDEX idx_tool_usage_tool_month ON tool_usage_tracking(tool_id, year_month);
```

## Step 2: Apply RLS Policies

### For tool_analytics table:
```sql
-- Enable RLS
ALTER TABLE tool_analytics ENABLE ROW LEVEL SECURITY;

-- Allow public read
CREATE POLICY "Allow public read access on tool_analytics"
ON tool_analytics FOR SELECT TO anon, authenticated USING (true);

-- Allow anonymous inserts (for tracking from desktop app)
CREATE POLICY "Allow anonymous upsert on tool_analytics"
ON tool_analytics FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous updates (for incrementing counters)
CREATE POLICY "Allow anonymous update on tool_analytics"
ON tool_analytics FOR UPDATE TO anon USING (true) WITH CHECK (true);
```

### For tool_usage_tracking table:
```sql
-- Enable RLS
ALTER TABLE tool_usage_tracking ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for tracking from desktop app)
CREATE POLICY "Allow anonymous insert on tool_usage_tracking"
ON tool_usage_tracking FOR INSERT TO anon WITH CHECK (true);

-- Optional: Allow authenticated read
CREATE POLICY "Allow authenticated read on tool_usage_tracking"
ON tool_usage_tracking FOR SELECT TO authenticated USING (true);
```

## Step 3: Verify Supabase Setup

1. Go to Supabase Dashboard → Database → Tables
2. Verify both tables exist: `tool_analytics` and `tool_usage_tracking`
3. Check that indexes are created
4. Verify RLS is enabled on both tables
5. Copy your `SUPABASE_URL` and `SUPABASE_ANON_KEY`

## Step 4: Configure Environment Variables

Update your `.env` file (or GitHub Secrets for CI/CD):

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Note:** These are already used by the existing code, so if you have Supabase configured, you're all set!

## Step 5: Build and Deploy

```bash
# Build with environment variables
pnpm install
pnpm run build

# Package for distribution
pnpm run package
```

The app will now track analytics automatically.

## Step 6: Test the Implementation

### Test Download Tracking:
1. Run the app
2. Go to marketplace
3. Install a tool
4. Check Supabase: `SELECT * FROM tool_analytics;`
5. Verify `downloads` column incremented

### Test AUM Tracking:
1. Launch the installed tool (click to open)
2. Check Supabase: `SELECT * FROM tool_usage_tracking;`
3. Verify a new record exists with:
   - Your tool_id
   - A machine_id (UUID)
   - Current year_month (e.g., "2025-01")
4. Check Supabase: `SELECT * FROM tool_analytics;`
5. Verify `aum` column is 1 (first machine this month)

### Test Duplicate Prevention:
1. Launch the same tool again
2. Check Supabase: `SELECT COUNT(*) FROM tool_usage_tracking WHERE tool_id = 'your-tool-id';`
3. Count should still be 1 (no duplicate)
4. The `last_used_at` timestamp should be updated

## Step 7: Monitor

### Check Logs
In the Electron app console (DevTools), you should see:
```
[MachineId] Generated new machine ID
[ToolRegistry] Tracking download for tool: your-tool-id
[ToolRegistry] Download tracked successfully for your-tool-id (total: 1)
[ToolRegistry] Tracking usage for tool: your-tool-id
[ToolRegistry] Usage tracked successfully for your-tool-id (MAU: 1)
```

### Query Analytics
```sql
-- View all tool analytics
SELECT * FROM tool_analytics ORDER BY downloads DESC;

-- View current month's active users
SELECT tool_id, COUNT(DISTINCT machine_id) as unique_machines
FROM tool_usage_tracking
WHERE year_month = TO_CHAR(NOW(), 'YYYY-MM')
GROUP BY tool_id;

-- Most popular tools
SELECT t.name, ta.downloads, ta.aum
FROM tools t
LEFT JOIN tool_analytics ta ON t.id = ta.tool_id
ORDER BY ta.downloads DESC;
```

## Troubleshooting

### Downloads not tracked?
- Check console logs for errors
- Verify SUPABASE_URL and SUPABASE_ANON_KEY are set
- Check RLS policies allow INSERT on tool_analytics
- Verify tool installation completes successfully

### AUM not updating?
- Check console logs for "[ToolRegistry] Tracking usage"
- Verify tool_usage_tracking table exists
- Check RLS policies allow INSERT on tool_usage_tracking
- Ensure tool actually launches (opens in tool window)

### Local-only mode?
If you see:
```
[ToolRegistry] Supabase credentials not configured
[ToolRegistry] Falling back to local registry.json file
```

This means Supabase isn't configured. The app still works, but analytics are disabled.

## Privacy Notes

The implementation is privacy-focused:
- Machine ID is an anonymous UUID (no PII)
- Generated locally using Node.js crypto.randomUUID()
- Stored in encrypted electron-store
- No personal data, IP addresses, or device info collected
- GDPR compliant (no personal data)

## Optional: Monthly Cleanup

To keep database size manageable, set up a monthly cleanup:

```sql
-- Run this monthly (e.g., via pg_cron or Supabase Edge Function)
DELETE FROM tool_usage_tracking
WHERE created_at < NOW() - INTERVAL '12 months';
```

This removes usage data older than 12 months while keeping current analytics.

## Resources

For detailed information, see:
- **`docs/ANALYTICS_SCHEMA.md`** - Complete database schema documentation
- **`docs/ANALYTICS_IMPLEMENTATION.md`** - Full implementation guide with troubleshooting

## Support

If you encounter issues:
1. Check console logs in the Electron app
2. Verify Supabase table structure matches schema
3. Test RLS policies in Supabase dashboard
4. Review Supabase logs for SQL errors
5. Check that environment variables are properly set during build

## Summary

✅ No new dependencies required
✅ No new infrastructure needed
✅ Uses existing Supabase setup
✅ Privacy-focused design
✅ Non-blocking async operations
✅ Graceful fallback if Supabase unavailable

The feature is ready to deploy once Supabase tables are created and RLS policies applied!
