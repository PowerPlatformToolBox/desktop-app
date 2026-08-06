/**
 * Settings management module
 * Handles user settings UI and persistence
 */

import { logError } from "../../common/logger";
import { buildPreviewFeatureFlags, type MarketplaceSource } from "../../common/types";
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
import { getModalStyles } from "../modals/sharedStyles";
import type { SettingsState } from "../types/index";
import { offBrowserWindowModalClosed, offBrowserWindowModalMessage, onBrowserWindowModalClosed, onBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";
import { loadMarketplace } from "./marketplaceManagement";
import { setDefaultNotificationDuration } from "./notifications";
import {
    applyPreviewFeaturesVisibility,
    collectPreviewFeatureFlagsFromSettingsPanel,
    getPreviewFeatureCheckboxId,
    getPreviewFeatureDefinitions,
    normalizePreviewFeatureFlags,
} from "./previewFeatureManagement";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { applyAppearanceSettings, openLocalPageAsTab, registerCloseGuard } from "./toolManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

// Track original settings to detect changes
let originalSettings: SettingsState = {};

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function arePreviewFeatureFlagsEqual(left?: SettingsState["previewFeatures"], right?: SettingsState["previewFeatures"]): boolean {
    const normalizedLeft = buildPreviewFeatureFlags(left);
    const normalizedRight = buildPreviewFeatureFlags(right);
    return Object.keys(normalizedLeft).every((featureId) => normalizedLeft[featureId as keyof typeof normalizedLeft] === normalizedRight[featureId as keyof typeof normalizedRight]);
}

function renderPreviewFeatureSettingsRows(): string {
    return getPreviewFeatureDefinitions()
        .map((feature) => {
            const checkboxId = getPreviewFeatureCheckboxId(feature.id);
            return `
                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="${checkboxId}">${feature.label}</label>
                        <p class="settings-vscode-item-description">${feature.description}</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="${checkboxId}" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>
            `;
        })
        .join("");
}

function renderMarketplaceSourcesList(sources: MarketplaceSource[]): string {
    const privateSources = sources.filter((source) => source.type !== "builtin");
    if (privateSources.length === 0) {
        return `
            <div class="settings-vscode-item-description" style="margin-top: 8px;">
                No private marketplace sources configured yet.
            </div>
        `;
    }

    return privateSources
        .map((source) => {
            const sourceId = source.id || `marketplace-${Math.random().toString(36).slice(2, 9)}`;
            return `
                <div class="settings-vscode-marketplace-source-row" data-source-id="${escapeHtml(sourceId)}">
                    <div class="settings-vscode-marketplace-source-fields">
                        <input type="text" class="fluent-input settings-vscode-input settings-vscode-marketplace-source-label-input" data-field="label" value="${escapeHtml(source.label || "")}" placeholder="Display name" />
                        <input type="text" class="fluent-input settings-vscode-input settings-vscode-marketplace-source-url-input" data-field="url" value="${escapeHtml(source.url || "")}" placeholder="https://.../registry.json" />
                    </div>
                    <div class="settings-vscode-marketplace-source-actions">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" class="settings-vscode-checkbox" data-field="enabled" ${source.enabled ? "checked" : ""} />
                            <span>Enabled</span>
                        </label>
                        <button type="button" class="fluent-button fluent-button-secondary" data-action="remove-marketplace-source">Remove</button>
                    </div>
                </div>
            `;
        })
        .join("");
}

function collectMarketplaceSourcesFromSettingsPanel(): MarketplaceSource[] {
    const builtInCheckbox = document.getElementById("sidebar-marketplace-builtin-check") as HTMLInputElement | null;
    const listContainer = document.getElementById("marketplace-sources-list") as HTMLElement | null;
    const builtInTemplate = originalSettings.marketplaceSources?.find((source) => source.id === "builtin-pptb") ?? {
        id: "builtin-pptb",
        type: "builtin" as const,
        label: "Power Platform ToolBox marketplace",
        url: "",
        enabled: true,
        description: "Built-in public marketplace",
    };

    const sources: MarketplaceSource[] = [
        {
            ...builtInTemplate,
            id: "builtin-pptb",
            type: "builtin",
            enabled: builtInCheckbox?.checked ?? builtInTemplate.enabled ?? true,
        },
    ];

    if (!listContainer) {
        return sources;
    }

    const sourceRows = Array.from(listContainer.querySelectorAll<HTMLElement>(".settings-vscode-marketplace-source-row"));
    sourceRows.forEach((row) => {
        const label = (row.querySelector<HTMLInputElement>("[data-field='label']")?.value || "").trim();
        const url = (row.querySelector<HTMLInputElement>("[data-field='url']")?.value || "").trim();
        const enabled = row.querySelector<HTMLInputElement>("[data-field='enabled']")?.checked ?? false;
        const sourceId = row.getAttribute("data-source-id") || `marketplace-${sources.length + 1}`;

        if (!label && !url) {
            return;
        }

        sources.push({
            id: sourceId,
            type: "private",
            label,
            url,
            enabled,
        });
    });

    return sources;
}

function shouldPromptRestartForMarketplaceSourceChanges(previousSources: MarketplaceSource[], nextSources: MarketplaceSource[]): boolean {
    const previousBuiltInEnabled = previousSources.find((source) => source.id === "builtin-pptb")?.enabled ?? true;
    const nextBuiltInEnabled = nextSources.find((source) => source.id === "builtin-pptb")?.enabled ?? true;

    const builtInChanged = previousBuiltInEnabled !== nextBuiltInEnabled;

    const normalizePrivateSources = (sources: MarketplaceSource[]) =>
        sources
            .filter((source) => source.type === "private")
            .map((source) => ({
                id: source.id,
                label: source.label,
                url: source.url,
                enabled: source.enabled,
            }))
            .sort((left, right) => left.id.localeCompare(right.id));

    const privateSourcesChanged = JSON.stringify(normalizePrivateSources(previousSources)) !== JSON.stringify(normalizePrivateSources(nextSources));

    return builtInChanged || privateSourcesChanged;
}

async function promptRestartForMarketplaceSourceChanges(): Promise<boolean> {
    const modalId = "marketplace-source-restart-required";
    const restartChannel = "settings:marketplace-restart-now";
    const laterChannel = "settings:marketplace-restart-later";
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const styles = `${getModalStyles(isDarkTheme)}
<style>
    .restart-required-hero {
        border: 1px solid ${isDarkTheme ? "rgba(0, 180, 216, 0.35)" : "rgba(14, 99, 156, 0.25)"};
        background: ${isDarkTheme ? "linear-gradient(135deg, rgba(0, 180, 216, 0.15) 0%, rgba(106, 0, 255, 0.18) 100%)" : "linear-gradient(135deg, rgba(14, 99, 156, 0.08) 0%, rgba(106, 0, 255, 0.1) 100%)"};
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 12px;
    }

    .restart-required-hero-title {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 600;
    }

    .restart-required-hero-text {
        margin: 0;
        font-size: 13px;
        line-height: 1.4;
        color: ${isDarkTheme ? "rgba(255,255,255,0.88)" : "rgba(31,31,31,0.88)"};
    }

    .restart-required-note {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        color: ${isDarkTheme ? "rgba(255,255,255,0.75)" : "rgba(31,31,31,0.72)"};
    }
</style>`;
    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Marketplace</p>
            <h3>Restart Required</h3>
        </div>
        <button class="icon-button" id="marketplace-restart-close-btn" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
        <div class="restart-required-hero">
            <p class="restart-required-hero-title">Marketplace source changes were saved</p>
            <p class="restart-required-hero-text">Restart Power Platform ToolBox to apply marketplace source updates.</p>
        </div>
        <p class="restart-required-note">Marketplace source was changed. These changes take effect after restarting the app.</p>
    </div>
    <div class="modal-footer">
        <button type="button" id="marketplace-restart-later-btn" class="fluent-button fluent-button-secondary">Later</button>
        <button type="button" id="marketplace-restart-now-btn" class="fluent-button fluent-button-primary">Restart Now</button>
    </div>
</div>`;
    const script = `
<script>
(() => {
    const bridge = window.modalBridge;
    if (!bridge) return;

    const restartNow = () => bridge.send(${JSON.stringify(restartChannel)});
    const restartLater = () => bridge.send(${JSON.stringify(laterChannel)});

    document.getElementById("marketplace-restart-now-btn")?.addEventListener("click", restartNow);
    document.getElementById("marketplace-restart-later-btn")?.addEventListener("click", restartLater);
    document.getElementById("marketplace-restart-close-btn")?.addEventListener("click", restartLater);
})();
</script>`;

    const html = `${styles}\n${body}\n${script}`;

    return await new Promise<boolean>((resolve) => {
        let shouldRestart = false;

        const onMessage = (payload: { channel: string }) => {
            if (payload?.channel === restartChannel) {
                shouldRestart = true;
                void window.toolboxAPI.utils.closeModalWindow();
                return;
            }

            if (payload?.channel === laterChannel) {
                shouldRestart = false;
                void window.toolboxAPI.utils.closeModalWindow();
            }
        };

        const onClosed = () => {
            offBrowserWindowModalMessage(onMessage);
            offBrowserWindowModalClosed(onClosed);
            resolve(shouldRestart);
        };

        onBrowserWindowModalMessage(onMessage);
        onBrowserWindowModalClosed(onClosed);

        showBrowserWindowModal({
            id: modalId,
            html,
            width: 520,
            height: 320,
        }).catch((error) => {
            offBrowserWindowModalMessage(onMessage);
            offBrowserWindowModalClosed(onClosed);
            logError(error instanceof Error ? error : new Error(String(error)));
            resolve(false);
        });
    });
}

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
    const marketplaceBuiltinCheck = document.getElementById("sidebar-marketplace-builtin-check") as HTMLInputElement | null;
    const marketplaceSourcesList = document.getElementById("marketplace-sources-list") as HTMLElement | null;

    if (themeSelect && autoUpdateCheck && showDebugMenuCheck && deprecatedToolsSelect && toolDisplayModeSelect && terminalFontSelect) {
        const settings = await window.toolboxAPI.getUserSettings();
        const previewFeatures = normalizePreviewFeatureFlags(settings);

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
            enablePreviewFeatures: Object.values(previewFeatures).some((enabled) => enabled === true),
            previewFeatures,
            marketplaceSources: settings.marketplaceSources ?? [],
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
        if (marketplaceBuiltinCheck) {
            const builtInSource = (settings.marketplaceSources ?? []).find((source) => source.id === "builtin-pptb");
            marketplaceBuiltinCheck.checked = builtInSource?.enabled ?? true;
        }
        if (marketplaceSourcesList) {
            marketplaceSourcesList.innerHTML = renderMarketplaceSourcesList(settings.marketplaceSources ?? []);
        }
        getPreviewFeatureDefinitions().forEach((feature) => {
            const checkbox = document.getElementById(getPreviewFeatureCheckboxId(feature.id)) as HTMLInputElement | null;
            if (checkbox) {
                checkbox.checked = previewFeatures[feature.id] === true;
            }
        });

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
    const previewFeatures = collectPreviewFeatureFlagsFromSettingsPanel();
    const enablePreviewFeatures = Object.values(previewFeatures).some((enabled) => enabled === true);
    const marketplaceSources = collectMarketplaceSourcesFromSettingsPanel();

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
        enablePreviewFeatures,
        previewFeatures,
        marketplaceSources,
    };

    const requiresRestartForMarketplaceSources = shouldPromptRestartForMarketplaceSourceChanges(originalSettings.marketplaceSources ?? [], currentSettings.marketplaceSources);

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
    if (currentSettings.enablePreviewFeatures !== (originalSettings.enablePreviewFeatures ?? false)) {
        changedSettings.enablePreviewFeatures = currentSettings.enablePreviewFeatures;
    }
    if (!arePreviewFeatureFlagsEqual(currentSettings.previewFeatures, originalSettings.previewFeatures ?? buildPreviewFeatureFlags())) {
        changedSettings.previewFeatures = currentSettings.previewFeatures;
    }
    if (JSON.stringify(currentSettings.marketplaceSources) !== JSON.stringify(originalSettings.marketplaceSources ?? [])) {
        changedSettings.marketplaceSources = currentSettings.marketplaceSources;
    }

    // Only save and emit event if something changed
    if (Object.keys(changedSettings).length > 0) {
        await window.toolboxAPI.updateUserSettings(changedSettings);

        // Apply all current settings visually (even if not all changed)
        applyTheme(currentSettings.theme);
        applyTerminalFont(currentSettings.terminalFont);
        applyDebugMenuVisibility(currentSettings.showDebugMenu);
        applyPreviewFeaturesVisibility(currentSettings.previewFeatures);
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

        if (changedSettings.marketplaceSources !== undefined && requiresRestartForMarketplaceSources) {
            const shouldRestart = await promptRestartForMarketplaceSourceChanges();
            if (shouldRestart) {
                await window.toolboxAPI.utils.restartApp();
            }
        }
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
 * Check whether the settings UI currently differs from the last saved state.
 * Returns true if there are unsaved changes.
 */
function hasUnsavedChanges(): boolean {
    const themeSelect = document.getElementById("sidebar-theme-select") as any;
    const autoUpdateCheck = document.getElementById("sidebar-auto-update-check") as any;
    const showDebugMenuCheck = document.getElementById("sidebar-show-debug-menu-check") as any;
    const deprecatedToolsSelect = document.getElementById("sidebar-deprecated-tools-select") as any;
    const toolDisplayModeSelect = document.getElementById("sidebar-tool-display-mode-select") as any;
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as any;
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement | null;
    const notificationDurationSelect = document.getElementById("sidebar-notification-duration-select") as HTMLSelectElement | null;
    const restoreSessionCheck = document.getElementById("sidebar-restore-session-check") as HTMLInputElement | null;
    const showCategoryColorCheck = document.getElementById("sidebar-show-category-color-check") as HTMLInputElement | null;
    const showEnvironmentColorCheck = document.getElementById("sidebar-show-environment-color-check") as HTMLInputElement | null;
    const categoryColorThicknessInput = document.getElementById("sidebar-category-color-thickness") as HTMLInputElement | null;
    const environmentColorThicknessInput = document.getElementById("sidebar-environment-color-thickness") as HTMLInputElement | null;

    // If the DOM elements aren't present the settings panel isn't rendered — no unsaved changes
    if (!themeSelect || !autoUpdateCheck || !showDebugMenuCheck || !deprecatedToolsSelect || !toolDisplayModeSelect || !terminalFontSelect) {
        return false;
    }

    let terminalFont = terminalFontSelect.value;
    if (terminalFont === "custom" && customFontInput) {
        terminalFont = customFontInput.value.trim() || DEFAULT_TERMINAL_FONT;
    }

    if (themeSelect.value !== originalSettings.theme) return true;
    if (autoUpdateCheck.checked !== originalSettings.autoUpdate) return true;
    if (showDebugMenuCheck.checked !== (originalSettings.showDebugMenu ?? false)) return true;
    if (deprecatedToolsSelect.value !== (originalSettings.deprecatedToolsVisibility ?? "hide-all")) return true;
    if (toolDisplayModeSelect.value !== (originalSettings.toolDisplayMode ?? "standard")) return true;
    if (terminalFont !== (originalSettings.terminalFont || DEFAULT_TERMINAL_FONT)) return true;
    if (notificationDurationSelect && Number(notificationDurationSelect.value) !== (originalSettings.notificationDuration ?? DEFAULT_NOTIFICATION_DURATION)) return true;
    if (restoreSessionCheck && restoreSessionCheck.checked !== (originalSettings.restoreSessionOnStartup ?? true)) return true;
    if (showCategoryColorCheck && showCategoryColorCheck.checked !== (originalSettings.showCategoryColor ?? DEFAULT_SHOW_CATEGORY_COLOR)) return true;
    if (showEnvironmentColorCheck && showEnvironmentColorCheck.checked !== (originalSettings.showEnvironmentColor ?? DEFAULT_SHOW_ENVIRONMENT_COLOR)) return true;
    if (categoryColorThicknessInput) {
        const val = Math.min(MAX_COLOR_BORDER_THICKNESS, Math.max(MIN_COLOR_BORDER_THICKNESS, Number(categoryColorThicknessInput.value) || DEFAULT_CATEGORY_COLOR_THICKNESS));
        if (val !== (originalSettings.categoryColorThickness ?? DEFAULT_CATEGORY_COLOR_THICKNESS)) return true;
    }
    if (environmentColorThicknessInput) {
        const val = Math.min(MAX_COLOR_BORDER_THICKNESS, Math.max(MIN_COLOR_BORDER_THICKNESS, Number(environmentColorThicknessInput.value) || DEFAULT_ENVIRONMENT_COLOR_THICKNESS));
        if (val !== (originalSettings.environmentColorThickness ?? DEFAULT_ENVIRONMENT_COLOR_THICKNESS)) return true;
    }

    const currentPreviewFeatures = collectPreviewFeatureFlagsFromSettingsPanel();
    if (!arePreviewFeatureFlagsEqual(currentPreviewFeatures, originalSettings.previewFeatures ?? buildPreviewFeatureFlags())) return true;

    const currentMarketplaceSources = collectMarketplaceSourcesFromSettingsPanel();
    if (JSON.stringify(currentMarketplaceSources) !== JSON.stringify(originalSettings.marketplaceSources ?? [])) return true;

    return false;
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

            <section id="settings-section-marketplace" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Marketplace</h2>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <label class="settings-vscode-item-label" for="sidebar-marketplace-builtin-check">Built-in public marketplace</label>
                        <p class="settings-vscode-item-description">Enable the default ToolBox marketplace. It stays available when no private marketplace source is configured.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="sidebar-marketplace-builtin-check" class="settings-vscode-checkbox" />
                            <span>Enable</span>
                        </label>
                    </div>
                </div>

                <div class="settings-vscode-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Private marketplace sources</span>
                        <p class="settings-vscode-item-description">Add one or more private registries to supplement or override the built-in marketplace.</p>
                    </div>
                    <div class="settings-vscode-item-control">
                        <button id="sidebar-add-marketplace-source-btn" class="fluent-button fluent-button-secondary settings-vscode-btn">Add private source</button>
                    </div>
                </div>

                <div id="marketplace-sources-list"></div>
            </section>

            <section id="settings-section-preview" class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Preview Features</h2>
                ${renderPreviewFeatureSettingsRows()}
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

    // Wire up marketplace source add/remove actions
    const addMarketplaceSourceBtn = panel.querySelector("#sidebar-add-marketplace-source-btn") as HTMLButtonElement | null;
    const marketplaceSourcesList = panel.querySelector("#marketplace-sources-list") as HTMLElement | null;
    if (addMarketplaceSourceBtn && marketplaceSourcesList) {
        addMarketplaceSourceBtn.addEventListener("click", () => {
            const nextSourceId = `marketplace-${Date.now()}`;
            marketplaceSourcesList.insertAdjacentHTML(
                "beforeend",
                `
                    <div class="settings-vscode-marketplace-source-row" data-source-id="${escapeHtml(nextSourceId)}">
                        <div class="settings-vscode-marketplace-source-fields">
                            <input type="text" class="fluent-input settings-vscode-input settings-vscode-marketplace-source-label-input" data-field="label" placeholder="Display name" />
                            <input type="text" class="fluent-input settings-vscode-input settings-vscode-marketplace-source-url-input" data-field="url" placeholder="https://.../registry.json" />
                        </div>
                        <div class="settings-vscode-marketplace-source-actions">
                            <label class="settings-vscode-checkbox-label">
                                <input type="checkbox" class="settings-vscode-checkbox" data-field="enabled" checked />
                                <span>Enabled</span>
                            </label>
                            <button type="button" class="fluent-button fluent-button-secondary" data-action="remove-marketplace-source">Remove</button>
                        </div>
                    </div>
                `,
            );
        });

        const list = marketplaceSourcesList as HTMLElement & { _pptbBound?: boolean };
        if (!list._pptbBound) {
            list._pptbBound = true;
            list.addEventListener("click", (event) => {
                const target = event.target as HTMLElement | null;
                const removeButton = target?.closest("[data-action='remove-marketplace-source']") as HTMLButtonElement | null;
                if (!removeButton) {
                    return;
                }

                removeButton.closest(".settings-vscode-marketplace-source-row")?.remove();
            });
        }
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
    registerCloseGuard("app-settings", async () => {
        if (!hasUnsavedChanges()) return true;
        return window.confirm("You have unsaved settings changes. Close anyway and discard them?");
    });
    await openLocalPageAsTab("app-settings", "Settings", renderSettingsContent, "");
}
