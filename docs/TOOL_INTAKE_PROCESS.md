# Tool Intake Process

This document describes the process for adding new tools to the Power Platform Tool Box registry and keeping them updated.

## Table of Contents

- [Overview](#overview)
- [New Tool Intake Process](#new-tool-intake-process)
- [Tool Update Process](#tool-update-process)
- [Automation Architecture](#automation-architecture)
- [Submission Form Requirements](#submission-form-requirements)
- [Review Process](#review-process)
- [Alternative Approaches](#alternative-approaches)

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

1. **Develop the tool** following the [Tool Development Guide](./TOOL_DEVELOPMENT.md)
2. **Test locally** using the ToolBox debug feature
3. **Publish to npm**:
   ```bash
   npm publish
   # or for scoped packages
   npm publish --access public
   ```
4. **Verify npm publication** at `https://www.npmjs.com/package/your-package-name`

### Step 2: Submit Tool Intake Form

Tool developers submit a form with the following information:

**Required Fields:**
- **npm Package Name** (e.g., `@username/tool-name`)
- **Display Name** (how it appears in ToolBox)
- **Short Description** (one-line summary)
- **Detailed Description** (markdown supported)
- **Author Name/Organization**
- **Author Email**
- **GitHub Repository URL** (for source code review)
- **Homepage/Documentation URL** (optional)
- **License** (must be open source compatible)
- **Tags/Categories** (select from predefined list)
- **Icon** (optional, uploaded or URL)
- **Screenshots** (optional, for marketplace display)

**Form Implementation Options:**
- **GitHub Issues Template** (simplest, uses GitHub Issues)
- **GitHub Discussions** (for community visibility)
- **Custom Web Form** (hosted separately, submits to GitHub)
- **Google Form** → GitHub Integration

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

1. **Downloads npm package**:
   ```bash
   npm pack <package-name>
   tar -xzf <package-name>.tgz
   cd package
   ```

2. **Installs dependencies & builds**:
   ```bash
   npm install --production
   npm run build  # if build script exists
   ```

3. **Creates distribution archive**:
   ```bash
   # Remove unnecessary files
   rm -rf node_modules src .git
   
   # Create clean tar.gz
   tar -czf <tool-id>-<version>.tar.gz \
     package.json index.html dist/ assets/
   ```

4. **Generates metadata**:
   ```bash
   # Calculate checksum
   sha256sum <tool-id>-<version>.tar.gz
   
   # Get file size
   stat -f%z <tool-id>-<version>.tar.gz
   ```

5. **Uploads to CDN/GitHub Releases**

6. **Updates registry.json**:
   - Adds new tool entry
   - Updates timestamps
   - Commits and pushes changes

7. **Notifies submitter** via email/GitHub

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

### Manual Update Request

Tool developers can also request immediate updates:

1. Submit update request via GitHub Issue
2. Specify npm package name and new version
3. Automated system processes immediately
4. Skips some checks since tool already approved

## Automation Architecture

### Recommended Setup

**Option 1: GitHub Actions (Recommended)**

```yaml
# .github/workflows/tool-intake.yml
name: Tool Intake Process

on:
  issues:
    types: [labeled]
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight

jobs:
  process-intake:
    if: contains(github.event.issue.labels.*.name, 'tool-intake')
    runs-on: ubuntu-latest
    steps:
      - name: Parse submission
        # Extract npm package name from issue
      
      - name: Validate package
        # Check npm, run security scans
      
      - name: Convert to tar.gz
        # Download, build, package
      
      - name: Upload to releases
        # Upload archive to GitHub Releases
      
      - name: Update registry
        # Update registry.json
      
      - name: Notify submitter
        # Comment on issue

  check-updates:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - name: Check for updates
        # Compare npm versions with registry
      
      - name: Process updates
        # Convert and update changed tools
```

**Option 2: Dedicated Server/Lambda**

- AWS Lambda triggered by GitHub webhooks
- Azure Functions for serverless processing
- Dedicated Node.js server with job queue

### Components Needed

1. **Intake Handler**
   - Parses submission forms
   - Validates npm packages
   - Creates tracking issues

2. **Converter Service**
   - Downloads npm packages
   - Runs build process in isolation (Docker container)
   - Creates tar.gz archives
   - Generates checksums

3. **CDN Uploader**
   - Uploads archives to hosting
   - Updates registry.json
   - Handles versioning

4. **Update Checker**
   - Scheduled job
   - Compares versions
   - Queues updates

5. **Notification Service**
   - Emails developers
   - Updates GitHub issues
   - Sends Discord/Slack notifications

## Submission Form Requirements

### GitHub Issue Template

Create `.github/ISSUE_TEMPLATE/tool-submission.yml`:

```yaml
name: Tool Submission
description: Submit a new tool to the Power Platform Tool Box registry
title: "[Tool Submission] "
labels: ["tool-intake", "pending-review"]
body:
  - type: markdown
    attributes:
      value: |
        ## Submit Your Tool
        Fill out this form to submit your tool to the registry.
  
  - type: input
    id: npm-package
    attributes:
      label: npm Package Name
      description: The name of your published npm package
      placeholder: "@username/tool-name"
    validations:
      required: true
  
  - type: input
    id: display-name
    attributes:
      label: Display Name
      description: How your tool will appear in the ToolBox
      placeholder: "My Awesome Tool"
    validations:
      required: true
  
  - type: textarea
    id: description
    attributes:
      label: Description
      description: Brief description of what your tool does
    validations:
      required: true
  
  - type: input
    id: author
    attributes:
      label: Author
      description: Your name or organization
    validations:
      required: true
  
  - type: input
    id: repository
    attributes:
      label: Repository URL
      description: GitHub repository for source code review
      placeholder: "https://github.com/username/tool-name"
    validations:
      required: true
  
  - type: dropdown
    id: category
    attributes:
      label: Category
      options:
        - Data Management
        - Development
        - Utilities
        - Reporting
        - Administration
        - Other
    validations:
      required: true
  
  - type: input
    id: license
    attributes:
      label: License
      description: Software license (must be open source)
      placeholder: "MIT"
    validations:
      required: true
  
  - type: checkboxes
    id: terms
    attributes:
      label: Guidelines Agreement
      options:
        - label: I have read and agree to the tool development guidelines
          required: true
        - label: My tool does not contain malicious code
          required: true
        - label: I have tested my tool in the ToolBox
          required: true
```

## Review Process

### Review Checklist

- [ ] npm package exists and is publicly accessible
- [ ] Package.json has all required fields
- [ ] Tool follows ToolBox tool format
- [ ] No obvious security issues
- [ ] License is compatible
- [ ] Repository is public and contains source code
- [ ] Tool works in ToolBox debug mode
- [ ] Documentation is adequate
- [ ] No copyright violations

### Review Outcomes

1. **Approved** → Automated conversion begins
2. **Needs Changes** → Developer notified with feedback
3. **Rejected** → Issue closed with explanation

## Alternative Approaches

### Option A: Fully Manual Process

**Pros:**
- Maximum control
- Thorough review
- Simple setup

**Cons:**
- Slow turnaround
- Requires maintainer time
- Doesn't scale

### Option B: Fully Automated (No Review)

**Pros:**
- Instant availability
- No maintainer overhead
- Scales infinitely

**Cons:**
- Security risks
- Quality concerns
- Potential for abuse

### Option C: Hybrid (Recommended)

**Pros:**
- Automated conversion
- Manual security review
- Best of both worlds

**Cons:**
- Some maintainer overhead
- Moderate complexity

**Implementation:**
- Automated: Conversion, packaging, CDN upload
- Manual: Security review, approval/rejection
- Automated: Updates for previously approved tools

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

- **Submission volume** - Tools submitted per month
- **Review time** - Time from submission to decision
- **Approval rate** - Percentage of tools approved
- **Update frequency** - How often tools are updated
- **User installs** - Most popular tools
- **Security incidents** - Issues found and resolved

## Getting Started

### For Tool Developers

1. Read the [Tool Development Guide](./TOOL_DEVELOPMENT.md)
2. Read the [Tool Registry Guide](./TOOL_REGISTRY.md)
3. Develop and test your tool
4. Publish to npm
5. Submit via GitHub Issues

### For Registry Maintainers

1. Set up automation server (GitHub Actions recommended)
2. Configure CDN for hosting archives
3. Create intake issue template
4. Establish review process
5. Document guidelines
6. Start accepting submissions

## Support

- **Tool Developers**: Submit questions via GitHub Discussions
- **Users**: Report issues with tools via GitHub Issues
- **Maintainers**: Internal documentation and processes

---

For more information:
- [Tool Development Guide](./TOOL_DEVELOPMENT.md)
- [Tool Registry Guide](./TOOL_REGISTRY.md)
- [Architecture Documentation](./ARCHITECTURE.md)
