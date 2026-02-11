# Supabase Database Schema Updates for Tool Version Compatibility

This document outlines the database schema changes required to support tool version compatibility in the Power Platform ToolBox marketplace.

## Overview

The tool version compatibility feature requires storing minimum and maximum API version information for each tool in the registry. This allows the application to determine which tools are compatible with a given ToolBox version.

---

## Schema Changes

### 1. Add Version Columns to `tools` Table

Execute the following SQL in your Supabase SQL Editor:

```sql
-- Add min_api and max_api columns to the tools table
ALTER TABLE tools 
  ADD COLUMN IF NOT EXISTS min_api TEXT,
  ADD COLUMN IF NOT EXISTS max_api TEXT;

-- Add comments to explain the columns
COMMENT ON COLUMN tools.min_api IS 'Minimum ToolBox API version required by this tool (from package.json features.minAPI)';
COMMENT ON COLUMN tools.max_api IS 'Maximum ToolBox API version tested with this tool (from npm-shrinkwrap @pptb/types version)';
```

### 2. Create Indexes for Performance

Add indexes to improve query performance when filtering by version:

```sql
-- Create indexes on version columns for faster lookups
CREATE INDEX IF NOT EXISTS idx_tools_min_api ON tools(min_api) 
  WHERE min_api IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tools_max_api ON tools(max_api) 
  WHERE max_api IS NOT NULL;

-- Composite index for version range queries
CREATE INDEX IF NOT EXISTS idx_tools_versions ON tools(min_api, max_api) 
  WHERE min_api IS NOT NULL AND max_api IS NOT NULL;
```

### 3. Update Row Level Security (RLS) Policies

If you have RLS enabled, ensure the new columns are included:

```sql
-- No changes needed to RLS policies - the columns follow the same access pattern
-- Just verify that SELECT policies allow reading these columns

-- Example verification query:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'tools';
```

---

## Data Migration

### Option A: Set Defaults for Existing Tools

For tools that already exist without version information:

```sql
-- Option 1: Set to NULL (allows all versions - backward compatible)
-- No action needed - columns default to NULL

-- Option 2: Set to earliest supported version
UPDATE tools 
SET 
  min_api = '1.0.0',
  max_api = '1.1.3'  -- Current latest version
WHERE min_api IS NULL;
```

**Recommendation:** Leave as NULL for existing tools to maintain backward compatibility. Tools without version info are assumed compatible with all versions.

### Option B: Backfill from Tool Packages

If you have access to the tool packages, you can extract the version information:

```javascript
// Example Node.js script to backfill version data
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backfillVersions() {
  // Get all tools without version info
  const { data: tools, error } = await supabase
    .from('tools')
    .select('id, packagename')
    .is('min_api', null);

  for (const tool of tools) {
    try {
      // Download and extract tool package
      const packageJsonPath = `./temp/${tool.id}/package.json`;
      const shrinkwrapPath = `./temp/${tool.id}/npm-shrinkwrap.json`;
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const minAPI = packageJson.features?.minAPI;
        
        let maxAPI = null;
        if (fs.existsSync(shrinkwrapPath)) {
          const shrinkwrap = JSON.parse(fs.readFileSync(shrinkwrapPath, 'utf-8'));
          const typesVersion = shrinkwrap.dependencies?.['@pptb/types']?.version;
          maxAPI = typesVersion?.replace(/^\^|~/, '');
        }
        
        // Update database
        await supabase
          .from('tools')
          .update({ min_api: minAPI, max_api: maxAPI })
          .eq('id', tool.id);
          
        console.log(`Updated ${tool.id}: minAPI=${minAPI}, maxAPI=${maxAPI}`);
      }
    } catch (error) {
      console.error(`Failed to process ${tool.id}:`, error);
    }
  }
}

backfillVersions();
```

---

## Validation Rules

### Database-Level Constraints

Add check constraints to ensure data quality:

```sql
-- Ensure versions follow semver format (basic check)
ALTER TABLE tools 
  ADD CONSTRAINT check_min_api_format 
  CHECK (min_api IS NULL OR min_api ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$');

ALTER TABLE tools 
  ADD CONSTRAINT check_max_api_format 
  CHECK (max_api IS NULL OR max_api ~ '^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$');

-- Note: These are basic checks. Full semver validation should happen in application code.
```

### Application-Level Validation

In your tool intake/update API:

```typescript
interface ToolSubmission {
  id: string;
  name: string;
  version: string;
  minAPI?: string;
  maxAPI?: string;
  // ... other fields
}

function validateToolVersions(tool: ToolSubmission): string[] {
  const errors: string[] = [];
  
  // Validate minAPI format
  if (tool.minAPI && !isValidSemver(tool.minAPI)) {
    errors.push('Invalid minAPI format. Must be valid semver (e.g., 1.0.0)');
  }
  
  // Validate maxAPI format
  if (tool.maxAPI && !isValidSemver(tool.maxAPI)) {
    errors.push('Invalid maxAPI format. Must be valid semver (e.g., 1.0.0)');
  }
  
  // Ensure minAPI <= maxAPI if both are provided
  if (tool.minAPI && tool.maxAPI) {
    if (compareVersions(tool.minAPI, tool.maxAPI) > 0) {
      errors.push('minAPI cannot be greater than maxAPI');
    }
  }
  
  return errors;
}
```

---

## API Changes

### 1. Update Tool Query

Update your existing tool query to include the new fields:

```sql
SELECT 
  t.id,
  t.name,
  t.version,
  t.description,
  t.downloadurl,
  t.iconurl,
  t.min_api,      -- NEW
  t.max_api,      -- NEW
  -- ... other fields
FROM tools t
WHERE t.status = 'active';
```

