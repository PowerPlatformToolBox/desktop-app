/**
 * Theme utility functions
 */

import { nativeTheme } from "electron";
import { Theme } from "../../common/types";

/**
 * Get the current system theme
 */
export function getSystemTheme(): "light" | "dark" {
    return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

/**
 * Resolve theme setting to actual theme
 */
export function resolveTheme(theme: Theme): "light" | "dark" {
    if (theme === "system") {
        return getSystemTheme();
    }
    return theme;
}
