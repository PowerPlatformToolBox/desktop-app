/**
 * Common types shared across the application
 */

/**
 * Extended CSP exception entry that allows tool developers to explain why they need the exception
 */
export interface CspExceptionEntry {
    /** The domain or source expression being allowed (e.g. "api.example.com") */
    domain: string;
    /** Markdown-formatted explanation of why this domain is needed */
    exceptionReason?: string;
    /** Whether this exception is optional (tool still functions without it) */
    optional?: boolean;
}

/**
 * A CSP exception source can be a plain domain string (legacy) or a detailed entry object
 */
export type CspExceptionSource = string | CspExceptionEntry;

/**
 * Normalize a CspExceptionSource to a CspExceptionEntry object
 */
export function normalizeCspExceptionSource(source: CspExceptionSource): CspExceptionEntry {
    if (typeof source === "string") {
        return { domain: source };
    }
    return source;
}

/**
 * CSP (Content Security Policy) exceptions for a tool
 * Allows tools to specify which external resources they need to access.
 * Each source can be a plain string (legacy) or a CspExceptionEntry object with an optional reason.
 */
export interface CspExceptions {
    "connect-src"?: CspExceptionSource[];
    "script-src"?: CspExceptionSource[];
    "style-src"?: CspExceptionSource[];
    "img-src"?: CspExceptionSource[];
    "font-src"?: CspExceptionSource[];
    "frame-src"?: CspExceptionSource[];
    "media-src"?: CspExceptionSource[];
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
    alwaysOnTop?: boolean;
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
