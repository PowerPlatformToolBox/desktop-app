# Azure Blob Storage Migration Strategy

This document describes the strategy for moving tool distribution from GitHub Releases to Azure Blob Storage and outlines the updated intake process.

## Overview

Tool packages (`.tar.gz` archives) were previously hosted as GitHub Release assets on the `pptb-web` repository. They are being migrated to **Azure Blob Storage** to allow easier automation, lower latency, and decoupled storage from GitHub.

The ToolBox application already fetches tool metadata from **Supabase**. Azure Blob Storage becomes the authoritative location for the binary artifacts (the `.tar.gz` packages) **and** for a remote fallback registry index when Supabase is unreachable.

---

## Azure Blob Container Layout

All tool assets live in a single public Azure Blob container (anonymous read access on blobs), with each tool version in its own folder — mirroring the GitHub Releases structure:

```
<account>.blob.core.windows.net/tools/
├── registry.json                                      # Remote registry index (fallback after Supabase)
└── packages/
    └── <tool-id>-<version>/                           # Per-tool version folder
        ├── <tool-id>-<version>.tar.gz                 # Tool package archive
        └── <tool-id>-<version>.svg                    # Tool icon
```

**Example:**

```
https://<storage-account>.blob.core.windows.net/tools/registry.json
https://<storage-account>.blob.core.windows.net/tools/packages/pptb-standard-sample-tool-1.0.9/pptb-standard-sample-tool-1.0.9.tar.gz
https://<storage-account>.blob.core.windows.net/tools/packages/pptb-standard-sample-tool-1.0.9/pptb-standard-sample-tool-1.0.9.svg
```

---

## Configuration

Set the following environment variable before building the app (add it to your `.env` file or CI/CD pipeline secrets):

| Variable              | Description                                      | Example                                                 |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| `AZURE_BLOB_BASE_URL` | Full URL to the root of the tools blob container | `https://<storage-account>.blob.core.windows.net/tools` |
| `SUPABASE_URL`        | Supabase project URL (unchanged)                 | `https://xyz.supabase.co`                               |
| `SUPABASE_ANON_KEY`   | Supabase anonymous key (unchanged)               | `eyJ...`                                                |

### `.env` example

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
AZURE_BLOB_BASE_URL=https://<storage-account>.blob.core.windows.net/tools
```

> **Note:** `AZURE_BLOB_BASE_URL` is injected at build time via Vite and is **not** a runtime secret. The container must allow anonymous read access (no SAS token required for downloads).

---

## Registry Fallback Chain

The ToolBox app resolves the tool registry in the following order:

```
1. Supabase (primary)          – real-time metadata, analytics, contributor info
   ↓ (on failure)
2. Azure Blob registry.json    – remote static snapshot (requires AZURE_BLOB_BASE_URL)
   ↓ (on failure or not configured)
