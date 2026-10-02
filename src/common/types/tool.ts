/**
 * Tool-related type definitions
 */

import { CspExceptions } from "./common";

/**
 * A single entry from the capability tag registry.
 *
 * The registry is stored in the Supabase `capability_tags` table and fetched at
 * startup (with a TTL-based cache). A built-in fallback list is used when Supabase
 * is unavailable so the application always has a baseline set of known tags.
 */
export interface CapabilityTagEntry {
    /** The capability tag string (e.g. `"fetchxml"`, `"entity-picker"`). */
    tag: string;
    /** Human-readable description of what the capability represents. */
    description: string;
}

/**
 * Tool features configuration
 */
export interface ToolFeatures {
    /** Exact count or permitted range of connections used by this tool. */
    connections?: number | { min?: number; max?: number };
    /**
     * Multi-connection support configuration
     * - "required": Both primary and secondary connections are required
     * - "optional": Primary connection is required, secondary is optional
     * - "none": Single connection only (default behavior)
     * @deprecated Use `connections` instead.
     */
    multiConnection?: "required" | "optional" | "none";
    /**
     * Whether a connection is mandatory before the tool can be opened
     * - "required": A connection (per `multiConnection`) must be selected before launch (default behavior)
     * - "optional": The tool opens immediately with no connection; the user can attach one later via "Change Connection"
     * @deprecated Use `connections` instead.
     */
    connectionRequirement?: "required" | "optional";
    /**
     * Minimum ToolBox API version required by this tool
     * Tool developers should specify this in their package.json
     * @example "1.0.12"
     */
    minAPI?: string;
    /**
     * Whether this tool requires connections enabled for Power Platform API
     * When true, only connections with Client ID/Secret authentication and
     * enabledForPowerPlatformAPI=true will be shown in the connection selection modal.
     */
    enabledForPowerPlatformAPI?: boolean;
}

/**
 * Metadata shared by registry releases, installed manifests, and runtime tools.
 */
export interface ToolMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    authors?: string[];
    icon?: string; // Relative path to SVG icon in dist/ folder (e.g., "icon.svg" or "icons/icon.svg")
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
    categories?: string[];
    license?: string;
    size?: number;
    downloads?: number;
    rating?: number;
    ratingCount?: number; // Number of ratings submitted for this tool
    mau?: number; // Monthly Active Users (unique machines per month)
    readmeUrl?: string;
    features?: ToolFeatures; // Tool features configuration
    status?: "active" | "deprecated" | "archived"; // Tool lifecycle status
    repository?: string;
    website?: string;
    publishedAt?: string;
    createdAt?: string; // ISO date string from created_at field
    minAPI?: string; // Minimum ToolBox API version required
    mcpHeadlessEnabled?: boolean; // Whether this tool supports MCP headless execution
    /** Invocation capability tags declared in pptb.config.json (e.g. ["entity-picker"]). */
    capabilities?: string[];
    marketplaceSourceId?: string;
    marketplaceSourceLabel?: string;
    marketplaceSourceType?: "builtin" | "private";
    maturity?: string;
}

/** Represents a tool as returned to the application runtime. */
export interface Tool extends ToolMetadata {
    settings?: ToolSettings;
    localPath?: string; // For local development tools - absolute path to tool directory
    npmPackageName?: string; // For npm-installed tools - package name in node_modules
    isSupported?: boolean; // Whether this tool is compatible with current ToolBox version
}

/**
 * Tool registry entry - metadata from the registry
 */
export interface ToolRegistryEntry extends ToolMetadata {
    downloadUrl: string;
    checksum?: string;
    npmPackageName?: string; // npm package name used for pre-release version detection
    isSupported?: boolean; // App-computed compatibility status for marketplace display
}

/**
 * Tool manifest - stored locally after installation
 */
export interface ToolManifest extends ToolMetadata {
    packageName?: string; // Canonical package.json name used for inter-tool invocation lookup
    installPath: string;
    installedAt: string;
    source: "registry" | "npm" | "local"; // Track installation source
    sourceUrl?: string;
}

/**
 * Tool-specific settings
 */
export interface ToolSettings {
    [key: string]: unknown;
}

/**
 * A user's own rating for a tool, cached locally so the rating modal can pre-fill it.
 */
export interface MyToolRating {
    rating: number;
    comment?: string;
}

/**
 * Aggregate rating result returned after submitting a rating (recomputed server-side).
 */
export interface ToolRatingAggregate {
    rating?: number;
    ratingCount?: number;
}

/**
 * Tool context provided to tools running in webviews
 * NOTE: accessToken is NOT included for security - tools must use secure backend APIs
 */
export interface ToolContext {
    toolId: string;
    instanceId?: string | null;
    connectionUrl: string | null;
    connectionId?: string | null;
    secondaryConnectionUrl?: string | null;
    secondaryConnectionId?: string | null;
}

/**
 * Type guard to check if an object is a valid Tool
 */
export function isTool(obj: unknown): obj is Tool {
    if (!obj || typeof obj !== "object") return false;
    const tool = obj as Record<string, unknown>;
    return typeof tool.id === "string" && typeof tool.name === "string" && typeof tool.version === "string" && typeof tool.description === "string";
}

/**
 * Type guard to check if an object is a valid ToolManifest
 */
export function isToolManifest(obj: unknown): obj is ToolManifest {
    if (!obj || typeof obj !== "object") return false;
    const manifest = obj as Record<string, unknown>;
    return (
        typeof manifest.id === "string" &&
        typeof manifest.name === "string" &&
        typeof manifest.version === "string" &&
        typeof manifest.installPath === "string" &&
        typeof manifest.installedAt === "string" &&
        (manifest.source === "registry" || manifest.source === "npm" || manifest.source === "local")
    );
}
