/**
 * Application initialization module
 * Main entry point that sets up all event listeners and initializes the application
 */

// Initialize Sentry as early as possible in the renderer process
import * as Sentry from "@sentry/electron/renderer";
import { getSentryConfig } from "../../common/sentry";

const sentryConfig = getSentryConfig();
if (sentryConfig) {
    Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        release: sentryConfig.release,
        tracesSampleRate: sentryConfig.tracesSampleRate,
        replaysSessionSampleRate: sentryConfig.replaysSessionSampleRate,
        replaysOnErrorSampleRate: sentryConfig.replaysOnErrorSampleRate,
        // Capture unhandled promise rejections and console errors
        integrations: [
            Sentry.captureConsoleIntegration({
                levels: ["error", "warn"],
            }),
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: true,
                blockAllMedia: true,
            }),
        ],
    });
    console.log("[Sentry] Initialized in renderer process");
} else {
    console.log("[Sentry] Telemetry disabled - no DSN configured");
}

import { Theme } from "../../common/types";
import { DEFAULT_TERMINAL_FONT, LOADING_SCREEN_FADE_DURATION } from "../constants";
import { setupAutoUpdateListeners } from "./autoUpdateManagement";
import { initializeBrowserWindowModals } from "./browserWindowModals";
import { handleReauthentication, initializeAddConnectionModalBridge, loadSidebarConnections, openAddConnectionModal, updateFooterConnection } from "./connectionManagement";
import { loadHomepageData, setupHomepageActions } from "./homepageManagement";
import { loadMarketplace, loadToolsLibrary } from "./marketplaceManagement";
import { closeModal, openModal } from "./modalManagement";
import { showPPTBNotification } from "./notifications";
import { saveSidebarSettings, setOriginalSettings } from "./settingsManagement";
import { switchSidebar } from "./sidebarManagement";
import { handleTerminalClosed, handleTerminalCommandCompleted, handleTerminalCreated, handleTerminalError, handleTerminalOutput, setupTerminalPanel } from "./terminalManagement";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { closeAllTools, initializeTabScrollButtons, restoreSession, setupKeyboardShortcuts, showHomePage } from "./toolManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

/**
 * Initialize the application
 * Sets up all event listeners, loads initial data, and restores session
 */
