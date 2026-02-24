/**
 * Application initialization module
 * Main entry point that sets up all event listeners and initializes the application
 */

// Initialize Sentry as early as possible in the renderer process
import * as Sentry from "@sentry/electron/renderer";
import { getSentryConfig } from "../../common/sentry";
import { addBreadcrumb, captureException, initializeSentryHelper, logCheckpoint, logInfo, logWarn, setSentryInstallId, wrapAsyncOperation } from "../../common/sentryHelper";

const sentryConfig = getSentryConfig();
if (sentryConfig) {
    Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment,
        release: sentryConfig.release,
        tracesSampleRate: sentryConfig.tracesSampleRate,
        replaysSessionSampleRate: sentryConfig.replaysSessionSampleRate,
        replaysOnErrorSampleRate: sentryConfig.replaysOnErrorSampleRate,
        // Enable Sentry logger for structured logging only in development to reduce telemetry noise
        // In production, we rely on captureException/captureMessage for explicit error reporting
        enableLogs: sentryConfig.environment === "development",
        // Capture unhandled promise rejections and console errors
        integrations: [
            Sentry.captureConsoleIntegration({
                levels: ["error", "warn"],
            }),
            Sentry.browserTracingIntegration({
                // Track navigation and page loads
                enableLongTask: true,
                enableInp: true,
            }),
            Sentry.replayIntegration(),
            // Context lines integration for better error context
            Sentry.contextLinesIntegration(),
        ],
        // Before sending events, add install ID and additional context
        beforeSend(event) {
            // Ensure install ID is in tags
            if (!event.tags) {
                event.tags = {};
            }
            event.tags.process = "renderer";

            // Add user agent for browser context
            if (!event.request) {
                event.request = {};
            }
            event.request.headers = {
                "User-Agent": navigator.userAgent,
            };

            return event;
        },
    });

    // Initialize the helper with the Sentry module
    initializeSentryHelper(Sentry);

    logInfo("[Sentry] Initialized in renderer process with tracing and logging");
    addBreadcrumb("Renderer process Sentry initialized", "init", "info");

    // Install ID will be set via IPC from main process after settings are loaded
} else {
    logInfo("[Sentry] Telemetry disabled - no DSN configured");
}

import { DEFAULT_TERMINAL_FONT, LOADING_SCREEN_FADE_DURATION } from "../constants";
import { handleCheckForUpdates, setupAutoUpdateListeners } from "./autoUpdateManagement";
import { initializeBrowserWindowModals } from "./browserWindowModals";
import { handleReauthentication, initializeAddConnectionModalBridge, loadSidebarConnections, openAddConnectionModal, updateFooterConnection } from "./connectionManagement";
import { initializeGlobalSearch } from "./globalSearchManagement";
import { loadHomepageData, setupHomepageActions } from "./homepageManagement";
import { loadMarketplace, loadToolsLibrary } from "./marketplaceManagement";
import { closeModal, openModal } from "./modalManagement";
import { showPPTBNotification } from "./notifications";
import { saveSidebarSettings } from "./settingsManagement";
import { switchSidebar } from "./sidebarManagement";
import { handleTerminalClosed, handleTerminalCommandCompleted, handleTerminalCreated, handleTerminalError, handleTerminalOutput, setupTerminalPanel } from "./terminalManagement";
import { applyDebugMenuVisibility, applyTerminalFont, applyTheme } from "./themeManagement";
import { closeAllTools, initializeTabScrollButtons, launchTool, restoreSession, setupKeyboardShortcuts, showHomePage } from "./toolManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

/**
 * Initialize the application
 * Sets up all event listeners, loads initial data, and restores session
 */
