/**
 * Tool-related type definitions
 */

import { CspExceptions } from "./common";

/**
 * Tool features configuration
 */
export interface ToolFeatures {
    /**
     * Multi-connection support configuration
     * - "required": Both primary and secondary connections are required
     * - "optional": Primary connection is required, secondary is optional
     * - "none": Single connection only (default behavior)
     */
    multiConnection?: "required" | "optional" | "none";
    /**
     * Minimum ToolBox API version required by this tool
     * Tool developers should specify this in their package.json
     * @example "1.0.12"
     */
    minAPI?: string;
}

/**
 * Represents a tool that can be loaded into the ToolBox
 */
export interface Tool {
    id: string;
    name: string;
    version: string;
    description: string;
    publishedAt?: string;
    createdAt?: string; // ISO date string from created_at field
    authors?: string[];
    icon?: string; // Relative path to SVG icon in dist/ folder (e.g., "icon.svg" or "icons/icon.svg")
    settings?: ToolSettings;
    localPath?: string; // For local development tools - absolute path to tool directory
    npmPackageName?: string; // For npm-installed tools - package name in node_modules
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
    categories?: string[];
    license?: string;
    downloads?: number;
    rating?: number;
    mau?: number; // Monthly Active Users (unique machines per month)
    readmeUrl?: string;
    features?: ToolFeatures; // Tool features configuration
    status?: "active" | "deprecated" | "archived"; // Tool lifecycle status
    repository?: string;
    website?: string;
    minAPI?: string; // Minimum ToolBox API version required
    maxAPI?: string; // Maximum ToolBox API version tested
    isSupported?: boolean; // Whether this tool is compatible with current ToolBox version
}

/**
 * Tool registry entry - metadata from the registry
 */
export interface ToolRegistryEntry {
    id: string;
    name: string;
    description: string;
    authors?: string[]; // full list of contributors
    version: string;
    icon?: string; // Relative path to SVG icon in dist/ folder (e.g., "icon.svg" or "icons/icon.svg")
    downloadUrl: string;
    readmeUrl?: string; // URL or relative path to README file
    checksum?: string;
    size?: number;
    publishedAt: string;
    createdAt?: string; // Supabase created_at timestamp
    categories?: string[];
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
    license?: string; // SPDX or license name
    downloads?: number; // analytics - total downloads
    rating?: number; // analytics - average rating
    mau?: number; // analytics - Monthly Active Users (unique machines per month)
    features?: ToolFeatures; // Tool features configuration
    status?: "active" | "deprecated" | "archived"; // Tool lifecycle status
    repository?: string;
    website?: string;
    minAPI?: string; // Minimum ToolBox API version required (from features.minAPI)
    maxAPI?: string; // Maximum ToolBox API version tested (from npm-shrinkwrap @pptb/types version)
}

/**
 * Tool manifest - stored locally after installation
 */
export interface ToolManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    authors?: string[]; // contributors list
    icon?: string; // Relative path to SVG icon in dist/ folder (e.g., "icon.svg" or "icons/icon.svg")
    installPath: string;
    installedAt: string;
    source: "registry" | "npm" | "local"; // Track installation source
    sourceUrl?: string;
    readme?: string; // URL or relative path to README file
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
    categories?: string[];
    license?: string;
    downloads?: number;
    rating?: number;
    mau?: number; // Monthly Active Users (unique machines per month)
    features?: ToolFeatures; // Tool features configuration
    status?: "active" | "deprecated" | "archived"; // Tool lifecycle status
    repository?: string;
    website?: string;
    publishedAt?: string;
    createdAt?: string;
    minAPI?: string; // Minimum ToolBox API version required (from features.minAPI)
    maxAPI?: string; // Maximum ToolBox API version tested (from npm-shrinkwrap @pptb/types version)
}

/**
 * Tool-specific settings
 */
export interface ToolSettings {
    [key: string]: unknown;
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