3. Local registry.json         – bundled fallback shipped with the app binary
```

The Azure Blob `registry.json` must follow the same schema as the local `src/main/data/registry.json` file (see [Local Registry Schema](#local-registry-schema) below).

---

## Tool Package Format

Tool packages are `.tar.gz` archives containing the tool's files. The archive is extracted with:

```sh
tar -xzf <tool-id>-<version>.tar.gz -C <target-directory>
```

The extracted directory must contain a `package.json` at its root:

```
<tool-id>/
├── package.json      # Required – contains tool metadata (name, version, description, …)
├── index.html        # Required – tool entry point
└── ...               # Additional assets
```

---

## Local Registry Schema

Both `registry.json` (bundled) and the Azure Blob `registry.json` share this schema:

> **`downloadUrl` convention:**
>
> - Supabase rows should use **absolute** HTTPS URLs.
> - For Azure Blob `registry.json` fallback, you can either:
>     - Use **absolute** HTTPS URLs (recommended when `registry.json` is at `.../tools/registry.json` but packages are under `.../tools/packages/...`), or
>     - Use just the **filename** (e.g. `my-tool-1.0.0.tar.gz`) _only if_ `AZURE_BLOB_BASE_URL` points at the same prefix used for packages and `registry.json` is also under that prefix.
>
> The app resolves relative filenames by deriving a folder name from the filename (strip `.tar.gz`) and joining it to `AZURE_BLOB_BASE_URL`.

```json
{
    "version": "1.0",
    "updatedAt": "<ISO-8601 timestamp>",
    "description": "Power Platform ToolBox - Official Tool Registry",
    "tools": [
        {
            "id": "my-tool-id",
            "packageName": "my-tool-npm-package",
            "name": "My Tool",
            "description": "Tool description",
            "authors": ["Author Name"],
            "version": "1.0.0",
            "downloadUrl": "my-tool-id-1.0.0.tar.gz",
            "icon": "icon.png",
            "checksum": "sha256:<hex>",
            "size": 75000,
            "publishedAt": "<ISO-8601 timestamp>",
            "tags": ["dataverse"],
            "readme": "https://...",
            "minToolboxVersion": "1.0.0",
            "repository": "https://github.com/...",
            "homepage": "https://...",
            "license": "MIT",
            "cspExceptions": {
                "connect-src": ["https://*.dynamics.com"]
            }
        }
    ]
}
```

---

## Updated Intake Process

### Current Process (GitHub Releases)

```
User submits tool via web app (pptb-web)
  → Review & approval
  → convert-tool GitHub Action pre-packages the tool from npm
  → Package uploaded as a GitHub Release asset on pptb-web
  → Supabase row updated with downloadurl pointing to the GitHub Release asset
```

### New Process (Azure Blob Storage)

```
User submits tool via web app (pptb-web)
  → Review & approval
  → convert-tool GitHub Action pre-packages the tool from npm (unchanged)
  → Both the .tar.gz and .svg (icon) are uploaded to a per-tool version folder in Azure Blob:
      az storage blob upload \
        --account-name <storage-account> \
        --container-name tools \
        --name "packages/<tool-id>-<version>/<tool-id>-<version>.tar.gz" \
        --file "<tool-id>-<version>.tar.gz" \
        --auth-mode login
      az storage blob upload \
        --account-name <storage-account> \
        --container-name tools \
        --name "packages/<tool-id>-<version>/<tool-id>-<version>.svg" \
        --file "<tool-id>-<version>.svg" \
        --auth-mode login
  → Supabase row updated with downloadurl pointing to the Azure Blob URL:
      https://<storage-account>.blob.core.windows.net/tools/packages/<tool-id>-<version>/<tool-id>-<version>.tar.gz
  → (Optional) registry.json in the blob container is regenerated to include the new entry
```

### Changes to the `convert-tool` GitHub Action

Replace the GitHub Release upload step with an Azure Blob upload step. The CI/CD pipeline will need the following secrets configured:

| Secret                    | Description                                                               |
| ------------------------- | ------------------------------------------------------------------------- |
| `AZURE_STORAGE_ACCOUNT`   | Storage account name (e.g. `<storage-account>`)                           |
| `AZURE_STORAGE_CONTAINER` | Container name (e.g. `tools`)                                             |
| `AZURE_CREDENTIALS`       | Azure service principal credentials JSON (used with `azure/login` action) |

**Example workflow snippet (replace the current GitHub Release upload step):**

```yaml
- name: Login to Azure
  uses: azure/login@v2
  with:
      creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Upload tool package and icon to Azure Blob
  run: |
      FOLDER="${{ env.TOOL_ID }}-${{ env.TOOL_VERSION }}"
      az storage blob upload \
        --account-name ${{ secrets.AZURE_STORAGE_ACCOUNT }} \
        --container-name ${{ secrets.AZURE_STORAGE_CONTAINER }} \
        --name "packages/${FOLDER}/${FOLDER}.tar.gz" \
        --file "${FOLDER}.tar.gz" \
        --auth-mode login \
        --overwrite true
      az storage blob upload \
        --account-name ${{ secrets.AZURE_STORAGE_ACCOUNT }} \
        --container-name ${{ secrets.AZURE_STORAGE_CONTAINER }} \
        --name "packages/${FOLDER}/${FOLDER}.svg" \
        --file "${FOLDER}.svg" \
        --auth-mode login \
        --overwrite true

