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
 * Theme type
 */
export type Theme = "light" | "dark" | "system";
