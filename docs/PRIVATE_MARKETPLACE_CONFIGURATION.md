# Private Marketplace Configuration

This guide explains how to configure a private marketplace for the desktop app and the prerequisites needed for it to work correctly.

> Note: This document describes the current v1 implementation. In v1, the app supports configuring additional marketplace sources, but authenticated private marketplace flows are not yet supported end-to-end. Support for authenticated private marketplace configuration is planned for v2.

## Overview

The desktop app can load tools from multiple marketplace sources:

- The built-in marketplace (public/default source)
- One or more private marketplace sources

Private marketplace sources are configured through the app settings and are merged with the built-in marketplace. If the same tool ID appears in multiple sources, private sources take precedence over the built-in marketplace.

## Prerequisites

Before enabling a private marketplace, make sure the following are available:

1. A reachable HTTPS endpoint that serves a marketplace registry JSON file.
2. The registry endpoint must return a JSON payload with a top-level `tools` array.
3. The registry should contain tool entries in the same shape expected by the app.
4. The endpoint should be publicly accessible to the desktop app if the app is running outside your internal network.
5. If you plan to host packages from a private storage location, ensure the download URLs are accessible to the app.

## Registry Format

The private registry should look like this:

```json
{
    "tools": [
        {
            "id": "my-private-tool",
            "name": "My Private Tool",
            "description": "Example private tool",
            "authors": ["Contoso Tools Team"],
            "version": "1.0.0",
            "downloadUrl": "https://example.com/packages/my-private-tool.tar.gz",
            "status": "active"
        }
    ]
}
```

Important: the marketplace UI text shown as "by ..." is populated from `authors` in each tool entry.

Each tool entry should include at least:

- `id`
- `name`
- `version`
- `downloadUrl` (when package download is required)
- `status` (recommended: `active`)

## Configuration Steps

1. Open the desktop app settings.
2. Go to the marketplace settings section.
3. Add a new marketplace source and choose the appropriate type:
    - `builtin` for the built-in marketplace
    - `private` for your internal/private registry
4. Provide a label for the source.
5. Enter the full HTTPS URL to the registry JSON file.
6. Enable the source.

## Built-in Marketplace Behavior

The built-in marketplace is enabled by default. It can be disabled only when at least one private marketplace source is enabled.

This prevents the app from being left with no marketplace source configured.

## Recommended Hosting Strategy

For a secure private marketplace deployment, the recommended approach is:

- Host the registry JSON over HTTPS.
- Serve tool packages from a dedicated storage location that is readable by the app.
- Use read-only access for registry and package endpoints.
- Prefer a private network or authenticated storage solution when the marketplace is intended only for a specific organization.

## Example: Azure Blob Storage with SAS-Based Access (v1)

For the current v1 implementation, a practical pattern is to host the registry and package files in Azure Blob Storage and let each end user supply their own read-only SAS token when configuring the marketplace URL in the app. The admin can generate and keep the SAS token private, while each user pastes their own token into the marketplace source URL. This is supported in v1.

Authenticated private marketplace flows that require the desktop app to sign in with Entra ID are planned for v2.

### Example architecture

- Create an Azure Storage account.
- Create a container such as `tools`.
- Upload:
    - `registry.json`
    - package files such as `my-private-tool-1.0.0.tar.gz`
- Protect the blob container with a read-only shared access signature (SAS) for v1 usage.
- Expose the registry through a secure HTTPS endpoint, such as:
    - Azure Blob URL with a SAS token
    - Azure Front Door, API Management, or a small proxy app for additional control

### Example registry.json

The admin can generate a SAS token for the registry blob (or for the container containing it), keep it safe, and use that SAS token to configure the marketplace source URL in the app settings.

Use the registry URL below as the marketplace source URL in the app settings:

```text
https://<storage-account>.blob.core.windows.net/pptb-tools/registry.json?<sas-token>
```

In the registry file, each tool should point to a package URL that also includes the SAS token so the app can download the package content:

```json
{
    "tools": [
        {
            "id": "my-private-tool",
            "name": "My Private Tool",
            "description": "Example tool hosted in Azure Blob",
            "authors": ["Contoso Tools Team"],
            "version": "1.0.0",
            "downloadUrl": "https://<storage-account>.blob.core.windows.net/pptb-tools/packages/my-private-tool-1.0.0.tar.gz?<sas-token>",
            "status": "active"
        }
    ]
}
```

### Exact configuration recipe for v1

