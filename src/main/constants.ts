/**
 * Constants used throughout the application
 */

/**
 * Dataverse Web API version
 * Update this constant when the API version changes
 */
export const DATAVERSE_API_VERSION = "v9.2";

/**
 * Tool Registry Configuration
 * @deprecated Use Supabase instead
 */
export const TOOL_REGISTRY_URL = "https://www.powerplatformtoolbox.com/registry/registry.json";

/**
 * Supabase Configuration
 * These values are injected at build time from environment variables.
 * They are NOT stored in the source code for security reasons.
 * Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables before building.
 */
export const SUPABASE_URL = process.env.SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

/**
 * Azure Blob Storage Configuration
 * Base URL for the Azure Blob container that hosts tool packages and the remote registry.
 * The container should be publicly readable (anonymous read access for blobs).
 * Set AZURE_BLOB_BASE_URL to the full container URL, e.g.:
 *   https://<account>.blob.core.windows.net/tools
 *
 * Expected layout inside the container:
 *   registry.json                                                     – remote registry index (fallback after Supabase)
 *   packages/<tool-id>-<version>/<tool-id>-<version>.tar.gz          – pre-packaged tool archive
 *   packages/<tool-id>-<version>/icon-light.png                      – light theme icon for the tool/version
 *   packages/<tool-id>-<version>/icon-dark.png                       – dark theme icon for the tool/version
 */
export const AZURE_BLOB_BASE_URL = process.env.AZURE_BLOB_BASE_URL || "";
