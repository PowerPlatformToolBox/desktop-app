/**
 * Settings-related type definitions
 */

import { Theme } from "./common";
import { DataverseConnection } from "./connection";

/**
 * Sort options for installed tools
 */
export type InstalledToolsSortOption = "name-asc" | "name-desc" | "popularity" | "rating" | "downloads" | "favorite";

/**
 * Sort options for connections
 */
export type ConnectionsSortOption = "name-asc" | "name-desc" | "environment";

/**
 * Sort options for marketplace
 */
export type MarketplaceSortOption = "name-asc" | "name-desc" | "popularity" | "rating" | "downloads";

/**
 * Deprecated tools visibility options
 */
export type DeprecatedToolsVisibility = "hide-all" | "show-all" | "show-installed" | "show-marketplace";

/**
 * Tool display mode options
 */
export type ToolDisplayMode = "standard" | "compact";

/**
 * User settings for the ToolBox application
 */
export interface UserSettings {
    theme: Theme;
    language: string;
    autoUpdate: boolean;
    terminalFont: string;
    showDebugMenu: boolean;
    deprecatedToolsVisibility?: DeprecatedToolsVisibility;
    toolDisplayMode?: ToolDisplayMode;
    lastUsedTools: string[];
    connections: DataverseConnection[];
    installedTools: string[]; // List of installed tool package names
    favoriteTools: string[]; // List of favorite tool IDs
    cspConsents: { [toolId: string]: boolean }; // Track CSP consent for each tool
    toolConnections: { [toolId: string]: string }; // Map of toolId to connectionId
    toolSecondaryConnections: { [toolId: string]: string }; // Map of toolId to secondary connectionId for multi-connection tools
    machineId?: string; // Unique machine identifier for analytics
    // Sort preferences
    installedToolsSort?: InstalledToolsSortOption;
    connectionsSort?: ConnectionsSortOption;
    marketplaceSort?: MarketplaceSortOption;
}