1. Create or use an Azure Storage account and a container named `pptb-tools`.
2. Upload `registry.json` into that container.
3. Upload each tool package into the same container or into a subfolder under it.
4. Generate a read-only SAS token for the container or for the specific blobs.
5. Put the registry URL with the SAS token into the desktop app as the private marketplace source URL.
6. In the `registry.json` file, ensure every `downloadUrl` also includes the SAS token so the app can download the tool packages.
7. If the package files are stored in a subfolder, include that path in the `downloadUrl`.

### Example: generate a SAS token per individual blob and append it to the marketplace URL

Each user appends their own SAS token to the marketplace URL they configure in the app.

Example for generating a read-only SAS token for accessing the marketplace registry blob:

```bash
az storage blob generate-sas \
  --account-name <storage-account-name> \
  --container-name <container-name> \
  --name registry.json \
  --permissions r \
  --expiry 2030-01-01T00:00:00Z \
  --https-only \
  --auth-mode login
```

The command returns a query string similar to:

```text
se=2030-01-01T00%3A00%3A00Z&sp=r&sv=2024-11-04&sr=b&sig=abc123...
```

Append that query string to the full blob URL and use it as the marketplace source URL in the app settings:

```text
https://<storage-account>.blob.core.windows.net/<container-name>/registry.json?se=2030-01-01T00%3A00%3A00Z&sp=r&sv=2024-11-04&sr=b&sig=abc123...
```

This pattern is useful when you want short-lived, per-scope access to a private marketplace while keeping the SAS values private and letting each user configure their own marketplace URL.

### Packaging tools as .tar.gz for the marketplace

The marketplace expects tool packages to be distributed as `.tar.gz` archives. A typical approach is to package the tool folder contents so the archive can be downloaded and extracted by the app.

If you are working from a local tool folder such as:

```text
<your-tool-directory>
```

you can create a package like this. Run the command from the directory that contains the tool's package.json:

```bash
cd <your-tool-directory>

tar -czf my-private-tool-1.0.0.tar.gz .
```

This produces a tarball named `my-private-tool-1.0.0.tar.gz` that contains the tool contents.

If you want the archive to contain the tool in a subfolder rather than the current directory contents, you can first create a staging folder:

```bash
mkdir -p /tmp/pptb-package
cp -R <your-tool-directory> /tmp/pptb-package/my-private-tool
cd /tmp/pptb-package
tar -czf my-private-tool-1.0.0.tar.gz my-private-tool
```

Upload the resulting `.tar.gz` file to your Azure Blob container and use its URL as the package download location.

### Azure deployment example

1. Create a storage account:

```bash
az storage account create \
  --name <storage-account-name> \
  --resource-group <resource-group> \
  --location <region> \
  --sku Standard_LRS \
  --kind StorageV2
```

2. Create a container:

```bash
az storage container create \
  --account-name <storage-account-name> \
  --name tools \
  --auth-mode login
```

3. Upload the registry and package files:

```bash
az storage blob upload \
  --account-name <storage-account-name> \
  --container-name tools \
  --name registry.json \
  --file ./registry.json \
  --auth-mode login

az storage blob upload \
  --account-name <storage-account-name> \
  --container-name tools \
  --name packages/my-private-tool-1.0.0.tar.gz \
  --file ./my-private-tool-1.0.0.tar.gz \
  --auth-mode login
```

4. Generate a read-only SAS token for a limited duration if you need time-bound access:

```bash
az storage blob generate-sas \
  --account-name <storage-account-name> \
  --container-name tools \
  --name registry.json \
  --permissions r \
  --expiry 2030-01-01T00:00:00Z \
  --https-only \
  --auth-mode login
```

5. Use the resulting URL as the marketplace source URL in the app settings.

### Security notes

- For v1, SAS is the supported approach for private marketplace access.
- Keep SAS tokens read-only and short-lived.
- Avoid exposing secrets in the registry JSON.
- If the registry is meant for a limited audience, place it behind Azure Front Door, API Management, or a small authenticated proxy.
- Entra ID-based authenticated flows are planned for v2 and are not part of the v1 implementation.

## Notes

- The app merges marketplace sources in order and gives private sources precedence over the built-in marketplace for duplicate tool IDs.
- If a source URL is invalid or unreachable, the app logs a warning and continues with the other enabled sources.
- The built-in marketplace URL is derived from the configured Azure Blob environment value when available.

## Troubleshooting

If the private marketplace does not appear as expected:

- Verify the registry URL is reachable from the machine running the app.
- Confirm the endpoint returns HTTP 200 and valid JSON.
- Check that the JSON uses the expected `tools` array format.
- Ensure the source is enabled in settings.
- Confirm the tool IDs are unique or that private sources are intended to override the built-in marketplace entries.
- If the tool shows a blank "by" label, confirm the tool entry includes `authors` (array or comma-separated string).
