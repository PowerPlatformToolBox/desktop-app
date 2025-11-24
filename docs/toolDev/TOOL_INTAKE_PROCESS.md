# Tool Intake Process

This document describes the process for adding new tools to the Power Platform Tool Box registry and keeping them updated.

## Table of Contents

-   [Overview](#overview)
-   [New Tool Intake Process](#new-tool-intake-process)
-   [Tool Update Process](#tool-update-process)
-   [Automation Architecture](#automation-architecture)
-   [Submission Form Requirements](#submission-form-requirements)
-   [Review Process](#review-process)
-   [Alternative Approaches](#alternative-approaches)

## Overview

The Power Platform Tool Box uses a registry-based system where tools are distributed as pre-built `.tar.gz` archives. Tool developers publish their tools to npm, and an automated system converts them to the registry format.

### Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     Tool Developer                               │
│  - Develops tool                                                │
│  - Publishes to npm                                             │
│  - Submits intake form                                          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Tool Intake Form                                │
│  - Tool npm package name                                        │
│  - Tool description                                             │
│  - Author information                                           │
│  - Tags/categories                                              │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│               Review & Approval Process                          │
│  - Maintainers review submission                                │
│  - Check for malicious code                                     │
│  - Verify tool follows guidelines                               │
│  - Approve or request changes                                   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│            Automated Conversion Server                           │
│  - Downloads npm package                                        │
│  - Runs npm install & build                                     │
│  - Creates .tar.gz archive                                      │
│  - Generates checksum                                           │
│  - Uploads to CDN                                               │
│  - Updates registry.json                                        │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                Tool Registry (GitHub/CDN)                        │
│  - registry.json updated                                        │
│  - Tool available in ToolBox                                    │
│  - Users can install                                            │
└─────────────────────────────────────────────────────────────────┘
```

## New Tool Intake Process

### Step 1: Tool Developer Prepares Tool

1. **Develop the tool** following the [Tool Development Guide](./TOOL_DEV.md)
2. **Publish to npm**:
    ```bash
    npm publish
    # or for scoped packages
    npm publish --access public
    ```
3. **Test locally** using the ToolBox debug feature
4. **Verify npm publication** at `https://www.npmjs.com/package/your-package-name`

### Step 2: Submit Tool Intake Form

Tool developers [submit a form](https://github.com/PowerPlatformToolBox/pptb-web/issues/new?template=tool-submission.yml) with the following information:

**Required Fields:**

-   **npm Package Name** (e.g., `@username/tool-name`)
-   **Display Name** (how it appears in ToolBox)
-   **Description** (markdown supported)
-   **Author Name/Organization**
-   **GitHub Repository URL** (for source code review)
-   **Homepage/Documentation URL** (optional)
-   **Tags/Categories** (select from predefined list)

### Step 3: Automated Initial Checks

When a submission is received, automated checks run:

1. **Verify npm package exists** and is publicly accessible
2. **Check package.json** has required fields (`name`, `version`, `main`, etc.)
3. **Scan for security issues** using npm audit
4. **Validate license** is open source compatible
5. **Check repository** is public and accessible
6. **Create tracking issue** if all checks pass

### Step 4: Manual Review Process

Maintainers review the tool:

1. **Security Review**:

    - Check for malicious code
    - Verify dependencies are legitimate
    - Review package.json scripts
    - Scan with security tools

2. **Quality Review**:

    - Test tool functionality
    - Check UI/UX quality
    - Verify it works in ToolBox
    - Ensure documentation is adequate

3. **Compliance Review**:

    - Verify license compatibility
    - Check for copyright issues
    - Ensure follows ToolBox guidelines

4. **Decision**:
    - ✅ **Approve** - Tool proceeds to conversion
    - 🔄 **Request Changes** - Developer notified
    - ❌ **Reject** - With explanation

### Step 5: Automated Conversion & Publishing

Once approved, the automation server:

1. **Downloads npm package**
2. **Installs dependencies & builds**
3. **Creates distribution archive**
4. **Generates metadata**
5. **Uploads to GitHub Releases**
6. **Updates registry.json**
7. **Notifies submitter** via comment on the GitHub issue for Tool Intake

## Tool Update Process

### Automatic Update Detection

A scheduled job runs periodically (e.g., daily) to check for updates:

```javascript
// Pseudocode for update checker
for (const tool of registryTools) {
    const npmVersion = await getNpmLatestVersion(tool.npmPackage);
    const registryVersion = tool.version;

    if (semver.gt(npmVersion, registryVersion)) {
        // New version available
        await queueToolUpdate(tool, npmVersion);
    }
}
```

### Update Workflow

1. **Detect new version** on npm
2. **Create update PR** in registry repository
3. **Run conversion process** (same as new tool)
4. **Automated tests** verify tool still works
5. **Auto-merge** if tests pass (or require manual review)
6. **Update registry.json**
7. **Notify tool developer** of successful update

### Manual Update Request (_yet to be created - wip_)

Tool developers can also request immediate updates:

1. Submit update request via GitHub Issue
2. Specify npm package name and new version
3. Automated system processes immediately
4. Skips some checks since tool already approved

## Security Considerations

### Before Approval

1. **Code Review** - Manual inspection of source
2. **Dependency Scan** - Check all dependencies
3. **Malware Scan** - Run security scanners
4. **Sandbox Testing** - Test in isolated environment

### After Approval

1. **Continuous Monitoring** - Watch for npm advisories
2. **Version Pinning** - Lock dependency versions
3. **Regular Re-scans** - Periodic security checks
4. **Quick Removal** - Fast process to remove compromised tools

## Best Practices

### For Developers

1. **Keep tools updated** - Regular npm publishes
2. **Follow semantic versioning** - Clear version numbers
3. **Document changes** - Maintain CHANGELOG
4. **Test before publishing** - Use debug feature
5. **Respond to feedback** - Quick response to review comments

### For Maintainers

1. **Fast review turnaround** - Respond within 48 hours
2. **Clear feedback** - Specific, actionable comments
3. **Consistent standards** - Apply guidelines uniformly
4. **Security first** - Never compromise on security
5. **Community engagement** - Active communication

## Metrics to Track

-   **Submission volume** - Tools submitted per month
-   **Review time** - Time from submission to decision
-   **Approval rate** - Percentage of tools approved
-   **Update frequency** - How often tools are updated
-   **User installs** - Most popular tools
-   **Security incidents** - Issues found and resolved

## Support

-   **Tool Developers**: Submit questions via GitHub Discussions
-   **Users**: Report issues with tools via GitHub Issues
-   **Maintainers**: Internal documentation and processes

---

For more information:

-   [Tool Development Guide](./TOOL_DEV.md)
-   [Architecture Documentation](./ARCHITECTURE.md)
