/**
 * Renderer-specific type definitions
 */

/**
 * Interface for an open tool instance
 */
export interface OpenTool {
    instanceId: string; // Unique instance ID (e.g., "toolId-uuid")
    toolId: string; // The base tool ID
    tool: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    isPinned: boolean;
    connectionId: string | null; // Primary connection
    secondaryConnectionId: string | null; // Secondary connection (for multi-connection tools)
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
 * Tool detail for installed & marketplace display
 */
export interface ToolDetail {
    id: string;
    name: string;
    version: string;
    description?: string;
    hasUpdate?: boolean;
    latestVersion?: string;
    authors?: string[];
    categories?: string[];
    downloads?: number;
    rating?: number;
    mau?: number; // Monthly Active Users
    icon?: string;
    readmeUrl?: string;
    status?: "active" | "deprecated" | "archived"; // Tool lifecycle status
    repository?: string;
    website?: string;
    createdAt?: string; // ISO date string from created_at field
    minAPI?: string; // Minimum ToolBox API version required
    maxAPI?: string; // Maximum ToolBox API version tested
    isSupported?: boolean; // Whether this tool is compatible with current ToolBox version
}