- name: Regenerate Azure Blob registry.json
  run: |
      # Download current registry.json, add new tool entry, re-upload
      az storage blob download \
        --account-name ${{ secrets.AZURE_STORAGE_ACCOUNT }} \
        --container-name ${{ secrets.AZURE_STORAGE_CONTAINER }} \
        --name registry.json --file registry.json --auth-mode login || echo '{"version":"1.0","tools":[]}' > registry.json
      node buildScripts/updateRegistry.js "${{ env.TOOL_ID }}" "${{ env.TOOL_VERSION }}" "${{ env.TOOL_METADATA_JSON }}"
      az storage blob upload \
        --account-name ${{ secrets.AZURE_STORAGE_ACCOUNT }} \
        --container-name ${{ secrets.AZURE_STORAGE_CONTAINER }} \
        --name registry.json --file registry.json \
        --auth-mode login --overwrite true

- name: Update Supabase downloadurl
  env:
      SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
      SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
  run: |
      FOLDER="${{ env.TOOL_ID }}-${{ env.TOOL_VERSION }}"
      node buildScripts/updateSupabase.js \
        "${{ env.TOOL_ID }}" \
        "https://${{ secrets.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/${{ secrets.AZURE_STORAGE_CONTAINER }}/${FOLDER}/${FOLDER}.tar.gz"
```

---

## Azure Blob Storage Setup

### 1. Create Storage Account and Container

```bash
# Create resource group (if needed)
az group create --name pptoolbox-rg --location eastus

# Create storage account
az storage account create \
  --name <storage-account> \
  --resource-group pptoolbox-rg \
  --location eastus \
  --sku Standard_LRS \
  --allow-blob-public-access true

# Create container with anonymous read access (blobs only)
az storage container create \
  --name tools \
  --account-name <storage-account> \
  --public-access blob \
  --auth-mode login
```

### 2. Upload Initial registry.json

```bash
az storage blob upload \
  --account-name <storage-account> \
  --container-name tools \
  --name registry.json \
  --file src/main/data/registry.json \
  --auth-mode login
```

### 3. Configure CORS (if needed for browser-based access)

```bash
az storage cors add \
  --methods GET HEAD \
  --origins "https://powerplatformtoolbox.com" \
  --services b \
  --account-name <storage-account>
```

---

## Transition / Rollout Plan

1. **Create the Azure Blob container** following the setup steps above.
2. **Upload existing tool packages** to their per-tool version folders in the blob container (e.g. `<tool-id>-<version>/<tool-id>-<version>.tar.gz`).
3. **Upload an initial `registry.json`** to the blob container root.
4. **Update Supabase** `downloadurl` column for all tools to point to Azure Blob.
5. **Set `AZURE_BLOB_BASE_URL`** in the app's build environment and redeploy.
6. **Update the `convert-tool` GitHub Action** in `pptb-web` to upload to Azure Blob instead of (or in addition to) GitHub Releases.
7. **Monitor** for any download failures via Sentry before retiring GitHub Release uploads.

> During the transition period, old GitHub Release URLs remain accessible, and newly installed tools will automatically use the Azure Blob URLs stored in Supabase.

---

## Bulk migration scripts (pptb-web → Azure Blob + Supabase URL update)

This repo includes two helper scripts to migrate historical assets and then update Supabase to point at the new Azure Blob URLs:

- PowerShell: [buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1](../buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1)
- SQL: [buildScripts/sql/update-tools-download-and-icon-urls.sql](../buildScripts/sql/update-tools-download-and-icon-urls.sql)

### 1) Copy all GitHub Release assets into Azure Blob

This copies matching release assets from `https://github.com/PowerPlatformToolBox/pptb-web/releases` into your `tools` container using the documented layout:

```
tools/
  registry.json
  packages/
    <tool-id>-<version>/
      <tool-id>-<version>.tar.gz
      <tool-id>-<version>.svg
```

