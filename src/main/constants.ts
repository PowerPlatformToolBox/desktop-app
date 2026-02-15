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
 * ToolBox API version
 * This should match the version in package.json and @pptb/types package
 * Used for tool compatibility checking
 * Injected at build time via vite.config.ts from package.json
 */
export const TOOLBOX_VERSION = process.env.TOOLBOX_VERSION || "0.0.0";

/**
 * Minimum API version supported by this ToolBox version
 * Tools requiring older API versions than this will not be supported
 * This represents backwards compatibility - how far back we support
 */
export const MIN_SUPPORTED_API_VERSION = "1.0.0";
