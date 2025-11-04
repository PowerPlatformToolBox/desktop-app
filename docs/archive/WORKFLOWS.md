# GitHub Actions Workflows Documentation

This document describes the automated build and release workflows for the Power Platform Tool Box desktop application.

## Overview

The repository includes two GitHub Actions workflows that automate the build and release process:

1. **Nightly Dev Build** - Automated nightly builds from the `dev` branch
2. **Release Build** - Stable releases triggered by PR merges to `main`

## Workflow 1: Nightly Dev Build

**File:** `.github/workflows/nightly-build.yml`

### Purpose

Creates automated nightly builds from the `dev` branch to allow testers and early adopters to try the latest development features.

### Triggers

- **Scheduled:** Runs daily at midnight UTC (00:00)
- **Manual:** Can be triggered manually via GitHub Actions UI (workflow_dispatch)

### Build Process

#### 1. Check for New Commits
- Checks if there are any commits in the last 24 hours on the `dev` branch
- If no commits are found, the workflow skips the build to save resources
- If commits are found, proceeds with the build

#### 2. Version Calculation
- Reads current version from `package.json` (e.g., `1.0.0`)
- Appends `-dev.YYYYMMDD` suffix (e.g., `1.0.0-dev.20251025`)
- Updates `package.json` with the new version for the build

#### 3. Multi-Platform Build
Builds the application on three platforms in parallel:
- **Ubuntu (latest)** → AppImage, Snap, DEB, RPM
- **Windows (latest)** → NSIS installer (.exe), MSI
- **macOS (latest)** → DMG, PKG

**Note:** Code signing is disabled for nightly builds (`CSC_IDENTITY_AUTO_DISCOVERY: false`)

#### 4. Artifact Upload
- Uploads build artifacts to GitHub Actions
- Retention: 30 days
- Separate artifacts for each platform

#### 5. Pre-Release Creation
- Creates a GitHub pre-release (marked as pre-release, not draft)
- Tag format: `v1.0.0-dev.20251025`
- Release name: `Nightly Dev Build - v1.0.0-dev.20251025`
- Includes all build artifacts as downloadable assets
- Includes warning about instability and development status

### Release Notes Template

The nightly build release includes:
- Version information
- Branch name (dev)
- Number of commits in the last 24 hours
- Build date/ID
- Warning about pre-release status
- Installation instructions per platform
- Links to commits and issue reporting

### Usage

