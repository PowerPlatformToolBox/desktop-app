/**
 * Tool-related type definitions
 */

import { CspExceptions } from "./common";

/**
 * Represents a tool that can be loaded into the ToolBox
 */
export interface Tool {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    icon?: string;
    settings?: ToolSettings;
    localPath?: string; // For local development tools - absolute path to tool directory
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
}

/**
 * Tool registry entry - metadata from the registry
 */
export interface ToolRegistryEntry {
    id: string;
    name: string;
    description: string;
    author: string;
    version: string;
    icon?: string;
    downloadUrl: string;
    checksum?: string;
    size?: number;
    publishedAt: string;
    tags?: string[];
    readme?: string; // URL or relative path to README file
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
}

/**
 * Tool manifest - stored locally after installation
 */
export interface ToolManifest {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    icon?: string;
    installPath: string;
    installedAt: string;
    source: "registry" | "npm" | "local"; // Track installation source
    sourceUrl?: string;
    readme?: string; // URL or relative path to README file
    cspExceptions?: CspExceptions; // CSP exceptions requested by the tool
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
    connectionUrl: string | null;
}

/**
 * Type guard to check if an object is a valid Tool
 */
export function isTool(obj: unknown): obj is Tool {
    if (!obj || typeof obj !== "object") return false;
    const tool = obj as Record<string, unknown>;
    return typeof tool.id === "string" && typeof tool.name === "string" && typeof tool.version === "string" && typeof tool.description === "string" && typeof tool.author === "string";
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
