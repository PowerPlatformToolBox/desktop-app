import { app } from "electron";
import { logError, logInfo, logWarn } from "../../common/logger";

/**
 * Protocol URL structure for tool installation
 */
interface ToolInstallProtocolParams {
    toolId: string;
    toolName: string;
}

/**
 * Protocol handler action types
 */
export type ProtocolAction = "install";

/**
 * Protocol handler callback function
 */
type ProtocolHandlerCallback = (action: ProtocolAction, params: ToolInstallProtocolParams) => Promise<void>;

/**
 * ProtocolHandlerManager
 * Manages the custom pptb:// protocol for deep linking from web apps
 *
 * **Security Features**:
 * - Validates protocol action (only "install" allowed)
 * - Sanitizes and validates toolId (alphanumeric, hyphens, underscores only)
 * - Decodes URL-encoded parameters
 * - Rate limiting to prevent protocol spam/DOS
 * - Blocks malformed or suspicious URLs
 *
 * **URL Format**: pptb://install?toolId={toolId}&toolName={toolName}
 *
 * Example:
 * pptb://install?toolId=dataverse-explorer&toolName=Dataverse%20Explorer
 */
export class ProtocolHandlerManager {
    private static readonly PROTOCOL_SCHEME = "pptb";
    private static readonly ALLOWED_ACTIONS: ProtocolAction[] = ["install"];
    private static readonly TOOL_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
    private static readonly MAX_TOOL_ID_LENGTH = 100;
    private static readonly MAX_TOOL_NAME_LENGTH = 200;
    private static readonly RATE_LIMIT_WINDOW_MS = 5000; // 5 seconds
    private static readonly MAX_REQUESTS_PER_WINDOW = 3;

    private protocolCallback: ProtocolHandlerCallback | null = null;
    private recentProtocolRequests: number[] = [];
    private pendingUrls: string[] = [];

    private readonly protocolEnabled: boolean;

    constructor() {
        this.protocolEnabled = this.computeProtocolEnabled();
        logInfo("[ProtocolHandler] Initializing protocol handler manager");
    }

    private computeProtocolEnabled(): boolean {
        const rawOverride = process.env.PPTB_ENABLE_PROTOCOL?.trim();
        if (rawOverride !== undefined) {
            const normalized = rawOverride.toLowerCase();
            return normalized === "1" || normalized === "true" || normalized === "yes";
        }

        // Default behavior: only register/handle the OS-level pptb:// protocol when packaged.
        // This prevents local development runs from hijacking/claiming the protocol handler.
        return app.isPackaged;
    }