#### For Users
1. Go to the [Releases page](https://github.com/PowerPlatformToolBox/desktop-app/releases)
2. Find the latest nightly build (marked as "Pre-release")
3. Download the appropriate installer for your platform
4. Install and test

#### For Developers
To trigger a manual nightly build:
1. Go to Actions → Nightly Dev Build
2. Click "Run workflow"
3. Select the `dev` branch
4. Click "Run workflow"

### Requirements

- GitHub repository with `dev` branch
- GitHub token with `contents: write` permission (automatically provided)
- Node.js 20
- pnpm 10.18.3

---

## Workflow 2: Release Build

**File:** `.github/workflows/release.yml`

### Purpose

Creates stable releases when a pull request is merged into the `main` branch.

### Triggers

- **PR Merge:** Automatically triggers when a PR is closed via merge into `main`
- Only runs if the PR was actually merged (not just closed)

### Build Process

#### 1. Version from package.json
- Uses the existing version from `package.json` in the merged code
- **Does not auto-increment** - version should be updated in the PR before merging
- This allows full control over semantic versioning (major, minor, patch)

#### 2. Multi-Platform Build
Builds the application on three platforms in parallel:
- **Ubuntu (latest)** → AppImage, Snap, DEB, RPM
- **Windows (latest)** → NSIS installer (.exe), MSI
- **macOS (latest)** → DMG, PKG

**Note:** Code signing is optional - set `CSC_IDENTITY_AUTO_DISCOVERY: false` if no certificate is configured

#### 3. Artifact Upload
- Uploads build artifacts to GitHub Actions
- Retention: 90 days (longer than nightly builds)
- Separate artifacts for each platform

#### 4. Stable Release Creation
- Creates a GitHub stable release (NOT marked as pre-release)
- Tag format: `v1.0.0` (matches version in package.json)
- Release name: `Power Platform Tool Box v1.0.0`
- Includes all build artifacts as downloadable assets
- Includes PR information and links

### Release Notes Template

The release includes:
- Version information
- Release date (from PR merge timestamp)
- Link to the merged PR
- Installation instructions per platform
- Auto-update information
- Links to documentation, changelog, and contributing guide

### Usage

#### For Release Managers

To create a new release:

1. **Update version in PR:**
   ```bash
   # In your PR branch
   npm version patch  # or minor, or major
   git push
   ```

2. **Merge the PR to main:**
   - Review and approve the PR
   - Merge into `main` branch
   - Workflow automatically triggers

3. **Monitor the workflow:**
   - Go to Actions → Release Build
   - Wait for all platforms to build (usually 10-15 minutes)
   - Release will be created automatically

4. **Verify the release:**
   - Check the [Releases page](https://github.com/PowerPlatformToolBox/desktop-app/releases)
   - Download and test installers
   - Update release notes if needed (edit the release)

#### For Users
1. Go to the [Releases page](https://github.com/PowerPlatformToolBox/desktop-app/releases)
2. Find the latest stable release (NOT marked as "Pre-release")
3. Download the appropriate installer for your platform
4. Install and use

### Version Management

**Important:** The release workflow does NOT auto-increment the version. You must:

1. Update `package.json` version in your PR before merging to `main`
2. Follow semantic versioning:
   - **Major (1.0.0 → 2.0.0):** Breaking changes
   - **Minor (1.0.0 → 1.1.0):** New features, backward compatible
   - **Patch (1.0.0 → 1.0.1):** Bug fixes, backward compatible

Use npm version commands:
```bash
npm version major   # 1.0.0 → 2.0.0
npm version minor   # 1.0.0 → 1.1.0
npm version patch   # 1.0.0 → 1.0.1
```

### Requirements

- GitHub repository with `main` branch
- GitHub token with `contents: write` permission (automatically provided)
- Node.js 20
- pnpm 10.18.3

---

## Troubleshooting

### Common Issues

#### 1. Nightly Build Not Running
- **Check commits:** Ensure there are commits in the last 24 hours on `dev`
- **Check logs:** Go to Actions → Nightly Dev Build → Latest run
- **Manual trigger:** Use workflow_dispatch to run manually for testing

#### 2. Release Build Not Triggering
- **Check PR status:** Ensure the PR was actually merged (not just closed)
- **Check branch:** Ensure the PR was targeting `main`
- **Check logs:** Go to Actions → Release Build → Latest run

#### 3. Build Failures

**macOS signing issues:**
```
Error: CSC_LINK or CSC_KEY_PASSWORD is not set
```
**Solution:** Set `CSC_IDENTITY_AUTO_DISCOVERY: false` (already configured)

**pnpm not found:**
```
bash: pnpm: command not found
```
**Solution:** Ensure pnpm installation step is present (already configured)

**Electron builder timeout:**
```
Error: Process completed with exit code 1
```
**Solution:** Check electron-builder logs in the workflow output

#### 4. Release Creation Issues

**Tag already exists:**
```
Error: tag v1.0.0 already exists
```
**Solution:** Update the version in package.json before merging

**Missing artifacts:**
```
Error: No files were found with the provided path
```
**Solution:** Check the build step completed successfully

### Manual Intervention

If a workflow fails, you can:

1. **Re-run the workflow:**
   - Go to Actions → Failed workflow run
   - Click "Re-run failed jobs" or "Re-run all jobs"

2. **Create a manual release:**
   ```bash
   # Build locally
   pnpm run build
   pnpm run package
   
   # Create release manually via GitHub UI
   # Upload files from build/ directory
   ```

---

## Security Considerations

### Secrets and Tokens

- Both workflows use `GITHUB_TOKEN` (automatically provided)
- No custom secrets are required
- No API keys or credentials are exposed

### Code Signing

- **Nightly builds:** Code signing is disabled
- **Release builds:** Code signing is optional
- To enable code signing:
  1. Add certificates as repository secrets
  2. Remove or modify `CSC_IDENTITY_AUTO_DISCOVERY: false` line

### Permissions

Both workflows require:
- `contents: write` - To create releases and tags

These are minimal permissions for the required functionality.

---

## Future Enhancements

Potential improvements for the workflows:

1. **Automated Changelog Generation:** Use conventional commits to generate changelog
2. **Code Signing:** Add proper code signing for all platforms
3. **Notarization:** Add Apple notarization for macOS builds
4. **Beta Channel:** Add separate beta release workflow
5. **Build Caching:** Cache node_modules for faster builds
6. **Test Integration:** Run automated tests before building
7. **Slack/Discord Notifications:** Notify team on release completion

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [electron-builder Documentation](https://www.electron.build/)
- [Semantic Versioning](https://semver.org/)
- [Repository](https://github.com/PowerPlatformToolBox/desktop-app)