### 2. Update Tool Insert/Update

When creating or updating tools:

```sql
INSERT INTO tools (
  id, 
  name, 
  version, 
  min_api,        -- NEW
  max_api,        -- NEW
  -- ... other fields
) VALUES (
  $1, $2, $3, $4, $5, ...
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  min_api = EXCLUDED.min_api,        -- NEW
  max_api = EXCLUDED.max_api,        -- NEW
  updated_at = NOW();
```

### 3. Add Compatibility Filter Endpoint

Create a new API endpoint or update existing ones to filter by compatibility:

```typescript
// Example Supabase Edge Function
export async function getCompatibleTools(toolboxVersion: string) {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .or(`min_api.is.null,min_api.lte.${toolboxVersion}`)
    .or(`max_api.is.null,max_api.gte.${toolboxVersion}`)
    .eq('status', 'active');
    
  return data;
}
```

**Note:** Version comparison in SQL is complex. It's recommended to do filtering in the application layer for semantic versioning.

---

## Testing

### 1. Verify Schema Changes

```sql
-- Check columns exist
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'tools' 
  AND column_name IN ('min_api', 'max_api');

-- Expected output:
-- column_name | data_type | is_nullable
-- min_api     | text      | YES
-- max_api     | text      | YES
```

### 2. Verify Indexes

```sql
-- Check indexes exist
SELECT 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename = 'tools' 
  AND indexname LIKE '%api%';

-- Expected output should include:
-- idx_tools_min_api
-- idx_tools_max_api
-- idx_tools_versions
```

### 3. Test Data

Insert test data to verify the schema:

```sql
-- Insert test tool with version info
INSERT INTO tools (
  id,
  name,
  version,
  description,
  downloadurl,
  iconurl,
  min_api,
  max_api,
  status
) VALUES (
  'test-tool-001',
  'Test Tool',
  '1.0.0',
  'A test tool for version compatibility',
  'https://example.com/test-tool.tgz',
  'https://example.com/icon.svg',
  '1.0.0',
  '1.1.3',
  'active'
);

-- Verify insertion
SELECT id, name, min_api, max_api FROM tools WHERE id = 'test-tool-001';

-- Clean up
DELETE FROM tools WHERE id = 'test-tool-001';
```

---

## Monitoring and Analytics

### Useful Queries

**1. Tools with version information:**

```sql
SELECT 
  COUNT(*) FILTER (WHERE min_api IS NOT NULL) as with_min_api,
  COUNT(*) FILTER (WHERE max_api IS NOT NULL) as with_max_api,
  COUNT(*) FILTER (WHERE min_api IS NOT NULL AND max_api IS NOT NULL) as with_both,
  COUNT(*) as total
FROM tools 
WHERE status = 'active';
```

**2. Version distribution:**

```sql
SELECT 
  min_api,
  COUNT(*) as tool_count
FROM tools 
WHERE status = 'active' AND min_api IS NOT NULL
GROUP BY min_api
ORDER BY min_api DESC;
```

**3. Tools potentially incompatible with a version:**

```sql
-- Note: This is a simple string comparison, not proper semver
-- Use this for monitoring only, not for actual compatibility checks
SELECT 
  id,
  name,
  version,
  min_api,
  max_api
FROM tools 
WHERE status = 'active'
  AND (min_api > '1.0.0' OR max_api < '1.1.3');
```

---

## Rollback Plan

If you need to rollback the changes:

```sql
-- 1. Drop indexes
DROP INDEX IF EXISTS idx_tools_versions;
DROP INDEX IF EXISTS idx_tools_max_api;
DROP INDEX IF EXISTS idx_tools_min_api;

-- 2. Drop constraints (if added)
ALTER TABLE tools DROP CONSTRAINT IF EXISTS check_min_api_format;
ALTER TABLE tools DROP CONSTRAINT IF EXISTS check_max_api_format;

-- 3. Remove columns
ALTER TABLE tools DROP COLUMN IF EXISTS min_api;
ALTER TABLE tools DROP COLUMN IF EXISTS max_api;
```

**Warning:** This will permanently delete version data. Create a backup first:

```sql
-- Backup version data before rollback
CREATE TABLE tools_version_backup AS
SELECT id, min_api, max_api FROM tools;
```

---

## Support and Troubleshooting

### Common Issues

**Issue 1: Column not found**
```
Error: column "min_api" does not exist
```
**Solution:** Run the ALTER TABLE command to add the columns.

**Issue 2: Invalid semver format**
```
Error: new row violates check constraint "check_min_api_format"
```
**Solution:** Ensure version strings follow semantic versioning format (X.Y.Z).

**Issue 3: Performance degradation**
```
Query taking too long to filter by version
```
**Solution:** 
- Verify indexes are created
- Analyze query plan: `EXPLAIN ANALYZE SELECT ... WHERE min_api ...`
- Consider application-level filtering instead of database

---

## Next Steps

After completing the database changes:

1. ✅ Verify schema changes are applied
2. ✅ Test with sample data
3. ✅ Update API endpoints to return new fields
4. ✅ Update tool submission process to capture version data
5. ✅ Monitor tools without version info
6. ✅ Reach out to tool developers for updates
7. ✅ Document version requirements in tool submission guidelines

---

## References

- [Supabase SQL Editor](https://supabase.com/docs/guides/database/sql-editor)
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html)
- [PostgreSQL Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [Semantic Versioning Specification](https://semver.org/)
