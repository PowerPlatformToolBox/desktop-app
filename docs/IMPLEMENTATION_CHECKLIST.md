# Implementation Checklist: Tool Version Compatibility Feature

This document provides a step-by-step checklist for implementing the tool version compatibility feature across all systems and processes.

## Overview

This feature allows tools to declare version compatibility requirements, preventing users from installing or using tools that are incompatible with their ToolBox version.

---

## ✅ Phase 1: Application Code (COMPLETED)

### Backend Changes

- [x] Add `minAPI` field to `ToolFeatures` interface (`src/common/types/tool.ts`)
- [x] Add `minAPI`, `maxAPI`, and `isSupported` fields to `Tool` interface
- [x] Add `minAPI` and `maxAPI` fields to `ToolManifest` interface
- [x] Add `minAPI` and `maxAPI` fields to `ToolRegistryEntry` interface
- [x] Add `TOOLBOX_VERSION` and `MIN_SUPPORTED_API_VERSION` constants (`src/main/constants.ts`)
- [x] Create `compareVersions()` utility function in `toolsManager.ts`
- [x] Create `isToolSupported()` compatibility check function
- [x] Update `loadToolFromManifest()` to set version fields and compatibility status
- [x] Update `installTool()` to extract `minAPI` from package.json
- [x] Update `installTool()` to extract `maxAPI` from npm-shrinkwrap.json
- [x] Update Supabase schema mappings to include `min_api` and `max_api`
- [x] Update local registry interface to support version fields

### UI Changes

- [x] Add version compatibility check in `launchTool()` function
- [x] Show warning notification when launching unsupported tool
- [x] Add `isUnsupported` check in sidebar tool rendering
- [x] Add "Not Supported" badge HTML for sidebar tools
- [x] Add CSS class `unsupported` to unsupported tool items in sidebar
- [x] Add `isUnsupported` check in marketplace tool rendering
- [x] Add "Not Supported" badge HTML for marketplace tools
- [x] Add CSS class `unsupported` to unsupported tool items in marketplace
- [x] Disable install button for unsupported tools in marketplace
- [x] Add CSS styles for `.tool-unsupported-badge`
- [x] Add CSS styles for `.tool-item-pptb.unsupported`
- [x] Add CSS styles for `.marketplace-item-unsupported-badge`
- [x] Add CSS styles for `.marketplace-item-pptb.unsupported`
- [x] Update `ToolDetail` interface to include version fields

### Build Configuration

- [x] Update `vite.config.ts` to inject `TOOLBOX_VERSION` at build time
- [x] Verify TypeScript compilation succeeds
- [x] Verify linting passes

---

## ✅ Phase 2: GitHub Workflows (COMPLETED)

### Stable Release Workflow

- [x] Add version validation step in `prod-release.yml` preflight job
- [x] Check that @pptb/types version matches ToolBox version
- [x] Add `publish-types` job after `publish-release`
- [x] Setup Node.js with npm registry authentication
- [x] Publish @pptb/types to npm with `latest` tag
- [x] Use `NPM_TOKEN` secret for authentication

### Nightly Release Workflow

- [x] Add `publish-types-beta` job after `publish-release`
- [x] Setup Node.js with npm registry authentication
- [x] Publish @pptb/types to npm with `beta` tag
- [x] Use `NPM_TOKEN` secret for authentication

---

## ✅ Phase 3: Documentation (COMPLETED)

- [x] Create `TOOL_VERSION_COMPATIBILITY.md` with:
    - [x] Overview and version compatibility rules
    - [x] Guide for tool developers
    - [x] Guide for ToolBox maintainers
    - [x] Guide for registry administrators
    - [x] Technical implementation details
    - [x] User experience documentation
    - [x] Troubleshooting guide

- [x] Create `SUPABASE_SCHEMA_UPDATES.md` with:
    - [x] Database schema changes
    - [x] Migration scripts
    - [x] Validation rules
    - [x] API changes
    - [x] Testing procedures
    - [x] Monitoring queries

- [x] Create this implementation checklist

---

## ⏳ Phase 4: Database Updates (PENDING - EXTERNAL)

### Supabase Schema Migration

- [x] Connect to Supabase SQL Editor
- [x] Run schema update script:
    ```sql
    ALTER TABLE tools
      ADD COLUMN IF NOT EXISTS min_api TEXT,
      ADD COLUMN IF NOT EXISTS max_api TEXT;
    ```
- [ ] Add column comments:
    ```sql
    COMMENT ON COLUMN tools.min_api IS 'Minimum ToolBox API version required';
    COMMENT ON COLUMN tools.max_api IS 'Maximum ToolBox API version tested';
    ```
- [x] Create performance indexes:
    ```sql
    CREATE INDEX IF NOT EXISTS idx_tools_min_api ON tools(min_api)
      WHERE min_api IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tools_max_api ON tools(max_api)
      WHERE max_api IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_tools_versions ON tools(min_api, max_api)
      WHERE min_api IS NOT NULL AND max_api IS NOT NULL;
    ```