> Note: some historical GitHub release icon assets are named like `<tool-id>-<version>-icon.svg`. The migration script normalizes these into Azure Blob as `packages/<tool-id>-<version>/<tool-id>-<version>.svg` (so the Supabase `iconurl` can be made consistent).

**Prereqs**

- Azure CLI installed and logged in: `az login`
- Access to the target storage account + container
- Optional but recommended: set `GITHUB_TOKEN` for higher GitHub API rate limits

**Run**

```pwsh
# Optional (recommended): increases GitHub API rate limit
$env:GITHUB_TOKEN = "<token>"

pwsh ./buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1 `
  -StorageAccount <storage-account> `
  -Container tools
```

**Dry run**

```pwsh
pwsh ./buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1 `
  -StorageAccount <storage-account> `
  -Container tools `
  -WhatIf
```

**Overwrite behavior**

- By default, existing blobs are left as-is.
- To force re-copying, pass `-Overwrite` (the script deletes the destination blob before copying).

**Registry.json regeneration**

- By default, the script does NOT modify `registry.json`.
- If you want the script to regenerate and upload `tools/registry.json` from Supabase after copying, pass `-RegenerateRegistryJson` (requires `SUPABASE_URL` + `SUPABASE_ANON_KEY`).

**Regenerate `registry.json` only (no copy)**

Use this if you want to retry registry generation/upload without re-copying any GitHub assets:

```pwsh
$env:SUPABASE_URL = "https://<your-project>.supabase.co"
$env:SUPABASE_ANON_KEY = "<your-supabase-anon-key>"

pwsh ./buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1 `
  -StorageAccount <storage-account> `
  -Container tools `
  -OnlyRegenerateRegistryJson
```

Dry run:

```pwsh
pwsh ./buildScripts/powershell/Move-PptbWebReleasesToAzureBlob.ps1 `
  -StorageAccount <storage-account> `
  -Container tools `
  -OnlyRegenerateRegistryJson `
  -WhatIf
```

### 2) Update Supabase `tools` table URLs (download + icon)

The desktop app reads tool metadata from Supabase (table `tools`) and expects these columns:

- `downloadurl` (full URL to `.tar.gz`)
- `iconurl` (full URL to `.svg`)

The included SQL script updates both columns by:

1. Extracting the filename from the existing URL (everything after the final `/`).
2. Deriving the folder from the filename (`<tool-id>-<version>`).
3. Rewriting the URL to:

```
https://<storage-account>.blob.core.windows.net/tools/packages/<tool-id>-<version>/<filename>
```

**Run**

1. Open the script: [buildScripts/sql/update-tools-download-and-icon-urls.sql](../buildScripts/sql/update-tools-download-and-icon-urls.sql)
2. Replace the placeholder `https://<storage-account>.blob.core.windows.net/tools` with your real base URL (no trailing slash).
3. Paste into the Supabase SQL editor and run.

**Notes**

- The SQL only targets rows that still point at GitHub (or `release-assets.githubusercontent.com`) and skips rows already pointing at `*.blob.core.windows.net`.
- The icon update is limited to `.svg` URLs.

### Troubleshooting

- If you see a transient message like "The specified blob does not exist" during the migration copy step, that can occur briefly right after starting a server-side copy. The PowerShell script retries and waits for the copy status to become available.
- If you see an error like "A redirected response (HTTP status code 302) from the copy source is not supported" / `CannotVerifyCopySource`, that is expected with GitHub Release download URLs (they often redirect to a signed, temporary URL). The PowerShell script attempts to resolve redirects and will fall back to downloading locally and uploading to Azure Blob if server-side copy cannot be used.
- If `az storage blob copy start` fails with a message like "The request may be blocked by network rules of storage account", your storage account is restricting access by network. Run the migration from an allowed network, or temporarily allow your public IP in the storage account firewall.

    Inspect current rules:

    ```bash
    az storage account show -n <storage-account> -g <resource-group> --query networkRuleSet -o jsonc
    ```

    Temporarily allow a public IP (example):

    ```bash
    az storage account network-rule add -n <storage-account> -g <resource-group> --ip-address <your-public-ip>
    ```
