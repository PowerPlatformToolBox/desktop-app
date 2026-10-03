/**
 * Renderer-specific type definitions
 */

import type { MarketplaceSource, PreviewFeatureFlags, TelemetryConsentChoice, ToolRegistryEntry } from "../../common/types";

/**
 * Interface for an open tool instance
 */
export interface OpenTool {
    instanceId: string; // Unique instance ID (e.g., "toolId-uuid")
    toolId: string; // The base tool ID
    tool: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    isPinned: boolean;
    connectionIds?: Array<string | null>;
    clearedConnectionSlots?: number[];
    connectionId: string | null; // Primary connection
    secondaryConnectionId: string | null; // Secondary connection (for multi-connection tools)
    isDetailTab?: boolean; // True for tool detail view tabs (not real tool instances)
}

/**
 * Interface for a terminal tab
 */
export interface TerminalTab {
    id: string;
    name: string;
    toolId: string;
    toolInstanceId?: string | null;
    element: HTMLElement;
    outputElement: HTMLElement;
}

/**
 * Notification action button configuration
 */
export interface NotificationAction {
    label: string;
    callback: () => void;
}

/**
 * Notification options for the PPTB notification system
 */
export interface NotificationOptions {
    title: string;
    body: string;
    type?: string;
    duration?: number;
    actions?: Array<NotificationAction>;
}

/**
 * Settings state for tracking changes
 */
export interface SettingsState {
    theme?: string;
    autoUpdate?: boolean;
    showDebugMenu?: boolean;
    deprecatedToolsVisibility?: string;
    toolDisplayMode?: string;
    terminalFont?: string;
    notificationDuration?: number;
    restoreSessionOnStartup?: boolean;
    enableConnectionDoubleClickConnect?: boolean;
    showCategoryColor?: boolean;
    showEnvironmentColor?: boolean;
    categoryColorThickness?: number;
    environmentColorThickness?: number;
    enablePreviewFeatures?: boolean;
    previewFeatures?: PreviewFeatureFlags;
    marketplaceSources?: MarketplaceSource[];
    sentryTelemetryConsent?: TelemetryConsentChoice | null;
}

/**
 * Session data for restoring tool state
 */
export interface SessionData {
    openTools: Array<{
        instanceId: string;
        toolId: string;
        isPinned: boolean;
        connectionId: string | null;
        secondaryConnectionId: string | null;
    }>;
    activeToolId: string | null;
}

/**
 * Tool detail view model for installed and marketplace display
 */
export type ToolDetail = Omit<
    Pick<
        ToolRegistryEntry,
        | "id"
        | "name"
        | "version"
        | "description"
        | "authors"
        | "categories"
        | "size"
        | "downloads"
        | "rating"
        | "mau"
        | "icon"
        | "readmeUrl"
        | "status"
        | "repository"
        | "website"
        | "createdAt"
        | "minAPI"
        | "features"
        | "isSupported"
        | "npmPackageName"
        | "mcpHeadlessEnabled"
        | "marketplaceSourceId"
        | "marketplaceSourceLabel"
        | "marketplaceSourceType"
        | "maturity"
    >,
    "description"
> & {
    description?: string;
    hasUpdate?: boolean;
    latestVersion?: string;
};