- [x] Verify indexes were created:
    ```sql
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'tools' AND indexname LIKE '%api%';
    ```
- [x] Test with sample data insertion
- [ ] Document rollback procedure

### Data Migration Strategy

- [ ] Decide on strategy for existing tools:
    - Option A: Leave as NULL (backward compatible)
    - Option B: Set to default version (e.g., "1.0.0")
    - Option C: Backfill from tool packages
- [ ] If backfilling, develop extraction script
- [ ] Test backfill script on subset of tools
- [ ] Execute backfill for all tools
- [ ] Verify data quality

### Monitoring Setup

- [ ] Create dashboard for version statistics
- [ ] Set up alerts for tools without version info
- [ ] Monitor query performance after migration

---

## ⏳ Phase 5: GitHub Repository Setup (PENDING - EXTERNAL)

### Repository Secrets

- [ ] Generate npm access token:
    1. Log into npm account
    2. Navigate to Access Tokens
    3. Generate new "Automation" token
    4. Copy token value
- [ ] Add `NPM_TOKEN` secret to GitHub repository:
    1. Go to repository Settings → Secrets and variables → Actions
    2. Click "New repository secret"
    3. Name: `NPM_TOKEN`
    4. Value: [paste token]
    5. Click "Add secret"
- [ ] Verify token has publish permissions for `@pptb` scope
- [ ] Test token with manual publish (optional)

### Verify Existing Secrets

- [ ] Confirm `SUPABASE_URL` is set
- [ ] Confirm `SUPABASE_ANON_KEY` is set
- [ ] Confirm `SENTRY_DSN` is set (optional)
- [ ] Confirm `SENTRY_AUTH_TOKEN` is set (optional)

---

## ⏳ Phase 6: Tool Registry/Intake System (PENDING - EXTERNAL)

### Update Intake Process

- [ ] Modify tool submission form to mention version requirements
- [ ] Update submission validation to check for:
    - [ ] `features.minAPI` in package.json
    - [ ] Valid semver format for minAPI
    - [ ] Presence of npm-shrinkwrap.json
    - [ ] `@pptb/types` in shrinkwrap dependencies
- [ ] Add extraction logic:
    - [ ] Read `package.json` → extract `features.minAPI`
    - [ ] Read `npm-shrinkwrap.json` → extract `@pptb/types` version
    - [ ] Remove semver prefixes (^, ~) from maxAPI
- [ ] Add validation logic:
    - [ ] Validate semver format
    - [ ] Check minAPI <= maxAPI if both present
    - [ ] Check minAPI >= MIN_SUPPORTED_API_VERSION
- [ ] Update database insert/update to include version fields
- [ ] Test with sample tool submission

### Update Rejection Criteria

Add to tool submission guidelines:

- [ ] Tools must include `features.minAPI` in package.json
- [ ] Tools must include npm-shrinkwrap.json
- [ ] Tools must have `@pptb/types` in devDependencies
- [ ] Version format must be valid semver

### Update Local Registry

- [ ] Update `src/main/data/registry.json` with version fields
- [ ] Add minAPI and maxAPI to existing tools
- [ ] Commit updated registry

---

## ⏳ Phase 7: Communication & Rollout (PENDING - EXTERNAL)

### Tool Developer Communication

- [ ] Draft announcement email/post
- [ ] Include:
    - [ ] Feature overview
    - [ ] Why it matters
    - [ ] How to update existing tools
    - [ ] Link to documentation
    - [ ] Migration deadline (if any)
- [ ] Post announcement in:
    - [ ] GitHub Discussions
    - [ ] Discord/Slack community
    - [ ] Developer newsletter
    - [ ] Blog post
- [ ] Send direct emails to active tool developers

### User Communication

- [ ] Update main documentation/wiki
- [ ] Add section to user guide explaining:
    - [ ] What "Not Supported" badge means
    - [ ] How to update ToolBox
    - [ ] What to do if tool shows as unsupported
- [ ] Create FAQ entries
- [ ] Prepare support team with common questions

### Release Notes

- [ ] Add to CHANGELOG.md:

    ```markdown
    ## [Version X.Y.Z] - YYYY-MM-DD

    ### Added

    - Tool version compatibility checking
    - Visual indicators for unsupported tools
    - Automatic @pptb/types publishing in release workflow

    ### Changed

    - Tools now require minimum version specification
    - Install button disabled for incompatible tools
    ```

---

## ⏳ Phase 8: Testing & Validation (PENDING)

### Manual Testing

- [ ] **Test 1: Tool Installation**
    1. Install a test tool with version info
    2. Verify minAPI and maxAPI are captured in manifest.json
    3. Check tool displays correctly in sidebar

