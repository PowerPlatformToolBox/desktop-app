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
export type ConnectionsSortOption = "last-used" | "name-asc" | "name-desc" | "environment";

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

export interface LastUsedToolConnectionInfo {
    id: string | null;
    name?: string;
    environment?: DataverseConnection["environment"];
    url?: string;
}

export interface LastUsedToolEntry {
    toolId: string;
    lastUsedAt: string;
    primaryConnection?: LastUsedToolConnectionInfo | null;
    secondaryConnection?: LastUsedToolConnectionInfo | null;
}

export interface LastUsedToolUpdate {
    toolId: string;
    primaryConnection?: LastUsedToolConnectionInfo | null;
    secondaryConnection?: LastUsedToolConnectionInfo | null;
    lastUsedAt?: string;
}

/**
 * Per-tool CSP consent record.
 * Stores whether consent was granted, and which required/optional domains were
 * present at the time of consent (used for future re-consent detection).
 */
export interface CspConsentRecord {
    allowed: boolean;
    required: string[];
    optional: string[];
}

/**
 * User settings for the ToolBox application
 */
export interface UserSettings {
    theme: Theme;
    language: string;
    autoUpdate: boolean;
    terminalFont: string;
    notificationDuration: number; // Duration in milliseconds (0 = persistent)
    showDebugMenu: boolean;
    deprecatedToolsVisibility?: DeprecatedToolsVisibility;
    toolDisplayMode?: ToolDisplayMode;
    lastUsedTools: LastUsedToolEntry[];
    connections: DataverseConnection[];
    installedTools: string[]; // List of installed tool package names
    favoriteTools: string[]; // List of favorite tool IDs
    cspConsents: { [toolId: string]: CspConsentRecord }; // CSP consent records per tool
    toolConnections: { [toolId: string]: string }; // Map of toolId to connectionId
    toolSecondaryConnections: { [toolId: string]: string }; // Map of toolId to secondary connectionId for multi-connection tools
    installId?: string; // Unique install identifier for analytics
    machineId?: string; // @deprecated - legacy machine identifier retained for migrations
    pendingWhatsNewVersion?: string | null; // Version whose What's New should be shown after restart (auto-update)
    restoreSessionOnStartup?: boolean; // Whether to reopen previously open tools on app start
    // Sort preferences
    installedToolsSort?: InstalledToolsSortOption;
    connectionsSort?: ConnectionsSortOption;
    marketplaceSort?: MarketplaceSortOption;
    // Appearance - color indicators
    showCategoryColor?: boolean; // Show/hide the category color strip under the tool tab
    showEnvironmentColor?: boolean; // Show/hide the environment color border around the tool panel
    categoryColorThickness?: number; // Thickness in pixels of the category color border under the tab
    environmentColorThickness?: number; // Thickness in pixels of the environment color border around the tool panel
}
