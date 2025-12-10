/**
 * Renderer-specific type definitions
 */

/**
 * Interface for an open tool instance
 */
export interface OpenTool {
    id: string;
    tool: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    isPinned: boolean;
    connectionId: string | null;
}

/**
 * Interface for a terminal tab
 */
export interface TerminalTab {
    id: string;
    name: string;
    toolId: string;
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
    terminalFont?: string;
}

/**
 * Session data for restoring tool state
 */
export interface SessionData {
    openTools: Array<{
        id: string;
        isPinned: boolean;
        connectionId: string | null;
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
    icon?: string;
    description?: string;
    hasUpdate?: boolean;
    latestVersion?: string;
    authors?: string[];
    categories?: string[];
    downloads?: number;
    rating?: number;
    aum?: number;
}
