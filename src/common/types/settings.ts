/**
 * Settings-related type definitions
 */

import { Theme } from "./common";
import { Connection } from "./connection";

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

export const PREVIEW_FEATURE_IDS = {
    MCP_SERVER: "mcp-server",
} as const;

export type PreviewFeatureId = (typeof PREVIEW_FEATURE_IDS)[keyof typeof PREVIEW_FEATURE_IDS];
export type PreviewFeatureFlags = Partial<Record<PreviewFeatureId, boolean>>;

export const PREVIEW_FEATURE_DEFAULTS: Record<PreviewFeatureId, boolean> = {
    [PREVIEW_FEATURE_IDS.MCP_SERVER]: false,
};

/**
 * Returns a normalized preview-feature map that always includes all known feature IDs.
 * If an override value is missing for a feature, the legacy fallback (when provided)
 * is used first, then the feature's default value.
 */
export function buildPreviewFeatureFlags(overrides?: PreviewFeatureFlags, legacyFallback?: boolean): Record<PreviewFeatureId, boolean> {
    const normalized = { ...PREVIEW_FEATURE_DEFAULTS };

    (Object.keys(PREVIEW_FEATURE_DEFAULTS) as PreviewFeatureId[]).forEach((featureId) => {
        const overrideValue = overrides?.[featureId];
        if (typeof overrideValue === "boolean") {
            normalized[featureId] = overrideValue;
            return;
        }

        if (typeof legacyFallback === "boolean") {
            normalized[featureId] = legacyFallback;
        }
    });

    return normalized;
}

export interface LastUsedToolConnectionInfo {
    id: string | null;
    name?: string;
    environment?: Connection["environment"];
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
    connections: Connection[];
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
    mcpAccessToken?: string; // Access token for local MCP server authentication
    splitDividerRatio?: number; // Persisted position of the split-pane divider (0.15–0.85)
    enablePreviewFeatures?: boolean; // Show preview/experimental features in the UI
    previewFeatures?: PreviewFeatureFlags; // Per-feature preview toggles keyed by preview feature ID
}
