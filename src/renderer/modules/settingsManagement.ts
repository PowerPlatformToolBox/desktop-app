/**
 * Settings management module
 * Handles user settings UI and persistence
 */

import { logError } from "../../common/logger";
import {
    DEFAULT_CATEGORY_COLOR_THICKNESS,
    DEFAULT_ENVIRONMENT_COLOR_THICKNESS,
    DEFAULT_NOTIFICATION_DURATION,
    DEFAULT_SHOW_CATEGORY_COLOR,
    DEFAULT_SHOW_ENVIRONMENT_COLOR,
    DEFAULT_TERMINAL_FONT,
    MAX_COLOR_BORDER_THICKNESS,
    MIN_COLOR_BORDER_THICKNESS,
} from "../constants";
import type { SettingsState } from "../types/index";
import { loadMarketplace } from "./marketplaceManagement";
import { setDefaultNotificationDuration } from "./notifications";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { applyAppearanceSettings, openToolDetailTab } from "./toolManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

// Track original settings to detect changes
let originalSettings: SettingsState = {};

/**
 * Load settings into the settings UI panel
 */
export async function loadSettings(): Promise<void> {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const deprecatedToolsSelect = document.getElementById("sidebar-deprecated-tools-select") as any; // Fluent UI select element
    const toolDisplayModeSelect = document.getElementById("sidebar-tool-display-mode-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");
    const notificationDurationSelect = document.getElementById("sidebar-notification-duration-select") as HTMLSelectElement | null;
    const restoreSessionCheck = document.getElementById("sidebar-restore-session-check") as HTMLInputElement | null;
    const showCategoryColorCheck = document.getElementById("sidebar-show-category-color-check") as HTMLInputElement | null;
    const showEnvironmentColorCheck = document.getElementById("sidebar-show-environment-color-check") as HTMLInputElement | null;
    const categoryColorThicknessInput = document.getElementById("sidebar-category-color-thickness") as HTMLInputElement | null;
    const environmentColorThicknessInput = document.getElementById("sidebar-environment-color-thickness") as HTMLInputElement | null;

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
            restoreSessionOnStartup: settings.restoreSessionOnStartup ?? true,
            showCategoryColor: settings.showCategoryColor ?? DEFAULT_SHOW_CATEGORY_COLOR,
            showEnvironmentColor: settings.showEnvironmentColor ?? DEFAULT_SHOW_ENVIRONMENT_COLOR,
            categoryColorThickness: settings.categoryColorThickness ?? DEFAULT_CATEGORY_COLOR_THICKNESS,
            environmentColorThickness: settings.environmentColorThickness ?? DEFAULT_ENVIRONMENT_COLOR_THICKNESS,
        };

        themeSelect.value = settings.theme;
        autoUpdateCheck.checked = settings.autoUpdate;
        showDebugMenuCheck.checked = settings.showDebugMenu ?? false;
        deprecatedToolsSelect.value = settings.deprecatedToolsVisibility ?? "hide-all";
        toolDisplayModeSelect.value = settings.toolDisplayMode ?? "standard";

        if (notificationDurationSelect) {
            notificationDurationSelect.value = String(settings.notificationDuration ?? DEFAULT_NOTIFICATION_DURATION);
        }

        if (restoreSessionCheck) {
            restoreSessionCheck.checked = settings.restoreSessionOnStartup ?? true;
        }
        if (showCategoryColorCheck) {
            showCategoryColorCheck.checked = settings.showCategoryColor ?? DEFAULT_SHOW_CATEGORY_COLOR;
        }
        if (showEnvironmentColorCheck) {
            showEnvironmentColorCheck.checked = settings.showEnvironmentColor ?? DEFAULT_SHOW_ENVIRONMENT_COLOR;
        }
        if (categoryColorThicknessInput) {
            categoryColorThicknessInput.value = String(settings.categoryColorThickness ?? DEFAULT_CATEGORY_COLOR_THICKNESS);
        }
        if (environmentColorThicknessInput) {
            environmentColorThicknessInput.value = String(settings.environmentColorThickness ?? DEFAULT_ENVIRONMENT_COLOR_THICKNESS);
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
 * Save settings from the settings UI panel
 */
export async function saveSettings(): Promise<void> {
    const themeSelect = document.getElementById("sidebar-theme-select") as any; // Fluent UI select element
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any; // Fluent UI checkbox element
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any; // Fluent UI checkbox element
    const deprecatedToolsSelect = document.getElementById("sidebar-deprecated-tools-select") as any; // Fluent UI select element
    const toolDisplayModeSelect = document.getElementById("sidebar-tool-display-mode-select") as any; // Fluent UI select element
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any; // Fluent UI select element
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const notificationDurationSelect = document.getElementById("sidebar-notification-duration-select") as HTMLSelectElement | null;
    const restoreSessionCheck = document.getElementById("sidebar-restore-session-check") as HTMLInputElement | null;
    const showCategoryColorCheck = document.getElementById("sidebar-show-category-color-check") as HTMLInputElement | null;
    const showEnvironmentColorCheck = document.getElementById("sidebar-show-environment-color-check") as HTMLInputElement | null;
    const categoryColorThicknessInput = document.getElementById("sidebar-category-color-thickness") as HTMLInputElement | null;
    const environmentColorThicknessInput = document.getElementById("sidebar-environment-color-thickness") as HTMLInputElement | null;

    if (!themeSelect || !autoUpdateCheck || !showDebugMenuCheck || !deprecatedToolsSelect || !toolDisplayModeSelect || !terminalFontSelect) return;

    let terminalFont = terminalFontSelect.value;

    // If custom option is selected, use the custom input value
    if (terminalFont === "custom" && customFontInput) {
        terminalFont = customFontInput.value.trim() || DEFAULT_TERMINAL_FONT;
    }

    const notificationDuration = notificationDurationSelect ? Number(notificationDurationSelect.value) : DEFAULT_NOTIFICATION_DURATION;
    const showCategoryColor = showCategoryColorCheck ? showCategoryColorCheck.checked : DEFAULT_SHOW_CATEGORY_COLOR;
    const showEnvironmentColor = showEnvironmentColorCheck ? showEnvironmentColorCheck.checked : DEFAULT_SHOW_ENVIRONMENT_COLOR;
    const categoryColorThickness = categoryColorThicknessInput
        ? Math.min(MAX_COLOR_BORDER_THICKNESS, Math.max(MIN_COLOR_BORDER_THICKNESS, Number(categoryColorThicknessInput.value) || DEFAULT_CATEGORY_COLOR_THICKNESS))
        : DEFAULT_CATEGORY_COLOR_THICKNESS;
    const environmentColorThickness = environmentColorThicknessInput
        ? Math.min(MAX_COLOR_BORDER_THICKNESS, Math.max(MIN_COLOR_BORDER_THICKNESS, Number(environmentColorThicknessInput.value) || DEFAULT_ENVIRONMENT_COLOR_THICKNESS))
        : DEFAULT_ENVIRONMENT_COLOR_THICKNESS;

    const currentSettings = {
        theme: themeSelect.value,
        autoUpdate: autoUpdateCheck.checked,
        showDebugMenu: showDebugMenuCheck.checked,
        deprecatedToolsVisibility: deprecatedToolsSelect.value,
        toolDisplayMode: toolDisplayModeSelect.value,
        terminalFont: terminalFont,
        notificationDuration,
        restoreSessionOnStartup: restoreSessionCheck ? restoreSessionCheck.checked : true,
        showCategoryColor,
        showEnvironmentColor,
        categoryColorThickness,
        environmentColorThickness,
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
    if (currentSettings.restoreSessionOnStartup !== originalSettings.restoreSessionOnStartup) {
        changedSettings.restoreSessionOnStartup = currentSettings.restoreSessionOnStartup;
    }
    if (currentSettings.showCategoryColor !== originalSettings.showCategoryColor) {
        changedSettings.showCategoryColor = currentSettings.showCategoryColor;
    }
    if (currentSettings.showEnvironmentColor !== originalSettings.showEnvironmentColor) {
        changedSettings.showEnvironmentColor = currentSettings.showEnvironmentColor;
    }
    if (currentSettings.categoryColorThickness !== originalSettings.categoryColorThickness) {
        changedSettings.categoryColorThickness = currentSettings.categoryColorThickness;
    }
    if (currentSettings.environmentColorThickness !== originalSettings.environmentColorThickness) {
        changedSettings.environmentColorThickness = currentSettings.environmentColorThickness;
    }

    // Only save and emit event if something changed
    if (Object.keys(changedSettings).length > 0) {
        await window.toolboxAPI.updateUserSettings(changedSettings);

        // Apply all current settings visually (even if not all changed)
        applyTheme(currentSettings.theme);
        applyTerminalFont(currentSettings.terminalFont);
        applyDebugMenuVisibility(currentSettings.showDebugMenu);
        setDefaultNotificationDuration(currentSettings.notificationDuration);
        applyAppearanceSettings(currentSettings.showCategoryColor, currentSettings.showEnvironmentColor, currentSettings.categoryColorThickness, currentSettings.environmentColorThickness);

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
 * Layout follows a VSCode-style two-column design: sticky nav on left, scrollable content on right.
 */
export function renderSettingsContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="settings-tab-scroll-area">

            <section id="settings-section-appearance" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Appearance</h2>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-theme-select">Theme</label>
                        <p class="settings-vscode-item-description">Choose how ToolBox matches your OS or lock it to a specific look.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <select id="sidebar-theme-select" class="fluent-select settings-vscode-select">
                            <option value="system">System</option>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                        </select>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-show-category-color-check">Show Category Color</label>
                        <p class="settings-vscode-item-description">Display the connection's category color as a strip under the active tool tab.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-show-category-color-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-category-color-thickness">Category Color Thickness</label>
                        <p class="settings-vscode-item-description">Thickness in pixels of the category color border displayed under the tool tab (${MIN_COLOR_BORDER_THICKNESS}–${MAX_COLOR_BORDER_THICKNESS} px).</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <input type="number" id="sidebar-category-color-thickness" class="fluent-input settings-vscode-input settings-vscode-number-input" min="${MIN_COLOR_BORDER_THICKNESS}" max="${MAX_COLOR_BORDER_THICKNESS}" step="1" value="${DEFAULT_CATEGORY_COLOR_THICKNESS}" />
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-show-environment-color-check">Show Environment Color</label>
                        <p class="settings-vscode-item-description">Display the connection's environment color as a border around the active tool panel.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-show-environment-color-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-environment-color-thickness">Environment Color Thickness</label>
                        <p class="settings-vscode-item-description">Thickness in pixels of the environment color border displayed around the tool panel (${MIN_COLOR_BORDER_THICKNESS}–${MAX_COLOR_BORDER_THICKNESS} px).</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <input type="number" id="sidebar-environment-color-thickness" class="fluent-input settings-vscode-input settings-vscode-number-input" min="${MIN_COLOR_BORDER_THICKNESS}" max="${MAX_COLOR_BORDER_THICKNESS}" step="1" value="${DEFAULT_ENVIRONMENT_COLOR_THICKNESS}" />
                    </div>
                </div>
            </section>

            <section id="settings-section-behavior" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Behavior</h2>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-show-debug-menu-check">Show Debug Menu</label>
                        <p class="settings-vscode-item-description">Expose the Debug activity to quickly test tools in development.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-show-debug-menu-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-restore-session-check">Restore Session on Startup</label>
                        <p class="settings-vscode-item-description">Automatically reopen the tools that were open when the app was last closed. If a saved connection is no longer valid, you will be prompted to select a new one.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-restore-session-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-deprecated-tools-select">Deprecated Tools</label>
                        <p class="settings-vscode-item-description">Control when deprecated tools appear across the experience.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <select id="sidebar-deprecated-tools-select" class="fluent-select settings-vscode-select">
                            <option value="hide-all">Hide from All</option>
                            <option value="show-all">Show in All</option>
                            <option value="show-installed">Show in Installed Tools Only</option>
                            <option value="show-marketplace">Show in Marketplace Only</option>
                        </select>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-tool-display-mode-select">Tool Display Mode</label>
                        <p class="settings-vscode-item-description">Choose how tools are displayed in Installed Tools and Marketplace.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <select id="sidebar-tool-display-mode-select" class="fluent-select settings-vscode-select">
                            <option value="standard">Standard</option>
                            <option value="compact">Compact</option>
                        </select>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-notification-duration-select">Notification Duration</label>
                        <p class="settings-vscode-item-description">How long toast notifications stay visible before auto-dismissing.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <select id="sidebar-notification-duration-select" class="fluent-select settings-vscode-select">
                            <option value="3000">3 seconds</option>
                            <option value="5000">5 seconds (Default)</option>
                            <option value="8000">8 seconds</option>
                            <option value="10000">10 seconds</option>
                            <option value="15000">15 seconds</option>
                            <option value="0">Never (persistent)</option>
                        </select>
                    </div>
                </div>
            </section>

            <section id="settings-section-terminal" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Terminal</h2>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-terminal-font-select">Terminal Font</label>
                        <p class="settings-vscode-item-description">
                            Pick a monospace font that keeps long log output readable.
                            Install fonts locally before selecting them.
                            <a href="#" id="font-help-link" class="settings-vscode-link">Need help installing fonts?</a>
                        </p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <select id="sidebar-terminal-font-select" class="fluent-select settings-vscode-select">
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
                        <div id="custom-font-input-container" style="display: none; margin-top: 8px">
                            <input type="text" id="sidebar-terminal-font-custom" class="fluent-input settings-vscode-input" placeholder="e.g., 'My Font', monospace" />
                            <p class="settings-vscode-item-description" style="margin-top: 4px">Enter font family CSS value (e.g., 'Font Name', 'Fallback', monospace)</p>
                        </div>
                    </div>
                </div>
            </section>

            <section id="settings-section-updates" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Updates</h2>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-auto-update-check">Auto Update</label>
                        <p class="settings-vscode-item-description">Automatically check for and download new builds of Power Platform ToolBox.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-auto-update-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Check for Updates</span>
                        <p class="settings-vscode-item-description">Manually trigger an update check for the latest version.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <button id="sidebar-check-for-updates-btn" class="fluent-button fluent-button-secondary settings-vscode-btn">
                            <span id="check-updates-btn-text">Check for Updates</span>
                        </button>
                        <div id="update-status-message" class="settings-vscode-item-description" style="display: none; margin-top: 6px"></div>
                    </div>
                </div>
            </section>

            <div class="settings-vscode-actions">
                <button id="sidebar-save-settings-btn" class="fluent-button fluent-button-primary">Save Settings</button>
                <span class="settings-vscode-item-description">Changes apply instantly after saving.</span>
            </div>

        </div>
    `;

    // Wire up save button
    const saveBtn = panel.querySelector("#sidebar-save-settings-btn") as HTMLButtonElement | null;
    if (saveBtn) {
        saveBtn.addEventListener("click", () => {
            saveSettings().catch((err) => {
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

    // Wire up left-nav click-to-scroll navigation
    const scrollArea = panel.querySelector("#settings-tab-scroll-area") as HTMLElement | null;
    const navLinks = panel.querySelectorAll<HTMLAnchorElement>(".settings-nav-link");

    navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute("href")?.slice(1);
            if (!sectionId || !scrollArea) return;
            const target = panel.querySelector<HTMLElement>(`#${sectionId}`);
            if (target) {
                scrollArea.scrollTo({ top: target.offsetTop - 16, behavior: "smooth" });
            }
        });
    });

    // Wire up IntersectionObserver to highlight the active nav link when sections scroll into view
    if (scrollArea) {
        let currentActiveId: string | null = null;
        const sections = panel.querySelectorAll<HTMLElement>(".settings-vscode-section");
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting && entry.target.id !== currentActiveId) {
                        currentActiveId = entry.target.id;
                        navLinks.forEach((link) => {
                            link.classList.toggle("active", link.getAttribute("href") === `#${currentActiveId}`);
                        });
                        break;
                    }
                }
            },
            { root: scrollArea, threshold: 0.3 },
        );
        sections.forEach((s) => observer.observe(s));
    }

    // Load current settings into the panel
    loadSettings()
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
    await openToolDetailTab("app-settings", "Settings", renderSettingsContent, "");
}
