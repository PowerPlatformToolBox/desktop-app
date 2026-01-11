/**
 * Common types shared across the application
 */

/**
 * CSP (Content Security Policy) exceptions for a tool
 * Allows tools to specify which external resources they need to access
 */
export interface CspExceptions {
    "connect-src"?: string[];
    "script-src"?: string[];
    "style-src"?: string[];
    "img-src"?: string[];
    "font-src"?: string[];
    "frame-src"?: string[];
    "media-src"?: string[];
}

/**
 * Notification options
 */
export interface NotificationOptions {
    title: string;
    body: string;
    type?: "info" | "success" | "warning" | "error";
    duration?: number; // Duration in milliseconds, 0 for persistent
}

/**
 * File dialog filter definition (mirrors Electron's FileFilter type)
 */
export interface FileDialogFilter {
    name: string;
    extensions: string[];
}

/**
 * Options for selecting a file or folder using the system dialog
 */
export interface SelectPathOptions {
    type?: "file" | "folder";
    title?: string;
    message?: string;
    buttonLabel?: string;
    defaultPath?: string;
    filters?: FileDialogFilter[];
}

/**
 * BrowserWindow-backed modal configuration
 */
export interface ModalWindowOptions {
    id?: string;
    html: string;
    width: number;
    height: number;
    resizable?: boolean;
}

/**
 * Payload emitted from BrowserWindow modal content via modalBridge
 */
export interface ModalWindowMessagePayload<TData = unknown> {
    channel: string;
    data?: TData;
}

/**
 * Payload broadcast when a modal window closes
 */
export interface ModalWindowClosedPayload {
    id?: string | null;
}

/**
 * Theme type
 */
export type Theme = "light" | "dark" | "system";
