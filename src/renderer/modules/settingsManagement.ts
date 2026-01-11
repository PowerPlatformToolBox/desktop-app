/**
 * Settings management module
 * Handles user settings UI and persistence
 */

import { DEFAULT_TERMINAL_FONT } from "../constants";
import type { SettingsState } from "../types/index";
import { loadMarketplace } from "./marketplaceManagement";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

// Track original settings to detect changes
let originalSettings: SettingsState = {};

/**
 * Load settings in the sidebar
 */
export async function loadSidebarSettings(): Promise<void> {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const deprecatedToolsSelect = document.getElementById("sidebar-deprecated-tools-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");

    if (themeSelect && autoUpdateCheck && showDebugMenuCheck && deprecatedToolsSelect && terminalFontSelect) {
        const settings = await window.toolboxAPI.getUserSettings();

        // Store original settings for change detection
        originalSettings = {
            theme: settings.theme,
            autoUpdate: settings.autoUpdate,
            showDebugMenu: settings.showDebugMenu ?? false,
            deprecatedToolsVisibility: settings.deprecatedToolsVisibility ?? "hide-all",
            terminalFont: settings.terminalFont || DEFAULT_TERMINAL_FONT,
        };

        themeSelect.value = settings.theme;
        autoUpdateCheck.checked = settings.autoUpdate;
        showDebugMenuCheck.checked = settings.showDebugMenu ?? false;
        deprecatedToolsSelect.value = settings.deprecatedToolsVisibility ?? "hide-all";

        const terminalFont = settings.terminalFont || DEFAULT_TERMINAL_FONT;

        // Check if the font is a predefined option
        const options = Array.from(terminalFontSelect.options) as HTMLOptionElement[];
        const matchingOption = options.find((opt) => opt.value === terminalFont);

        if (matchingOption) {
            terminalFontSelect.value = terminalFont;
        } else {
            // Custom font - set dropdown to "custom" and populate input
            terminalFontSelect.value = "custom";
            if (customFontInput) {
                customFontInput.value = terminalFont;
            }
            if (customFontContainer) {
                customFontContainer.style.display = "block";
            }
        }

        // Apply current terminal font
        applyTerminalFont(terminalFont);
    }
}

/**
 * Save settings from the sidebar
 */
export async function saveSidebarSettings(): Promise<void> {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const deprecatedToolsSelect = document.getElementById("sidebar-deprecated-tools-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;

    if (!themeSelect || !autoUpdateCheck || !showDebugMenuCheck || !deprecatedToolsSelect || !terminalFontSelect) return;

    let terminalFont = terminalFontSelect.value;

    // If custom option is selected, use the custom input value
    if (terminalFont === "custom" && customFontInput) {
        terminalFont = customFontInput.value.trim() || DEFAULT_TERMINAL_FONT;
    }

    const currentSettings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
        showDebugMenu: showDebugMenuCheck.checked,
        deprecatedToolsVisibility: deprecatedToolsSelect.value,
        terminalFont: terminalFont,
    };

    // Only include changed settings in the update
    const changedSettings: any = {};

    if (currentSettings.theme !== originalSettings.theme) {
        changedSettings.theme = currentSettings.theme;
    }
    if (currentSettings.autoUpdate !== originalSettings.autoUpdate) {
        changedSettings.autoUpdate = currentSettings.autoUpdate;
    }
    if (currentSettings.showDebugMenu !== originalSettings.showDebugMenu) {
        changedSettings.showDebugMenu = currentSettings.showDebugMenu;
    }
    if (currentSettings.deprecatedToolsVisibility !== originalSettings.deprecatedToolsVisibility) {
        changedSettings.deprecatedToolsVisibility = currentSettings.deprecatedToolsVisibility;
    }
    if (currentSettings.terminalFont !== originalSettings.terminalFont) {
        changedSettings.terminalFont = currentSettings.terminalFont;
    }

    // Only save and emit event if something changed
    if (Object.keys(changedSettings).length > 0) {
        await window.toolboxAPI.updateUserSettings(changedSettings);

        // Apply all current settings visually (even if not all changed)
        applyTheme(currentSettings.theme);
        applyTerminalFont(currentSettings.terminalFont);
        applyDebugMenuVisibility(currentSettings.showDebugMenu);

        // Reload tools list if deprecated tools visibility changed
        if (changedSettings.deprecatedToolsVisibility !== undefined) {
            await loadSidebarTools();
            await loadMarketplace();
        }

        // Update original settings to reflect new state
        originalSettings = { ...currentSettings };

        await window.toolboxAPI.utils.showNotification({
            title: "Settings Saved",
            body: "Your settings have been saved.",
            type: "success",
        });
    }
    // If no changes, do nothing (no notification shown)
}

/**
 * Get original settings
 */
export function getOriginalSettings(): SettingsState {
    return originalSettings;
}

/**
 * Set original settings (used when settings are updated programmatically)
 */
export function setOriginalSettings(settings: SettingsState): void {
    originalSettings = settings;
}
