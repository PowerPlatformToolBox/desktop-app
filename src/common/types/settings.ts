/**
 * Settings-related type definitions
 */

import { DataverseConnection } from "./connection";
import { Theme } from "./common";

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
 * User settings for the ToolBox application
 */
export interface UserSettings {
    theme: Theme;
    language: string;
    autoUpdate: boolean;
    terminalFont: string;
    showDebugMenu: boolean;
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
