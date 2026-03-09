/**
 * Constants and enums for the renderer process
 */

/**
 * ANSI converter configuration for terminal output
 */
export const ANSI_CONVERTER_CONFIG = {
    fg: "#CCCCCC",
    bg: "#1E1E1E",
    newline: false,
    escapeXML: true,
    stream: false,
} as const;

/**
 * Default notification duration in milliseconds
 */
export const DEFAULT_NOTIFICATION_DURATION = 5000;

/**
 * Token expiration warning notification duration
 */
export const TOKEN_EXPIRY_NOTIFICATION_DURATION = 30000;

/**
 * Default terminal font family
 */
export const DEFAULT_TERMINAL_FONT = "'Consolas', 'Monaco', 'Courier New', monospace";

/**
 * Activity bar icon mappings
 */
export const ACTIVITY_BAR_ICONS = [
    { id: "tools-icon", file: "tools.svg" },
    { id: "connections-icon", file: "connections.svg" },
    { id: "marketplace-icon", file: "marketplace.svg" },
    { id: "search-icon", file: "search.svg" },
    { id: "debug-icon", file: "debug.svg" },
    { id: "settings-icon", file: "settings.svg" },
] as const;

/**
 * Modal animation delay in milliseconds
 */
export const MODAL_ANIMATION_DELAY = 300;

/**
 * Loading screen fade out duration in milliseconds
 */
export const LOADING_SCREEN_FADE_DURATION = 200;

/**
 * Terminal panel resize constraints
 */
export const TERMINAL_RESIZE_CONFIG = {
    MIN_HEIGHT: 100,
    MAX_HEIGHT_RATIO: 0.8,
} as const;