- [ ] **Test 2: Compatibility Check**
    1. Temporarily modify MIN_SUPPORTED_API_VERSION
    2. Verify tool shows "Not Supported" badge
    3. Attempt to launch tool
    4. Verify warning notification appears
    5. Restore original constant

- [ ] **Test 3: UI Display**
    1. View tool in sidebar (both compact and standard modes)
    2. View tool in marketplace
    3. Verify badge appears correctly
    4. Verify install button is disabled
    5. Check visual styling (opacity, border)

- [ ] **Test 4: Legacy Tools**
    1. Install a tool without version info
    2. Verify it's treated as compatible (no badge)
    3. Verify it can be launched normally

- [ ] **Test 5: Marketplace Filtering**
    1. Browse marketplace with various ToolBox versions
    2. Verify unsupported tools are clearly marked
    3. Verify install button behavior

### Automated Testing

- [ ] Write unit tests for `compareVersions()` function
- [ ] Write unit tests for `isToolSupported()` function
- [ ] Test version extraction from package.json
- [ ] Test version extraction from npm-shrinkwrap.json
- [ ] Test database schema with sample data

### Cross-Platform Testing

- [ ] Test on Windows 10/11
- [ ] Test on macOS (Intel)
- [ ] Test on macOS (Apple Silicon)
- [ ] Test on Linux (Ubuntu/Debian)
- [ ] Verify consistent behavior across platforms

### Workflow Testing

- [ ] Create test PR to trigger workflows
- [ ] Verify version validation step works
- [ ] Verify @pptb/types publishing works (can use beta channel)
- [ ] Test with intentional version mismatch
- [ ] Verify workflow fails appropriately

---

## ⏳ Phase 9: Monitoring & Iteration (ONGOING)

### Week 1 After Release

- [ ] Monitor error logs for version-related issues
- [ ] Track support tickets related to version compatibility
- [ ] Gather user feedback
- [ ] Monitor tool submission issues

### Week 2-4 After Release

- [ ] Analyze adoption rate by tool developers
- [ ] Identify tools still missing version info
- [ ] Reach out to developers of popular tools
- [ ] Refine documentation based on feedback

### Ongoing

- [ ] Monthly review of version distribution
- [ ] Quarterly review of MIN_SUPPORTED_API_VERSION
- [ ] Track feature requests and improvements
- [ ] Document lessons learned

---

## 🚨 Rollback Plan

If critical issues are discovered:

### Application Rollback

1. Revert PR commits
2. Redeploy previous version
3. Notify users

### Database Rollback

1. Backup current data:
    ```sql
    CREATE TABLE tools_version_backup AS
    SELECT id, min_api, max_api FROM tools;
    ```
2. Drop indexes and constraints
3. Remove columns
4. Restore from backup if needed

### Communication

- [ ] Post rollback announcement
- [ ] Explain issues encountered
- [ ] Provide timeline for re-implementation
- [ ] Thank community for patience

---

## ✅ Success Criteria

The feature is considered successfully implemented when:

- [x] All Phase 1 (Application Code) tasks complete
- [x] All Phase 2 (GitHub Workflows) tasks complete
- [x] All Phase 3 (Documentation) tasks complete
- [ ] All Phase 4 (Database) tasks complete
- [ ] All Phase 5 (GitHub Setup) tasks complete
- [ ] All Phase 6 (Intake System) tasks complete
- [ ] All Phase 7 (Communication) tasks complete
- [ ] All Phase 8 (Testing) tasks complete
- [ ] No critical bugs in production for 2 weeks
- [ ] Positive community feedback
- [ ] At least 50% of active tools updated with version info

---

## Resources

- **Documentation**:
    - `docs/TOOL_VERSION_COMPATIBILITY.md`
    - `docs/SUPABASE_SCHEMA_UPDATES.md`
- **Code Changes**:
    - `src/common/types/tool.ts`
    - `src/main/constants.ts`
    - `src/main/managers/toolsManager.ts`
    - `src/main/managers/toolRegistryManager.ts`
    - `src/renderer/modules/toolManagement.ts`
    - `src/renderer/modules/toolsSidebarManagement.ts`
    - `src/renderer/modules/marketplaceManagement.ts`
    - `src/renderer/styles.scss`

- **Workflows**:
    - `.github/workflows/prod-release.yml`
    - `.github/workflows/nightly-release.yml`

- **External Resources**:
    - [Semantic Versioning](https://semver.org/)
    - [npm Shrinkwrap Docs](https://docs.npmjs.com/cli/v8/commands/npm-shrinkwrap)
    - [Supabase Documentation](https://supabase.com/docs)

---

## Notes

- This checklist should be reviewed and updated as implementation progresses
- Mark items as complete with timestamps and assignee names
- Document any deviations from the plan
- Keep stakeholders informed of progress

**Last Updated**: 2026-02-11  
**Status**: Phases 1-3 Complete, Phases 4-9 Pending External Action
