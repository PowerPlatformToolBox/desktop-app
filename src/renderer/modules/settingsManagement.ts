/**
 * Settings management module
 * Handles user settings UI and persistence
 */

import { logError } from "../../common/logger";
import { DEFAULT_NOTIFICATION_DURATION, DEFAULT_TERMINAL_FONT } from "../constants";
import type { SettingsState } from "../types/index";
import { loadMarketplace } from "./marketplaceManagement";
import { setDefaultNotificationDuration } from "./notifications";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";
import { openToolDetailTab } from "./toolManagement";

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
    const toolDisplayModeSelect = document.getElementById("sidebar-tool-display-mode-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");
    const notificationDurationSelect = document.getElementById("sidebar-notification-duration-select") as HTMLSelectElement | null;

    if (themeSelect && autoUpdateCheck && showDebugMenuCheck && deprecatedToolsSelect && toolDisplayModeSelect && terminalFontSelect) {
        const settings = await window.toolboxAPI.getUserSettings();

        // Store original settings for change detection
        originalSettings = {
            theme: settings.theme,
            autoUpdate: settings.autoUpdate,
            showDebugMenu: settings.showDebugMenu ?? false,
            deprecatedToolsVisibility: settings.deprecatedToolsVisibility ?? "hide-all",
            toolDisplayMode: settings.toolDisplayMode ?? "standard",
            terminalFont: settings.terminalFont || DEFAULT_TERMINAL_FONT,
            notificationDuration: settings.notificationDuration ?? DEFAULT_NOTIFICATION_DURATION,
        };

        themeSelect.value = settings.theme;
        autoUpdateCheck.checked = settings.autoUpdate;
        showDebugMenuCheck.checked = settings.showDebugMenu ?? false;
        deprecatedToolsSelect.value = settings.deprecatedToolsVisibility ?? "hide-all";
        toolDisplayModeSelect.value = settings.toolDisplayMode ?? "standard";

        if (notificationDurationSelect) {
            notificationDurationSelect.value = String(settings.notificationDuration ?? DEFAULT_NOTIFICATION_DURATION);
        }

        const terminalFont = settings.terminalFont || DEFAULT_TERMINAL_FONT;

        // Check if the font is a predefined option
        const options = Array.from(terminalFontSelect.options) as HTMLOptionElement[];
        const matchingOption = options.find((opt) => opt.value === terminalFont);

        if (matchingOption) {
            terminalFontSelect.value = terminalFont;
            if (customFontContainer) {
                customFontContainer.style.display = "none";
            }
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
    const toolDisplayModeSelect = document.getElementById("sidebar-tool-display-mode-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const notificationDurationSelect = document.getElementById("sidebar-notification-duration-select") as HTMLSelectElement | null;

    if (!themeSelect || !autoUpdateCheck || !showDebugMenuCheck || !deprecatedToolsSelect || !toolDisplayModeSelect || !terminalFontSelect) return;

    let terminalFont = terminalFontSelect.value;

    // If custom option is selected, use the custom input value
    if (terminalFont === "custom" && customFontInput) {
        terminalFont = customFontInput.value.trim() || DEFAULT_TERMINAL_FONT;
    }

    const notificationDuration = notificationDurationSelect ? Number(notificationDurationSelect.value) : 5000;

    const currentSettings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
        showDebugMenu: showDebugMenuCheck.checked,
        deprecatedToolsVisibility: deprecatedToolsSelect.value,
        toolDisplayMode: toolDisplayModeSelect.value,
        terminalFont: terminalFont,
        notificationDuration,
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
    if (currentSettings.toolDisplayMode !== originalSettings.toolDisplayMode) {
        changedSettings.toolDisplayMode = currentSettings.toolDisplayMode;
    }
    if (currentSettings.terminalFont !== originalSettings.terminalFont) {
        changedSettings.terminalFont = currentSettings.terminalFont;
    }
    if (currentSettings.notificationDuration !== originalSettings.notificationDuration) {
        changedSettings.notificationDuration = currentSettings.notificationDuration;
    }

    // Only save and emit event if something changed
    if (Object.keys(changedSettings).length > 0) {
        await window.toolboxAPI.updateUserSettings(changedSettings);

        // Apply all current settings visually (even if not all changed)
        applyTheme(currentSettings.theme);
        applyTerminalFont(currentSettings.terminalFont);
        applyDebugMenuVisibility(currentSettings.showDebugMenu);
        setDefaultNotificationDuration(currentSettings.notificationDuration);

        // Reload tools list if deprecated tools visibility changed
        if (changedSettings.deprecatedToolsVisibility !== undefined) {
            await loadSidebarTools();
            await loadMarketplace();
        }

        // Reload tools list if display mode changed
        if (changedSettings.toolDisplayMode !== undefined) {
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
 * Render settings UI into a container element (used for the settings tab)
 */
export function renderSettingsContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-container-sidebar">
            <section class="settings-section-card">
                <div class="settings-section-header">
                    <p class="settings-section-eyebrow">Appearance</p>
                    <p class="settings-section-description">Choose how ToolBox matches your OS or lock it to a specific look.</p>
                </div>
                <div class="settings-section-body">
                    <div class="settings-field">
                        <label class="setting-label" for="sidebar-theme-select">Theme</label>
                        <select id="sidebar-theme-select" class="fluent-select">
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </div>
                </div>
            </section>

            <section class="settings-section-card">
                <div class="settings-section-header">
                    <p class="settings-section-eyebrow">Behavior</p>
                    <p class="settings-section-description">Fine-tune how ToolBox surfaces menus and deprecated tools.</p>
                </div>
                <div class="settings-section-body">
                    <div class="settings-field">
                        <div class="settings-field-header">
                            <div>
                                <label class="setting-label" for="sidebar-show-debug-menu-check">Show Debug Menu</label>
                                <span class="setting-hint">Expose the Debug activity to quickly test tools</span>
                            </div>
                            <div class="setting-checkbox-group">
                                <input type="checkbox" id="sidebar-show-debug-menu-check" class="fluent-checkbox" />
                            </div>
                        </div>
                    </div>
                    <div class="settings-field">
                        <label class="setting-label" for="sidebar-deprecated-tools-select">Deprecated Tools</label>
                        <select id="sidebar-deprecated-tools-select" class="fluent-select">
                            <option value="hide-all">Hide from All</option>
                            <option value="show-all">Show in All</option>
                            <option value="show-installed">Show in Installed Tools Only</option>
                            <option value="show-marketplace">Show in Marketplace Only</option>
                        </select>
                        <span class="setting-hint">Control when deprecated tools appear across the experience.</span>
                    </div>
                    <div class="settings-field">
                        <label class="setting-label" for="sidebar-tool-display-mode-select">Tool Display Mode</label>
                        <select id="sidebar-tool-display-mode-select" class="fluent-select">
                            <option value="standard">Standard</option>
                            <option value="compact">Compact</option>
                        </select>
                        <span class="setting-hint">Choose how tools are displayed in Installed Tools and Marketplace.</span>
                    </div>
                    <div class="settings-field">
                        <label class="setting-label" for="sidebar-notification-duration-select">Notification Duration</label>
                        <select id="sidebar-notification-duration-select" class="fluent-select">
                            <option value="3000">3 seconds</option>
                            <option value="5000">5 seconds (Default)</option>
                            <option value="8000">8 seconds</option>
                            <option value="10000">10 seconds</option>
                            <option value="15000">15 seconds</option>
                            <option value="0">Never (persistent)</option>
                        </select>
                        <span class="setting-hint">How long toast notifications stay visible before auto-dismissing.</span>
                    </div>
                </div>
            </section>

            <section class="settings-section-card">
                <div class="settings-section-header">
                    <p class="settings-section-eyebrow">Terminal</p>
                    <p class="settings-section-description">Pick a monospace font that keeps long log output readable.</p>
                </div>
                <div class="settings-section-body">
                    <div class="settings-field">
                        <label class="setting-label" for="sidebar-terminal-font-select">Terminal Font</label>
                        <select id="sidebar-terminal-font-select" class="fluent-select">
                            <option value="'Consolas', 'Monaco', 'Courier New', monospace">Consolas / Monaco (Default)</option>
                            <option value="'MesloLGS NF', 'MesloLGS Nerd Font', 'Menlo', 'DejaVu Sans Mono', 'Consolas', monospace">MesloLGS Nerd Font (Recommended)</option>
                            <option value="'FiraCode Nerd Font', 'FiraCode NF', 'Fira Code', 'Consolas', monospace">FiraCode Nerd Font</option>
                            <option value="'JetBrainsMono Nerd Font', 'JetBrainsMono NF', 'JetBrains Mono', 'Consolas', monospace">JetBrains Mono Nerd Font</option>
                            <option value="'CaskaydiaCove Nerd Font', 'CaskaydiaCove NF', 'Cascadia Code', 'Consolas', monospace">CaskaydiaCove Nerd Font (Cascadia)</option>
                            <option value="'Hack Nerd Font', 'Hack NF', 'Hack', 'Consolas', monospace">Hack Nerd Font</option>
                            <option value="'UbuntuMono Nerd Font', 'UbuntuMono NF', 'Ubuntu Mono', 'Consolas', monospace">Ubuntu Mono Nerd Font</option>
                            <option value="'SourceCodePro Nerd Font', 'SauceCodePro NF', 'Source Code Pro', 'Consolas', monospace">Source Code Pro Nerd Font</option>
                            <option value="'JetBrains Mono', 'Consolas', monospace">JetBrains Mono</option>
                            <option value="'Fira Code', 'Consolas', monospace">Fira Code</option>
                            <option value="'Cascadia Code', 'Consolas', monospace">Cascadia Code</option>
                            <option value="custom">Custom Font...</option>
                        </select>
                    </div>
                    <div id="custom-font-input-container" class="settings-field" style="display: none">
                        <label class="setting-label" for="sidebar-terminal-font-custom">Custom Font</label>
                        <input type="text" id="sidebar-terminal-font-custom" class="fluent-input" placeholder="e.g., 'My Font', monospace" />
                        <span class="setting-hint">Enter font family CSS value (e.g., 'Font Name', 'Fallback', monospace)</span>
                    </div>
                    <span class="setting-hint settings-inline-hint">Install fonts locally before selecting them. <a href="#" id="font-help-link">Need help installing fonts?</a></span>
                </div>
            </section>

            <section class="settings-section-card">
                <div class="settings-section-header">
                    <p class="settings-section-eyebrow">Updates</p>
                    <p class="settings-section-description">Check for the latest version of Power Platform ToolBox.</p>
                </div>
                <div class="settings-section-body">
                    <div class="settings-field">
                        <div class="settings-field-header">
                            <div>
                                <label class="setting-label" for="sidebar-auto-update-check">Auto Update</label>
                                <span class="setting-hint">Automatically check for new builds</span>
                            </div>
                            <div class="setting-checkbox-group">
                                <input type="checkbox" id="sidebar-auto-update-check" class="fluent-checkbox" />
                            </div>
                        </div>
                    </div>
                    <div class="settings-field">
                        <button id="sidebar-check-for-updates-btn" class="fluent-button fluent-button-secondary">
                            <span id="check-updates-btn-text">Check for Updates</span>
                        </button>
                        <div id="update-status-message" class="setting-hint" style="display: none; margin-top: 8px"></div>
                    </div>
                </div>
            </section>

            <div class="settings-actions-row">
                <button id="sidebar-save-settings-btn" class="fluent-button fluent-button-primary">Save Settings</button>
                <span class="setting-hint">Changes apply instantly after saving.</span>
            </div>
        </div>
    `;

    // Wire up save button
    const saveBtn = panel.querySelector("#sidebar-save-settings-btn") as HTMLButtonElement | null;
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            saveSidebarSettings().catch((err) => {
                logError(err instanceof Error ? err : new Error(String(err)));
            });
        });
    }

    // Wire up check for updates button
    const checkForUpdatesBtn = panel.querySelector("#sidebar-check-for-updates-btn") as HTMLButtonElement | null;
    if (checkForUpdatesBtn) {
        checkForUpdatesBtn.addEventListener("click", () => {
            import("./autoUpdateManagement")
                .then(({ handleCheckForUpdates }) => handleCheckForUpdates())
                .catch((err) => {
                    logError(err instanceof Error ? err : new Error(String(err)));
                });
        });
    }

    // Wire up font help link
    const fontHelpLink = panel.querySelector("#font-help-link") as HTMLAnchorElement | null;
    if (fontHelpLink) {
        fontHelpLink.addEventListener("click", (e) => {
            e.preventDefault();
            window.toolboxAPI.openExternal("https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/terminal-setup.md#font-configuration");
        });
    }

    // Wire up terminal font selector to show/hide custom font input
    const terminalFontSelect = panel.querySelector("#sidebar-terminal-font-select") as HTMLSelectElement | null;
    const customFontInput = panel.querySelector("#sidebar-terminal-font-custom") as HTMLInputElement | null;
    const customFontContainer = panel.querySelector("#custom-font-input-container") as HTMLElement | null;

    const toggleCustomFontVisibility = (): void => {
        if (!customFontContainer) return;
        const isCustomSelected = terminalFontSelect?.value === "custom";
        customFontContainer.style.display = isCustomSelected ? "block" : "none";
        if (isCustomSelected && customFontInput) {
            customFontInput.focus();
        }
    };

    if (terminalFontSelect) {
        terminalFontSelect.addEventListener("change", toggleCustomFontVisibility);
    }

    // Load current settings into the panel
    loadSidebarSettings()
        .then(() => {
            toggleCustomFontVisibility();
        })
        .catch((err) => {
            logError(err instanceof Error ? err : new Error(String(err)));
        });
}

/**
 * Open settings as a tab in the main content area
 */
export async function openSettingsTab(): Promise<void> {
    await openToolDetailTab("app-settings", "Settings", renderSettingsContent);
}
