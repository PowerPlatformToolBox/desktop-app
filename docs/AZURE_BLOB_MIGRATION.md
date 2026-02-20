# Azure Blob Storage Migration Strategy

This document describes the strategy for moving tool distribution from GitHub Releases to Azure Blob Storage and outlines the updated intake process.

## Overview

Tool packages (`.tar.gz` archives) were previously hosted as GitHub Release assets on the `pptb-web` repository. They are being migrated to **Azure Blob Storage** to allow easier automation, lower latency, and decoupled storage from GitHub.

The ToolBox application already fetches tool metadata from **Supabase**. Azure Blob Storage becomes the authoritative location for the binary artifacts (the `.tar.gz` packages) **and** for a remote fallback registry index when Supabase is unreachable.

---

## Azure Blob Container Layout

All tool assets live in a single public Azure Blob container (anonymous read access on blobs):

```
<account>.blob.core.windows.net/tools/
├── registry.json                            # Remote registry index (fallback after Supabase)
└── packages/
    ├── <tool-id>-<version>.tar.gz           # Tool package archives
    └── ...
```

**Example:**

```
https://<storage-account>.blob.core.windows.net/tools/registry.json
https://<storage-account>.blob.core.windows.net/tools/packages/pptb-standard-sample-tool-1.0.9.tar.gz
```

---

## Configuration

Set the following environment variable before building the app (add it to your `.env` file or CI/CD pipeline secrets):

| Variable | Description | Example |
|---|---|---|
| `AZURE_BLOB_BASE_URL` | Full URL to the root of the tools blob container | `https://<storage-account>.blob.core.windows.net/tools` |
| `SUPABASE_URL` | Supabase project URL (unchanged) | `https://xyz.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (unchanged) | `eyJ...` |

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
            "downloadUrl": "https://<account>.blob.core.windows.net/tools/packages/my-tool-id-1.0.0.tar.gz",
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
  → Package uploaded to Azure Blob container:
      az storage blob upload \
        --account-name <storage-account> \
        --container-name tools \
        --name "packages/<tool-id>-<version>.tar.gz" \
        --file "<tool-id>-<version>.tar.gz" \
        --auth-mode login
  → Supabase row updated with downloadurl pointing to the Azure Blob URL:
      https://<storage-account>.blob.core.windows.net/tools/packages/<tool-id>-<version>.tar.gz
  → (Optional) registry.json in the blob container is regenerated to include the new entry
```

### Changes to the `convert-tool` GitHub Action

Replace the GitHub Release upload step with an Azure Blob upload step. The CI/CD pipeline will need the following secrets configured:

| Secret | Description |
|---|---|
| `AZURE_STORAGE_ACCOUNT` | Storage account name (e.g. `<storage-account>`) |
| `AZURE_STORAGE_CONTAINER` | Container name (e.g. `tools`) |
| `AZURE_CREDENTIALS` | Azure service principal credentials JSON (used with `azure/login` action) |

**Example workflow snippet (replace the current GitHub Release upload step):**

```yaml
- name: Upload tool package to Azure Blob
  uses: azure/login@v2
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Upload package
  run: |
    az storage blob upload \
      --account-name ${{ secrets.AZURE_STORAGE_ACCOUNT }} \
      --container-name ${{ secrets.AZURE_STORAGE_CONTAINER }} \
      --name "packages/${{ env.TOOL_ID }}-${{ env.TOOL_VERSION }}.tar.gz" \
      --file "${{ env.TOOL_ID }}-${{ env.TOOL_VERSION }}.tar.gz" \
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
    node buildScripts/updateSupabase.js \
      "${{ env.TOOL_ID }}" \
      "https://${{ secrets.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/${{ secrets.AZURE_STORAGE_CONTAINER }}/packages/${{ env.TOOL_ID }}-${{ env.TOOL_VERSION }}.tar.gz"
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
2. **Upload existing tool packages** to `packages/` in the blob container.
3. **Upload an initial `registry.json`** to the blob container root.
4. **Update Supabase** `downloadurl` column for all tools to point to Azure Blob.
5. **Set `AZURE_BLOB_BASE_URL`** in the app's build environment and redeploy.
6. **Update the `convert-tool` GitHub Action** in `pptb-web` to upload to Azure Blob instead of (or in addition to) GitHub Releases.
7. **Monitor** for any download failures via Sentry before retiring GitHub Release uploads.

> During the transition period, old GitHub Release URLs remain accessible, and newly installed tools will automatically use the Azure Blob URLs stored in Supabase.