export async function initializeApplication(): Promise<void> {
    try {
        initializeBrowserWindowModals();
        initializeAddConnectionModalBridge();

        // Set up Activity Bar navigation
        setupActivityBar();

        // Set up toolbar buttons
        setupToolbarButtons();

        // Set up sidebar buttons
        setupSidebarButtons();

        // Set up debug section buttons
        setupDebugSection();

        // Set up settings change listeners
        setupSettingsListeners();

        // Set up home screen action buttons
        setupHomeScreenButtons();

        // Set up modal close buttons
        setupModalButtons();

        // Set up auto-update listeners
        setupAutoUpdateListeners();

        // Set up application event listeners
        setupApplicationEventListeners();

        // Set up keyboard shortcuts
        setupKeyboardShortcuts();

        // Set up homepage actions
        setupHomepageActions();

        // Load and apply theme settings on startup
        await loadInitialSettings();

        // Load tools library from registry
        await loadToolsLibrary();

        // Load initial sidebar content (tools by default)
        await loadSidebarTools();
        await loadMarketplace();

        // Load connections in sidebar immediately (was previously delayed until events)
        await loadSidebarConnections();

        // Update footer connection info
        // Update footer connection status
        // Note: Footer shows active tool's connection, not a global connection
        await updateFooterConnection();

        // Load homepage data
        await loadHomepageData();

        // Restore previous session
        await restoreSession();

        // Set up IPC listeners for authentication dialogs
        setupAuthenticationListeners();

        // Set up loading screen listeners
        setupLoadingScreenListeners();

        // Set up toolbox event listeners
        setupToolboxEventListeners();

        // Handle request for tool panel bounds (for BrowserView positioning)
        setupToolPanelBoundsListener();

        // Set up terminal toggle button
        setupTerminalPanel();
    } catch (error) {
        console.error("Failed to initialize application:", error);
        // If Sentry is available, capture the error
        if (sentryConfig) {
            Sentry.captureException(error);
        }
        // Show error to user using the notification system
        const errorMessage = (error as Error).message || "Unknown error occurred";
        const errorElement = document.createElement("div");
        errorElement.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: var(--error-bg, #d13438);
            color: var(--error-fg, #ffffff);
            padding: 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            max-width: 500px;
            text-align: center;
        `;
        errorElement.innerHTML = `
            <h3 style="margin: 0 0 12px 0; font-size: 18px;">Application Initialization Failed</h3>
            <p style="margin: 0 0 16px 0;">${errorMessage}</p>
            <button id="reload-btn" style="
                background: #ffffff;
                color: #d13438;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            ">Reload Application</button>
        `;
        document.body.appendChild(errorElement);
        document.getElementById("reload-btn")?.addEventListener("click", () => {
            window.location.reload();
        });
    }
}

/**
 * Set up Activity Bar navigation
 */
function setupActivityBar(): void {
    const activityItems = document.querySelectorAll(".activity-item");
    activityItems.forEach((item) => {
        item.addEventListener("click", () => {
            const sidebar = item.getAttribute("data-sidebar");
            if (sidebar) {
                switchSidebar(sidebar);
            }
        });
    });
}

/**
 * Set up toolbar buttons
 */
function setupToolbarButtons(): void {
    const closeAllToolsBtn = document.getElementById("close-all-tools");
    if (closeAllToolsBtn) {
        closeAllToolsBtn.addEventListener("click", () => {
            closeAllTools();
        });
    }

    // Initialize tab scroll buttons
    initializeTabScrollButtons();
}

/**
 * Set up sidebar buttons
 */
function setupSidebarButtons(): void {
    // Sidebar add connection button
    const sidebarAddConnectionBtn = document.getElementById("sidebar-add-connection-btn");
    if (sidebarAddConnectionBtn) {
        sidebarAddConnectionBtn.addEventListener("click", () => {
            openAddConnectionModal().catch((error) => console.error("Failed to open add connection modal", error));
        });
    }

    // Footer change connection button
    const footerChangeConnectionBtn = document.getElementById("footer-change-connection-btn");
    if (footerChangeConnectionBtn) {
        footerChangeConnectionBtn.addEventListener("click", () => {
            openModal("connection-select-modal");
        });
    }

    // Main footer connection status - click to open connection selector for active tool
    const connectionStatus = document.getElementById("connection-status");
    if (connectionStatus) {
        connectionStatus.addEventListener("click", async () => {
            // Import the function dynamically to avoid circular dependencies
            const { openToolConnectionModal } = await import("./toolManagement");
            await openToolConnectionModal();
        });
    }

    // Secondary footer connection status - click to open connection selector for secondary connection
    const secondaryConnectionStatus = document.getElementById("secondary-connection-status");
    if (secondaryConnectionStatus) {
        secondaryConnectionStatus.addEventListener("click", async () => {
            // Import the function dynamically to avoid circular dependencies
            const { openToolSecondaryConnectionModal } = await import("./toolManagement");
            await openToolSecondaryConnectionModal();
        });
    }

    // Sidebar save settings button
    const sidebarSaveSettingsBtn = document.getElementById("sidebar-save-settings-btn");
    if (sidebarSaveSettingsBtn) {
        sidebarSaveSettingsBtn.addEventListener("click", saveSidebarSettings);
    }
}

/**
 * Set up debug section buttons
 */
function setupDebugSection(): void {
    const sidebarBrowseLocalToolBtn = document.getElementById("sidebar-browse-local-tool-btn");
    const sidebarLocalToolPathInput = document.getElementById("sidebar-local-tool-path") as HTMLInputElement;

    if (sidebarBrowseLocalToolBtn) {
        sidebarBrowseLocalToolBtn.addEventListener("click", async () => {
            try {
                const selectedPath = await window.toolboxAPI.openDirectoryPicker();
                if (selectedPath && sidebarLocalToolPathInput) {
                    sidebarLocalToolPathInput.value = selectedPath;
                }
            } catch (error) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Directory Selection Failed",
                    body: `Failed to select directory: ${(error as Error).message}`,
                    type: "error",
                });
            }
        });
    }

    const sidebarLoadLocalToolBtn = document.getElementById("sidebar-load-local-tool-btn");
    if (sidebarLoadLocalToolBtn) {
        sidebarLoadLocalToolBtn.addEventListener("click", async () => {
            if (!sidebarLocalToolPathInput) return;

            const localPath = sidebarLocalToolPathInput.value.trim();
            if (!localPath) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid Path",
                    body: "Please select a tool directory first.",
                    type: "error",
                });
                return;
            }

            sidebarLoadLocalToolBtn.textContent = "Loading...";
            sidebarLoadLocalToolBtn.setAttribute("disabled", "true");

            try {
                const tool = await window.toolboxAPI.loadLocalTool(localPath);

                await window.toolboxAPI.utils.showNotification({
                    title: "Tool Loaded",
                    body: `${tool.name} has been loaded successfully from local directory.`,
                    type: "success",
                });

                sidebarLocalToolPathInput.value = "";
                await loadSidebarTools();
                switchSidebar("tools");
            } catch (error) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Load Failed",
                    body: `Failed to load tool: ${(error as Error).message}`,
                    type: "error",
                    duration: 0,
                });
            } finally {
                sidebarLoadLocalToolBtn.textContent = "Load Tool";
                sidebarLoadLocalToolBtn.removeAttribute("disabled");
            }
        });
    }

    const sidebarInstallPackageBtn = document.getElementById("sidebar-install-package-btn");
    if (sidebarInstallPackageBtn) {
        sidebarInstallPackageBtn.addEventListener("click", async () => {
            const packageNameInput = document.getElementById("sidebar-package-name-input") as HTMLInputElement;
            if (!packageNameInput) return;

            const packageName = packageNameInput.value.trim();
            if (!packageName) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Invalid Package Name",
                    body: "Please enter a valid npm package name.",
                    type: "error",
                });
                return;
            }

            sidebarInstallPackageBtn.textContent = "Installing...";
            sidebarInstallPackageBtn.setAttribute("disabled", "true");

            try {
                const tool = await window.toolboxAPI.installTool(packageName);

                await window.toolboxAPI.utils.showNotification({
                    title: "Tool Installed",
                    body: `${tool.name || packageName} has been installed successfully.`,
                    type: "success",
                });

                packageNameInput.value = "";
                await loadSidebarTools();
                switchSidebar("tools");
            } catch (error) {
                await window.toolboxAPI.utils.showNotification({
                    title: "Installation Failed",
                    body: `Failed to install ${packageName}: ${(error as Error).message}`,
                    type: "error",
                });
            } finally {
                sidebarInstallPackageBtn.textContent = "Install Package";
                sidebarInstallPackageBtn.removeAttribute("disabled");
            }
        });
    }

    // Allow Enter key to trigger install in the package name input
    const packageNameInput = document.getElementById("sidebar-package-name-input");
    if (packageNameInput) {
        packageNameInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                sidebarInstallPackageBtn?.click();
            }
        });
    }
}

/**
 * Set up settings change listeners
 */
function setupSettingsListeners(): void {
    // Theme selector
    const themeSelect = document.getElementById("sidebar-theme-select") as HTMLSelectElement | null;
    if (themeSelect) {
        themeSelect.addEventListener("change", async () => {
            const theme = themeSelect.value as Theme;
            if (theme) {
                await window.toolboxAPI.updateUserSettings({ theme });
                applyTheme(theme);
                setOriginalSettings({ theme });
            }
        });
    }

    // Terminal font selector
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as HTMLSelectElement | null;
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");

    if (terminalFontSelect) {
        terminalFontSelect.addEventListener("change", async () => {
            const terminalFont = terminalFontSelect.value;

            if (customFontContainer) {
                if (terminalFont === "custom") {
                    customFontContainer.style.display = "block";
                    if (customFontInput && customFontInput.value.trim()) {
                        await window.toolboxAPI.updateUserSettings({ terminalFont: customFontInput.value.trim() });
                        applyTerminalFont(customFontInput.value.trim());
                        setOriginalSettings({ terminalFont: customFontInput.value.trim() });
                    }
                } else {
                    customFontContainer.style.display = "none";
                    await window.toolboxAPI.updateUserSettings({ terminalFont });
                    applyTerminalFont(terminalFont);
                    setOriginalSettings({ terminalFont });
                }
            } else if (terminalFont && terminalFont !== "custom") {
                await window.toolboxAPI.updateUserSettings({ terminalFont });
                applyTerminalFont(terminalFont);
                setOriginalSettings({ terminalFont });
            }
        });
    }

    // Custom font input
    if (customFontInput) {
        const applyCustomFont = async () => {
            const customFont = customFontInput.value.trim();
            if (customFont) {
                await window.toolboxAPI.updateUserSettings({ terminalFont: customFont });
                applyTerminalFont(customFont);
                setOriginalSettings({ terminalFont: customFont });
            }
        };

        customFontInput.addEventListener("blur", applyCustomFont);
        customFontInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                applyCustomFont();
            }
        });
    }
}

/**
 * Set up home screen action buttons
 */
function setupHomeScreenButtons(): void {
    const links = [
        { id: "sponsor-btn", url: "https://github.com/sponsors/PowerPlatformToolBox" },
        { id: "github-btn", url: "https://github.com/PowerPlatformToolBox/desktop-app" },
        { id: "font-help-link", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/terminal-setup.md#font-configuration" },
        { id: "bugs-features-btn", url: "https://github.com/PowerPlatformToolBox/desktop-app/issues" },
        { id: "create-tool-btn", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/TOOL_DEV.md" },
        { id: "docs-link", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/README.md" },
        { id: "tool-dev-guide-link", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/TOOL_DEV.md" },
        { id: "architecture-link", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/docs/ARCHITECTURE.md" },
        { id: "contributing-link", url: "https://github.com/PowerPlatformToolBox/desktop-app/blob/main/CONTRIBUTING.md" },
    ];

    links.forEach(({ id, url }) => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener("click", (e) => {
                e.preventDefault();
                window.toolboxAPI.openExternal(url);
            });
        }
    });
}

/**
 * Set up modal buttons
 */
function setupModalButtons(): void {
    // Tool settings modal
    const closeToolSettingsModal = document.getElementById("close-tool-settings-modal");
    if (closeToolSettingsModal) {
        closeToolSettingsModal.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    const cancelToolSettingsBtn = document.getElementById("cancel-tool-settings-btn");
    if (cancelToolSettingsBtn) {
        cancelToolSettingsBtn.addEventListener("click", () => closeModal("tool-settings-modal"));
    }

    // Device code modal
    const closeDeviceCodeBtn = document.getElementById("close-device-code-btn");
    if (closeDeviceCodeBtn) {
        closeDeviceCodeBtn.addEventListener("click", async () => {
            closeModal("device-code-modal");
            await loadSidebarConnections();
        });
    }

    // Authentication error modal
    const closeAuthErrorModal = document.getElementById("close-auth-error-modal");
    if (closeAuthErrorModal) {
        closeAuthErrorModal.addEventListener("click", () => closeModal("auth-error-modal"));
    }

    const closeAuthErrorBtn = document.getElementById("close-auth-error-btn");
    if (closeAuthErrorBtn) {
        closeAuthErrorBtn.addEventListener("click", () => closeModal("auth-error-modal"));
    }
}

/**
 * Set up application event listeners
 */
function setupApplicationEventListeners(): void {
    // Home page listener
    window.toolboxAPI.onShowHomePage(() => {
        showHomePage();
    });
}

/**
 * Load initial settings and apply them
 */
async function loadInitialSettings(): Promise<void> {
    const settings = await window.toolboxAPI.getUserSettings();
    applyTheme(settings.theme);
    applyTerminalFont(settings.terminalFont || DEFAULT_TERMINAL_FONT);
    applyDebugMenuVisibility(settings.showDebugMenu ?? false);
}

/**
 * Set up authentication listeners
 */
function setupAuthenticationListeners(): void {
    window.toolboxAPI.onShowDeviceCodeDialog((message: string) => {
        const messageElement = document.getElementById("device-code-message");
        if (messageElement) {
            const urlRegex = /https:\/\/[a-zA-Z0-9-._~:/?#[\]@!$&'()*+,;=%]+/g;
            messageElement.innerHTML = message.replace(urlRegex, (url) => `<a href="${url}" target="_blank">${url}</a>`);
        }
        openModal("device-code-modal");
    });

    window.toolboxAPI.onCloseDeviceCodeDialog(() => {
        closeModal("device-code-modal");
    });

    window.toolboxAPI.onShowAuthErrorDialog((message: string) => {
        const messageElement = document.getElementById("auth-error-message");
        if (messageElement) {
            messageElement.textContent = message;
        }
        openModal("auth-error-modal");
    });

    window.toolboxAPI.onTokenExpired(async (data: { connectionId: string; connectionName: string }) => {
        console.log("Token expired for connection:", data);

        showPPTBNotification({
            title: "Connection Token Expired",
            body: `Your connection to "${data.connectionName}" has expired.`,
            type: "warning",
            duration: 30000,
            actions: [
                {
                    label: "Re-authenticate",
                    callback: async () => {
                        await handleReauthentication(data.connectionId);
                    },
                },
            ],
        });

        await loadSidebarConnections();
        await updateFooterConnection();
    });
}

/**
 * Set up loading screen listeners
 */
function setupLoadingScreenListeners(): void {
    window.api.on("show-loading-screen", (...args: unknown[]) => {
        const message = args[1] as string;
        const loadingScreen = document.getElementById("loading-screen");
        const loadingMessage = document.getElementById("loading-message");
        if (loadingScreen && loadingMessage) {
            loadingMessage.textContent = message || "Loading...";
            loadingScreen.style.display = "flex";
            loadingScreen.classList.remove("fade-out");
        }
    });

    window.api.on("hide-loading-screen", () => {
        const loadingScreen = document.getElementById("loading-screen");
        if (loadingScreen) {
            loadingScreen.classList.add("fade-out");
            setTimeout(() => {
                loadingScreen.style.display = "none";
            }, LOADING_SCREEN_FADE_DURATION);
        }
    });
}

/**
 * Set up toolbox event listeners
 */
function setupToolboxEventListeners(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.toolboxAPI.events.on((event: any, payload: any) => {
        console.log("ToolBox Event:", payload);

        // Handle notifications
        if (payload.event === "notification:shown") {
            const notificationData = payload.data as { title: string; body: string; type?: string; duration?: number };
            showPPTBNotification({
                title: notificationData.title,
                body: notificationData.body,
                type: notificationData.type || "info",
                duration: notificationData.duration || 5000,
            });
        }

        // Reload connections when connection events occur
        if (payload.event === "connection:created" || payload.event === "connection:updated" || payload.event === "connection:deleted") {
            console.log("Connection event detected, reloading connections...");
            loadSidebarConnections().catch((err) => console.error("Failed to reload sidebar connections:", err));
            updateFooterConnection().catch((err) => console.error("Failed to update footer connection:", err));
        }

        // Reload tools when tool events occur
        if (payload.event === "tool:loaded" || payload.event === "tool:unloaded") {
            console.log("Tool event detected, reloading tools...");
            loadSidebarTools().catch((err) => console.error("Failed to reload sidebar tools:", err));
        }

        // Handle terminal events
        if (payload.event === "terminal:created") {
            handleTerminalCreated(payload.data);
        } else if (payload.event === "terminal:closed") {
            handleTerminalClosed(payload.data);
        } else if (payload.event === "terminal:output") {
            handleTerminalOutput(payload.data);
        } else if (payload.event === "terminal:command:completed") {
            handleTerminalCommandCompleted(payload.data);
        } else if (payload.event === "terminal:error") {
            handleTerminalError(payload.data);
        }
    });
}

/**
 * Set up tool panel bounds listener
 */
function setupToolPanelBoundsListener(): void {
    window.api.on("get-tool-panel-bounds-request", () => {
        const toolPanelContent = document.getElementById("tool-panel-content");

        if (toolPanelContent) {
            const rect = toolPanelContent.getBoundingClientRect();
            const bounds = {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
            };
            console.log("[Renderer] Sending tool panel bounds:", bounds);
            window.api.send("get-tool-panel-bounds-response", bounds);
        } else {
            console.warn("[Renderer] Tool panel content element not found");
        }
    });
}