    /**
     * Register the protocol as a standard protocol scheme
     * Must be called BEFORE app.whenReady()
     */
    registerScheme(): void {
        try {
            if (app.isReady()) {
                logWarn("[ProtocolHandler] Warning: registerScheme called after app is ready. This may not work correctly.");
            }

            if (!this.protocolEnabled) {
                logInfo("[ProtocolHandler] Skipping pptb:// protocol registration (local/dev run)");
                return;
            }

            // Register the scheme as standard to allow query parameters
            app.setAsDefaultProtocolClient(ProtocolHandlerManager.PROTOCOL_SCHEME);

            logInfo(`[ProtocolHandler] Registered ${ProtocolHandlerManager.PROTOCOL_SCHEME}:// as default protocol client`);
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Initialize early protocol listeners - must be called BEFORE app.whenReady().
     * Acquires the single-instance lock, registers the open-url and second-instance
     * event handlers, and buffers any startup protocol URL from process.argv so that
     * no deep link is lost before the main window exists.
     */
    initialize(): void {
        // If the protocol is disabled (e.g. local/dev run), we skip all protocol-related setup to avoid any risk of
        // accidentally hijacking the protocol handler on a developer's machine.
        if (!this.protocolEnabled) {
            logInfo("[ProtocolHandler] pptb:// protocol disabled for local/dev run; skipping protocol event listeners");
            return;
        }

        // Acquire the single-instance lock as early as possible so a second launch
        // forwards its command line to the first instance and then quits.
        const gotTheLock = app.requestSingleInstanceLock();
        if (!gotTheLock) {
            logInfo("[ProtocolHandler] Another instance is already running, quitting this instance");
            app.quit();
            return;
        }

        // macOS: open-url is emitted before (or around) app.whenReady() – must be
        // registered here so we never miss a launch-via-protocol event.
        app.on("open-url", (event, url) => {
            event.preventDefault();
            logInfo(`[ProtocolHandler] Received open-url event: ${url}`);
            this.bufferOrHandle(url);
        });

        // Windows/Linux: a second instance forwards its command line here.
        app.on("second-instance", (_event, commandLine) => {
            logInfo("[ProtocolHandler] Second instance detected, processing command line");
            const url = commandLine.find((arg) => arg.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`));
            if (url) {
                logInfo(`[ProtocolHandler] Processing protocol URL from second instance: ${url}`);
                this.bufferOrHandle(url);
            }
        });

        // Windows/Linux first launch via protocol URL: the URL is in process.argv.
        if (process.platform === "win32" || process.platform === "linux") {
            const protocolUrl = process.argv.find((arg) => arg.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`));
            if (protocolUrl) {
                logInfo(`[ProtocolHandler] Buffering protocol URL from startup args: ${protocolUrl}`);
                this.pendingUrls.push(protocolUrl);
            }
        }

        logInfo("[ProtocolHandler] Early protocol listeners registered");
    }

    /**
     * Register the protocol handler callback and flush any URLs that were buffered
     * before the callback was available.  Must be called AFTER the main window has
     * been created so that the callback can safely deliver IPC to the renderer.
     */
    setupProtocolHandler(callback: ProtocolHandlerCallback): void {
        if (!this.protocolEnabled) {
            logInfo("[ProtocolHandler] pptb:// protocol disabled; ignoring protocol handler setup");
            return;
        }

        this.protocolCallback = callback;

        // Process any URLs received before the callback was registered.
        const buffered = this.pendingUrls.splice(0);
        for (const url of buffered) {
            logInfo(`[ProtocolHandler] Processing buffered protocol URL: ${url}`);
            this.handleProtocolUrl(url).catch((error) => {
                logError(error instanceof Error ? error : new Error(String(error)));
            });
        }

        logInfo("[ProtocolHandler] Protocol handler callback registered");
    }

    /**
     * Buffer the URL for later processing, or handle it immediately if the
     * callback has already been registered.
     */
    private bufferOrHandle(url: string): void {
        if (this.protocolCallback) {
            this.handleProtocolUrl(url).catch((error) => {
                logError(error instanceof Error ? error : new Error(String(error)));
            });
        } else {
            this.pendingUrls.push(url);
        }
    }

    /**
     * Parse and validate protocol URL
     * Format: pptb://install?toolId={toolId}&toolName={toolName}
     */
    private parseProtocolUrl(urlString: string): { action: ProtocolAction; params: ToolInstallProtocolParams } | null {
        try {
            // Validate protocol scheme
            if (!urlString.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`)) {
                logWarn(`[ProtocolHandler] Invalid protocol scheme: ${urlString}`);
                return null;
            }

            const url = new URL(urlString);

            // Validate action (host part of URL)
            const action = url.hostname.toLowerCase();
            if (!ProtocolHandlerManager.ALLOWED_ACTIONS.includes(action as ProtocolAction)) {
                logWarn(`[ProtocolHandler] Invalid action: ${action}`);
                return null;
            }

            // Extract and decode parameters
            const toolId = url.searchParams.get("toolId");
            const toolName = url.searchParams.get("toolName");

            // Validate required parameters
            if (!toolId) {
                logWarn("[ProtocolHandler] Missing required parameter: toolId");
                return null;
            }

            // Sanitize and validate toolId
            const sanitizedToolId = this.sanitizeToolId(toolId);
            if (!sanitizedToolId) {
                logWarn(`[ProtocolHandler] Invalid toolId format: ${toolId}`);
                return null;
            }

            // Sanitize toolName (optional, will be fetched from registry if missing)
            const sanitizedToolName = toolName ? this.sanitizeToolName(toolName) : sanitizedToolId;

            return {
                action: action as ProtocolAction,
                params: {
                    toolId: sanitizedToolId,
                    toolName: sanitizedToolName,
                },
            };
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
            return null;
        }
    }

    /**
     * Sanitize and validate toolId
     * Only allows alphanumeric characters, hyphens, and underscores
     */
    private sanitizeToolId(toolId: string): string | null {
        if (!toolId || typeof toolId !== "string") {
            return null;
        }

        const trimmed = toolId.trim();

        // Check length
        if (trimmed.length === 0 || trimmed.length > ProtocolHandlerManager.MAX_TOOL_ID_LENGTH) {
            return null;
        }

        // Validate against regex (only alphanumeric, hyphens, underscores)
        if (!ProtocolHandlerManager.TOOL_ID_REGEX.test(trimmed)) {
            return null;
        }

        return trimmed;
    }

    /**
     * Sanitize and validate toolName (expects an already-decoded value)
     */
    private sanitizeToolName(toolName: string): string {
        if (!toolName || typeof toolName !== "string") {
            return "";
        }

        // Trim and limit length before escaping
        const trimmed = toolName.trim().substring(0, ProtocolHandlerManager.MAX_TOOL_NAME_LENGTH);

        // HTML-encode special characters to prevent HTML/JS injection when rendered in notification HTML
        const escaped = trimmed.replace(/[&<>"']/g, (char) => {
            switch (char) {
                case "&":
                    return "&amp;";
                case "<":
                    return "&lt;";
                case ">":
                    return "&gt;";
                case '"':
                    return "&quot;";
                case "'":
                    return "&#39;";
                default:
                    return char;
            }
        });

        return escaped;
    }

    /**
     * Rate limiting check to prevent protocol spam/DOS
     */
    private checkRateLimit(): boolean {
        const now = Date.now();

        // Remove old requests outside the window
        this.recentProtocolRequests = this.recentProtocolRequests.filter((timestamp) => now - timestamp < ProtocolHandlerManager.RATE_LIMIT_WINDOW_MS);

        // Check if rate limit exceeded
        if (this.recentProtocolRequests.length >= ProtocolHandlerManager.MAX_REQUESTS_PER_WINDOW) {
            logWarn("[ProtocolHandler] Rate limit exceeded");
            return false;
        }

        // Add current request
        this.recentProtocolRequests.push(now);
        return true;
    }

    /**
     * Handle protocol URL and invoke callback
     */
    private async handleProtocolUrl(urlString: string): Promise<void> {
        logInfo(`[ProtocolHandler] Handling protocol URL: ${urlString}`);

        // Check rate limit
        if (!this.checkRateLimit()) {
            logWarn("[ProtocolHandler] Protocol request blocked due to rate limiting");
            return;
        }

        // Parse and validate URL
        const parsed = this.parseProtocolUrl(urlString);
        if (!parsed) {
            logWarn("[ProtocolHandler] Failed to parse or validate protocol URL");
            return;
        }

        // Invoke callback if registered
        if (!this.protocolCallback) {
            logWarn("[ProtocolHandler] No protocol callback registered");
            return;
        }

        try {
            await this.protocolCallback(parsed.action, parsed.params);
            logInfo(`[ProtocolHandler] Protocol action completed: ${parsed.action} for tool ${parsed.params.toolId}`);
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