export async function initializeApplication(): Promise<void> {
    logCheckpoint("Renderer initialization started");

    try {
        // Get install ID from main process and set it in Sentry
        if (sentryConfig) {
            try {
                const settings = await window.toolboxAPI.getUserSettings();
                const installId = settings.installId || settings.machineId;
                if (installId) {
                    setSentryInstallId(installId);
                    logCheckpoint("Install ID set in renderer Sentry", { installId });
                }
            } catch (error) {
                // Use logWarn instead of console.warn for proper telemetry tracking
                logWarn("Failed to get install ID for Sentry", { error: error instanceof Error ? error.message : String(error) });
            }
        }

        initializeBrowserWindowModals();
        initializeAddConnectionModalBridge();
        addBreadcrumb("Modal bridges initialized", "init", "info");

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

        // Set up global search command palette
        initializeGlobalSearch();

        addBreadcrumb("UI components initialized", "init", "info");

        // Load and apply theme settings on startup
        await wrapAsyncOperation(
            "loadInitialSettings",
            async () => {
                await loadInitialSettings();
            },
            { tags: { phase: "initialization" } },
        );
        logCheckpoint("Initial settings loaded");

        // Load tools library from registry
        await wrapAsyncOperation(
            "loadToolsLibrary",
            async () => {
                await loadToolsLibrary();
            },
            { tags: { phase: "tools_library_loading" } },
        ).catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "tools_library_loading" },
                level: "warning",
            });
        });
        logCheckpoint("Tools library loaded");

        // Load initial sidebar content (tools by default)
        await wrapAsyncOperation(
            "loadSidebarTools",
            async () => {
                await loadSidebarTools();
            },
            { tags: { phase: "sidebar_loading" } },
        );

        await wrapAsyncOperation(
            "loadMarketplace",
            async () => {
                await loadMarketplace();
            },
            { tags: { phase: "marketplace_loading" } },
        );
        addBreadcrumb("Sidebar content loaded", "init", "info");

        // Load connections in sidebar immediately (was previously delayed until events)
        await wrapAsyncOperation(
            "loadSidebarConnections",
            async () => {
                await loadSidebarConnections();
            },
            { tags: { phase: "connections_loading" } },
        ).catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "connections_loading" },
                level: "warning",
            });
        });
        logCheckpoint("Connections loaded");

        // Update footer connection info
        // Update footer connection status
        // Note: Footer shows active tool's connection, not a global connection
        await wrapAsyncOperation(
            "updateFooterConnection",
            async () => {
                await updateFooterConnection();
            },
            { tags: { phase: "footer_update" } },
        );

        // Load homepage data
        await wrapAsyncOperation(
            "loadHomepageData",
            async () => {
                await loadHomepageData();
            },
            { tags: { phase: "homepage_loading" } },
        ).catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "homepage_loading" },
                level: "warning",
            });
        });
        logCheckpoint("Homepage data loaded");

        // Restore previous session
        await wrapAsyncOperation(
            "restoreSession",
            async () => {
                await restoreSession();
            },
            { tags: { phase: "session_restore" } },
        ).catch((error) => {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "session_restore" },
                level: "warning",
            });
        });
        logCheckpoint("Session restored");

        // Set up IPC listeners for authentication dialogs
        setupAuthenticationListeners();

        // Set up loading screen listeners
        setupLoadingScreenListeners();

        // Set up toolbox event listeners
        setupToolboxEventListeners();

        // Handle request for tool panel bounds (for BrowserView positioning)
        setupToolPanelBoundsListener();

        // Set up filter dropdown toggles for VSCode-style UI
        setupFilterDropdownToggles();

        // Set up terminal toggle button
        setupTerminalPanel();

        // Set up periodic token expiry checking for active tool connections
        setupTokenExpiryCheck();

        addBreadcrumb("All listeners set up", "init", "info");
        logCheckpoint("Renderer initialization completed successfully");
    } catch (error) {
        // If Sentry is available, capture the error
        if (sentryConfig) {
            const err = error instanceof Error ? error : new Error(String(error));
            captureException(err, {
                tags: { phase: "renderer_initialization" },
                level: "fatal",
            });
        }
        // Show error to user using a proper error modal
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

        // Create title
        const title = document.createElement("h3");
        title.style.cssText = "margin: 0 0 12px 0; font-size: 18px;";
        title.textContent = "Application Initialization Failed";

        // Create message paragraph
        const messagePara = document.createElement("p");
        messagePara.style.cssText = "margin: 0 0 16px 0;";
        messagePara.textContent = errorMessage;

        // Create reload button
        const reloadBtn = document.createElement("button");
        reloadBtn.id = "reload-btn";
        reloadBtn.style.cssText = `
            background: #ffffff;
            color: #d13438;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        reloadBtn.textContent = "Reload Application";
        reloadBtn.addEventListener("click", () => {
            window.location.reload();
        });

        errorElement.appendChild(title);
        errorElement.appendChild(messagePara);
        errorElement.appendChild(reloadBtn);
        document.body.appendChild(errorElement);
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
            openAddConnectionModal().catch((error) => {
                captureException(error instanceof Error ? error : new Error(String(error)), {
                    tags: { phase: "modal_opening" },
                    level: "error",
                });
            });
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

    // Sidebar check for updates button
    const sidebarCheckForUpdatesBtn = document.getElementById("sidebar-check-for-updates-btn");
    if (sidebarCheckForUpdatesBtn) {
        sidebarCheckForUpdatesBtn.addEventListener("click", async () => {
            try {
                await handleCheckForUpdates();
            } catch (error) {
                captureException(error instanceof Error ? error : new Error(String(error)), {
                    tags: { phase: "check_for_updates" },
                    level: "error",
                });
            }
        });
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
    // Terminal font selector
    const terminalFontSelect = document.getElementById("sidebar-terminal-font-select") as HTMLSelectElement | null;
    const customFontInput = document.getElementById("sidebar-terminal-font-custom") as HTMLInputElement;
    const customFontContainer = document.getElementById("custom-font-input-container");

    const toggleCustomFontVisibility = (): void => {
        if (!customFontContainer) {
            return;
        }

        const isCustomSelected = terminalFontSelect?.value === "custom";
        customFontContainer.style.display = isCustomSelected ? "block" : "none";

        if (isCustomSelected && customFontInput) {
            customFontInput.focus();
        }
    };

    if (terminalFontSelect) {
        terminalFontSelect.addEventListener("change", toggleCustomFontVisibility);
    }

    toggleCustomFontVisibility();
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

    // Troubleshooting modal listener
    window.api.on("open-troubleshooting-modal", async () => {
        const { openTroubleshootingModal } = await import("./troubleshootingManagement");
        const currentTheme = await window.toolboxAPI.utils.getCurrentTheme();
        const isDarkTheme = currentTheme === "dark";
        await openTroubleshootingModal(isDarkTheme);
    });

    // Tool update event listeners
    window.toolboxAPI.onToolUpdateStarted(() => {
        logInfo("Tool update started, reloading tools...");
        loadSidebarTools().catch((err) => {
            captureException(err instanceof Error ? err : new Error(String(err)), {
                tags: { phase: "tools_reload" },
                level: "warning",
            });
        });
    });

    window.toolboxAPI.onToolUpdateCompleted(() => {
        logInfo("Tool update completed, reloading tools...");
        loadSidebarTools().catch((err) => {
            captureException(err instanceof Error ? err : new Error(String(err)), {
                tags: { phase: "tools_reload" },
                level: "warning",
            });
        });
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
        logInfo("Token expired for connection:", data);

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
        logInfo("ToolBox Event:", { payload });

        if (payload.event === "menu:launch-tool") {
            const toolId = typeof payload.data?.toolId === "string" ? payload.data.toolId : null;
            if (toolId) {
                void launchTool(toolId, {
                    source: payload.data?.source,
                    primaryConnectionId: payload.data?.primaryConnectionId ?? null,
                    secondaryConnectionId: payload.data?.secondaryConnectionId ?? null,
                });
            } else {
                logWarn("Menu launch event missing toolId", { payload });
            }
            return;
        }

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
            logInfo("Connection event detected, reloading connections...");
            loadSidebarConnections().catch((err) => {
                captureException(err instanceof Error ? err : new Error(String(err)), {
                    tags: { phase: "connection_reload" },
                    level: "warning",
                });
            });
            // Update active tool connection status to reflect changes
            import("./toolManagement").then(({ updateActiveToolConnectionStatus }) => {
                updateActiveToolConnectionStatus().catch((err) => {
                    captureException(err instanceof Error ? err : new Error(String(err)), {
                        tags: { phase: "footer_update" },
                        level: "warning",
                    });
                });
            });
        }

        // Reload tools when tool events occur
        if (payload.event === "tool:loaded" || payload.event === "tool:unloaded") {
            logInfo("Tool event detected, reloading tools...");
            loadSidebarTools().catch((err) => {
                captureException(err instanceof Error ? err : new Error(String(err)), {
                    tags: { phase: "tools_reload" },
                    level: "warning",
                });
            });
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
            logInfo("[Renderer] Sending tool panel bounds:", bounds);
            window.api.send("get-tool-panel-bounds-response", bounds);
        } else {
            logWarn("[Renderer] Tool panel content element not found");
        }
    });
}

/**
 * Setup filter dropdown toggle buttons for VSCode-style UI
 */
function setupFilterDropdownToggles(): void {
    // Tools filter dropdown
    const toolsFilterBtn = document.getElementById("tools-filter-btn");
    const toolsFilterDropdown = document.getElementById("tools-filter-dropdown");

    if (toolsFilterBtn && toolsFilterDropdown) {
        toolsFilterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isVisible = toolsFilterDropdown.style.display === "block";
            // Close all other dropdowns
            document.querySelectorAll(".filter-dropdown").forEach((dropdown) => {
                (dropdown as HTMLElement).style.display = "none";
            });
            document.querySelectorAll(".search-filter-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            // Toggle current dropdown
            toolsFilterDropdown.style.display = isVisible ? "none" : "block";
            toolsFilterBtn.classList.toggle("active", !isVisible);
        });
    }

    // Connections filter dropdown
    const connectionsFilterBtn = document.getElementById("connections-filter-btn");
    const connectionsFilterDropdown = document.getElementById("connections-filter-dropdown");

    if (connectionsFilterBtn && connectionsFilterDropdown) {
        connectionsFilterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isVisible = connectionsFilterDropdown.style.display === "block";
            // Close all other dropdowns
            document.querySelectorAll(".filter-dropdown").forEach((dropdown) => {
                (dropdown as HTMLElement).style.display = "none";
            });
            document.querySelectorAll(".search-filter-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            // Toggle current dropdown
            connectionsFilterDropdown.style.display = isVisible ? "none" : "block";
            connectionsFilterBtn.classList.toggle("active", !isVisible);
        });
    }

    // Marketplace filter dropdown
    const marketplaceFilterBtn = document.getElementById("marketplace-filter-btn");
    const marketplaceFilterDropdown = document.getElementById("marketplace-filter-dropdown");

    if (marketplaceFilterBtn && marketplaceFilterDropdown) {
        marketplaceFilterBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const isVisible = marketplaceFilterDropdown.style.display === "block";
            // Close all other dropdowns
            document.querySelectorAll(".filter-dropdown").forEach((dropdown) => {
                (dropdown as HTMLElement).style.display = "none";
            });
            document.querySelectorAll(".search-filter-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
            // Toggle current dropdown
            marketplaceFilterDropdown.style.display = isVisible ? "none" : "block";
            marketplaceFilterBtn.classList.toggle("active", !isVisible);
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest(".filter-dropdown") && !target.closest(".search-filter-btn")) {
            document.querySelectorAll(".filter-dropdown").forEach((dropdown) => {
                (dropdown as HTMLElement).style.display = "none";
            });
            document.querySelectorAll(".search-filter-btn").forEach((btn) => {
                btn.classList.remove("active");
            });
        }
    });

    // Prevent dropdown from closing when clicking inside
    document.querySelectorAll(".filter-dropdown").forEach((dropdown) => {
        dropdown.addEventListener("click", (e) => {
            e.stopPropagation();
        });
    });
}

// Store the interval ID for potential cleanup
// Note: This interval runs for the lifetime of the application, so cleanup is not currently needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let tokenExpiryCheckInterval: NodeJS.Timeout | null = null;

/**
 * Set up periodic token expiry checking for active tool connections
 * Checks every minute if the active tool's connection token has expired
 */
function setupTokenExpiryCheck(): void {
    // Check immediately on setup
    void checkActiveToolTokenExpiry();

    // Then check every 60 seconds
    // Note: This interval runs for the lifetime of the application
    tokenExpiryCheckInterval = setInterval(() => {
        void checkActiveToolTokenExpiry();
    }, 60000); // Check every minute
}

/**
 * Check if the active tool's connection token has expired and update the footer
 */
async function checkActiveToolTokenExpiry(): Promise<void> {
    try {
        // Import updateActiveToolConnectionStatus to refresh the footer status
        const { updateActiveToolConnectionStatus } = await import("./toolManagement");
        await updateActiveToolConnectionStatus();
    } catch (error) {
        // Silently fail - this is a background check
        logInfo("Token expiry check failed:", { error });
    }
}
