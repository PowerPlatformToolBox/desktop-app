# Migrating pptb-web GitHub Releases to Azure Blob Storage

This document describes how to migrate all tool release assets hosted on [PowerPlatformToolBox/pptb-web](https://github.com/PowerPlatformToolBox/pptb-web) GitHub Releases to an Azure Blob Storage container, and then update the Supabase `tools` table so the desktop app resolves the new URLs.

---

## Overview

Tool packages (`.tar.gz`) and icons are currently served directly from GitHub Releases:

```
https://github.com/PowerPlatformToolBox/pptb-web/releases/download/<tag>/<file>
```

After the migration they will be served from Azure Blob Storage:

```
https://<storage-account>.blob.core.windows.net/<container>/<tag>/<file>
```

The migration consists of two steps:

1. **Copy assets** — a PowerShell script that enumerates every GitHub Release asset in `pptb-web` and uploads it to the target Blob container, preserving a `<tag>/<filename>` path structure.
2. **Update database** — a SQL script that rewrites the `downloadurl` and `iconurl` columns in the Supabase `tools` table from the old GitHub URLs to the new Azure Blob Storage URLs.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| PowerShell 7+ | Cross-platform; install from <https://learn.microsoft.com/powershell/scripting/install/installing-powershell> |
| Azure CLI (`az`) | Used to authenticate and upload blobs. Install from <https://learn.microsoft.com/cli/azure/install-azure-cli> |
| GitHub CLI (`gh`) or a GitHub PAT | Used to list and download release assets |
| An Azure Storage Account | Create one in the Azure Portal or with `az storage account create` |
| Supabase project with SQL access | Access via the Supabase Dashboard **SQL Editor** or any PostgreSQL client |

---

## Step 1 — Copy GitHub Release Assets to Azure Blob Storage

Save the script below as `migrate-releases.ps1` and run it after setting the four variables at the top.

```powershell
<#
.SYNOPSIS
    Copies every asset from every PowerPlatformToolBox/pptb-web GitHub Release to
    an Azure Blob Storage container, preserving the <tag>/<filename> path structure.

.PARAMETER GitHubToken
    A GitHub Personal Access Token (PAT) with `public_repo` scope (or a fine-grained
    token with Contents: Read permission on pptb-web).

.PARAMETER StorageAccount
    Azure Storage account name (e.g. "pptbstorage").

.PARAMETER ContainerName
    Blob container name (e.g. "tools").  The container must already exist or the
    script will create it with public (blob-level) read access.

.EXAMPLE
    .\migrate-releases.ps1 `
        -GitHubToken  "ghp_xxxx" `
        -StorageAccount "pptbstorage" `
        -ContainerName  "tools"
#>

param(
    [Parameter(Mandatory)][string] $GitHubToken,
    [Parameter(Mandatory)][string] $StorageAccount,
    [Parameter(Mandatory)][string] $ContainerName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$GH_OWNER = "PowerPlatformToolBox"
$GH_REPO  = "pptb-web"
$GH_API   = "https://api.github.com"

# ── Authenticate to Azure ────────────────────────────────────────────────────
Write-Host "Logging in to Azure..."
az login --output none

# Create container if it does not already exist, with public blob access so the
# desktop app can download tools without a SAS token.
$exists = az storage container exists `
    --account-name $StorageAccount `
    --name $ContainerName `
    --auth-mode login `
    --query "exists" --output tsv

if ($exists -ne "true") {
    Write-Host "Creating container '$ContainerName'..."
    az storage container create `
        --account-name $StorageAccount `
        --name $ContainerName `
        --auth-mode login `
        --public-access blob `
        --output none
}

# ── Enumerate GitHub Releases ────────────────────────────────────────────────
$headers = @{
    Authorization = "Bearer $GitHubToken"
    Accept        = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$page    = 1
$allReleases = @()

do {
    $url      = "$GH_API/repos/$GH_OWNER/$GH_REPO/releases?per_page=100&page=$page"
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    $allReleases += $response
    $page++
} while ($response.Count -eq 100)

Write-Host "Found $($allReleases.Count) release(s) in $GH_OWNER/$GH_REPO."

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "pptb-migration"
New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null

$urlMap = [System.Collections.Generic.List[psobject]]::new()

foreach ($release in $allReleases) {
    $tag = $release.tag_name
    Write-Host "`nProcessing release: $tag"

    foreach ($asset in $release.assets) {
        $assetName    = $asset.name
        $downloadUrl  = $asset.browser_download_url
        $blobPath     = "$tag/$assetName"
        $localFile    = Join-Path $tmpDir $assetName

        Write-Host "  Downloading $assetName..."
        try {
            Invoke-WebRequest -Uri $downloadUrl `
                -Headers @{ Authorization = "Bearer $GitHubToken" } `
                -OutFile $localFile
        } catch {
            throw "Failed to download asset '$assetName' from $downloadUrl : $_"
        }

        Write-Host "  Uploading to blob: $blobPath"
        try {
            az storage blob upload `
                --account-name $StorageAccount `
                --container-name $ContainerName `
                --name $blobPath `
                --file $localFile `
                --auth-mode login `
                --overwrite true `
                --output none
            if ($LASTEXITCODE -ne 0) {
                throw "az storage blob upload exited with code $LASTEXITCODE"
            }
        } catch {
            throw "Failed to upload blob '$blobPath' for asset '$assetName': $_"
        }

        $oldUrl = $downloadUrl
        $newUrl = "https://$StorageAccount.blob.core.windows.net/$ContainerName/$blobPath"

        $urlMap.Add([pscustomobject]@{
            Tag      = $tag
            Asset    = $assetName
            OldUrl   = $oldUrl
            NewUrl   = $newUrl
        })

        Remove-Item $localFile -Force
    }
}

# ── Write URL mapping report ─────────────────────────────────────────────────
$reportPath = Join-Path $PSScriptRoot "url-mapping.csv"
$urlMap | Export-Csv -Path $reportPath -NoTypeInformation -Encoding UTF8
Write-Host "`nMigration complete. URL mapping saved to: $reportPath"
```

### What the script does

1. Authenticates to Azure with `az login` (interactive browser login; swap for `az login --service-principal` in CI).
2. Creates the target Blob container with public read access if it does not already exist.
3. Pages through all releases in `pptb-web` using the GitHub REST API.
4. Downloads each release asset to a temporary directory, uploads it to `<container>/<tag>/<filename>`, then deletes the local copy.
5. Saves a `url-mapping.csv` file in the same directory as the script with old and new URLs — feed this into the SQL step below.

### Running in CI (GitHub Actions example)

```yaml
- name: Migrate releases to Azure Blob
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
  run: |
    az login --service-principal \
      --username "$AZURE_CLIENT_ID" \
      --password "$AZURE_CLIENT_SECRET" \
      --tenant "$AZURE_TENANT_ID"
    pwsh migrate-releases.ps1 \
      -GitHubToken  "$GH_TOKEN" \
      -StorageAccount "pptbstorage" \
      -ContainerName  "tools"
```

---

## Step 2 — Update the Supabase `tools` Table

Run the following SQL in the Supabase **SQL Editor** (or any PostgreSQL client connected to your project).

> **Before running**, replace `<storage-account>` and `<container>` with the real values used in Step 1.

### 2a — Update `downloadurl`

The existing GitHub Releases download URLs follow the pattern:

```
https://github.com/PowerPlatformToolBox/pptb-web/releases/download/<tag>/<file>
```

The new Azure Blob URLs follow:

```
https://<storage-account>.blob.core.windows.net/<container>/<tag>/<file>
```

Because the `<tag>/<file>` path suffix is identical in both schemes, a single `REPLACE` is sufficient:

```sql
-- Preview affected rows before committing
SELECT
    id,
    name,
    downloadurl                          AS old_download_url,
    REPLACE(
        downloadurl,
        'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/',
        'https://<storage-account>.blob.core.windows.net/<container>/'
    )                                    AS new_download_url
FROM tools
WHERE downloadurl LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%';

-- Apply the update
UPDATE tools
SET downloadurl = REPLACE(
    downloadurl,
    'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/',
    'https://<storage-account>.blob.core.windows.net/<container>/'
)
WHERE downloadurl LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%';
```

### 2b — Update `iconurl`

Tool icons are typically uploaded as a separate asset (e.g. `icon.png`) alongside the `.tar.gz` in the same release tag. If your `iconurl` values point to GitHub release assets in `pptb-web`, apply the same replacement:

```sql
-- Preview
SELECT
    id,
    name,
    iconurl                              AS old_icon_url,
    REPLACE(
        iconurl,
        'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/',
        'https://<storage-account>.blob.core.windows.net/<container>/'
    )                                    AS new_icon_url
FROM tools
WHERE iconurl LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%';

-- Apply the update
UPDATE tools
SET iconurl = REPLACE(
    iconurl,
    'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/',
    'https://<storage-account>.blob.core.windows.net/<container>/'
)
WHERE iconurl LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%';
```

### 2c — Update `local registry.json` (optional)

The bundled fallback registry at `src/main/data/registry.json` also contains GitHub Release `downloadUrl` values. Update them with the same substitution before rebuilding:

```bash
# macOS / Linux
sed -i '' \
  's|https://github.com/PowerPlatformToolBox/pptb-web/releases/download/|https://<storage-account>.blob.core.windows.net/<container>/|g' \
  src/main/data/registry.json

# Windows PowerShell
(Get-Content src/main/data/registry.json) `
    -replace 'https://github\.com/PowerPlatformToolBox/pptb-web/releases/download/', `
             'https://<storage-account>.blob.core.windows.net/<container>/' |
  Set-Content src/main/data/registry.json
```

### 2d — Verify

```sql
-- Confirm no rows still point at GitHub
SELECT COUNT(*) AS remaining_github_urls
FROM tools
WHERE downloadurl LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%'
   OR iconurl     LIKE '%github.com/PowerPlatformToolBox/pptb-web/releases/download/%';
-- Expected: 0
```

---

## Rollback

If the migration needs to be reversed:

```sql
-- Restore downloadurl
UPDATE tools
SET downloadurl = REPLACE(
    downloadurl,
    'https://<storage-account>.blob.core.windows.net/<container>/',
    'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/'
)
WHERE downloadurl LIKE '%<storage-account>.blob.core.windows.net/<container>/%';

-- Restore iconurl
UPDATE tools
SET iconurl = REPLACE(
    iconurl,
    'https://<storage-account>.blob.core.windows.net/<container>/',
    'https://github.com/PowerPlatformToolBox/pptb-web/releases/download/'
)
WHERE iconurl LIKE '%<storage-account>.blob.core.windows.net/<container>/%';
```

---

## Operational notes

- **Immutability** — Blob Storage does not change URLs over time the way GitHub releases can if a repository is renamed or made private. Hosting on Azure Blob is therefore more stable for a production registry.
- **CORS** — Enable CORS on the storage container if tools need to load assets from the browser context (Settings → Resource sharing (CORS) in the Azure portal).
- **CDN** — For lower latency worldwide, front the container with Azure CDN or Azure Front Door. The CDN endpoint URL would then replace the `.blob.core.windows.net` hostname in the SQL updates.
- **SAS tokens** — The script creates the container with `--public-access blob` so assets are publicly readable without credentials. If you require private access, remove that flag and generate SAS tokens or use a CDN with token auth instead.
