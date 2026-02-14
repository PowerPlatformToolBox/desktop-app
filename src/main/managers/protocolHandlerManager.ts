import { app } from "electron";
import { captureException, captureMessage, logInfo } from "../../common/sentryHelper";

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

    constructor() {
        logInfo("[ProtocolHandler] Initializing protocol handler manager");
    }

    /**
     * Register the protocol as a standard protocol scheme
     * Must be called BEFORE app.whenReady()
     */
    registerScheme(): void {
        try {
            if (app.isReady()) {
                captureMessage("[ProtocolHandler] Warning: registerScheme called after app is ready. This may not work correctly.", "warning");
            }

            // Register the scheme as standard to allow query parameters
            app.setAsDefaultProtocolClient(ProtocolHandlerManager.PROTOCOL_SCHEME);

            logInfo(`[ProtocolHandler] Registered ${ProtocolHandlerManager.PROTOCOL_SCHEME}:// as default protocol client`);
        } catch (error) {
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: { manager: "ProtocolHandler", phase: "register_scheme" },
                level: "error",
            });
        }
    }

    /**
     * Set up protocol handling after app is ready
     * Handles deep links when app is launched or when already running
     */
    setupProtocolHandler(callback: ProtocolHandlerCallback): void {
        this.protocolCallback = callback;

        // Handle protocol URL when app is launched via protocol (macOS)
        app.on("open-url", (event, url) => {
            event.preventDefault();
            logInfo(`[ProtocolHandler] Received open-url event: ${url}`);
            this.handleProtocolUrl(url).catch((error) => {
                captureException(error instanceof Error ? error : new Error(String(error)), {
                    tags: { manager: "ProtocolHandler", trigger: "open-url" },
                });
            });
        });

        // Handle protocol URL when app is already running (Windows/Linux second-instance)
        const gotTheLock = app.requestSingleInstanceLock();

        if (!gotTheLock) {
            logInfo("[ProtocolHandler] Another instance is already running, quitting this instance");
            app.quit();
            return;
        }

        app.on("second-instance", (event, commandLine) => {
            logInfo("[ProtocolHandler] Second instance detected, processing command line");

            // Protocol URL is in the command line arguments (Windows/Linux)
            const url = commandLine.find((arg) => arg.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`));

            if (url) {
                logInfo(`[ProtocolHandler] Processing protocol URL from second instance: ${url}`);
                this.handleProtocolUrl(url).catch((error) => {
                    captureException(error instanceof Error ? error : new Error(String(error)), {
                        tags: { manager: "ProtocolHandler", trigger: "second-instance" },
                    });
                });
            }
        });

        // Handle protocol URL in command line args at startup (Windows/Linux first launch)
        if (process.platform === "win32" || process.platform === "linux") {
            const protocolUrl = process.argv.find((arg) => arg.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`));

            if (protocolUrl) {
                logInfo(`[ProtocolHandler] Processing protocol URL from startup: ${protocolUrl}`);
                // Delay slightly to ensure app is fully initialized
                setTimeout(() => {
                    this.handleProtocolUrl(protocolUrl).catch((error) => {
                        captureException(error instanceof Error ? error : new Error(String(error)), {
                            tags: { manager: "ProtocolHandler", trigger: "startup" },
                        });
                    });
                }, 1000);
            }
        }

        logInfo("[ProtocolHandler] Protocol handler setup completed");
    }

    /**
     * Parse and validate protocol URL
     * Format: pptb://install?toolId={toolId}&toolName={toolName}
     */
    private parseProtocolUrl(urlString: string): { action: ProtocolAction; params: ToolInstallProtocolParams } | null {
        try {
            // Validate protocol scheme
            if (!urlString.startsWith(`${ProtocolHandlerManager.PROTOCOL_SCHEME}://`)) {
                captureMessage(`[ProtocolHandler] Invalid protocol scheme: ${urlString}`, "warning");
                return null;
            }

            const url = new URL(urlString);

            // Validate action (host part of URL)
            const action = url.hostname.toLowerCase();
            if (!ProtocolHandlerManager.ALLOWED_ACTIONS.includes(action as ProtocolAction)) {
                captureMessage(`[ProtocolHandler] Invalid action: ${action}`, "warning", {
                    extra: { allowed: ProtocolHandlerManager.ALLOWED_ACTIONS },
                });
                return null;
            }

            // Extract and decode parameters
            const toolId = url.searchParams.get("toolId");
            const toolName = url.searchParams.get("toolName");

            // Validate required parameters
            if (!toolId) {
                captureMessage("[ProtocolHandler] Missing required parameter: toolId", "warning");
                return null;
            }

            // Sanitize and validate toolId
            const sanitizedToolId = this.sanitizeToolId(toolId);
            if (!sanitizedToolId) {
                captureMessage(`[ProtocolHandler] Invalid toolId format: ${toolId}`, "warning");
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
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: { manager: "ProtocolHandler", phase: "parse_url" },
                extra: { url: urlString },
            });
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
     * Sanitize and validate toolName
     */
    private sanitizeToolName(toolName: string): string {
        if (!toolName || typeof toolName !== "string") {
            return "";
        }

        // Decode URL encoding
        let decoded = toolName;
        try {
            decoded = decodeURIComponent(toolName);
        } catch (error) {
            // If decode fails, use original
            captureMessage("[ProtocolHandler] Failed to decode toolName", "warning", { extra: { toolName } });
        }

        // Trim and limit length
        const trimmed = decoded.trim();
        return trimmed.substring(0, ProtocolHandlerManager.MAX_TOOL_NAME_LENGTH);
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
            captureMessage("[ProtocolHandler] Rate limit exceeded", "warning", {
                extra: {
                    requestCount: this.recentProtocolRequests.length,
                    window: ProtocolHandlerManager.RATE_LIMIT_WINDOW_MS,
                },
            });
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
            captureMessage("[ProtocolHandler] Protocol request blocked due to rate limiting", "warning");
            return;
        }

        // Parse and validate URL
        const parsed = this.parseProtocolUrl(urlString);
        if (!parsed) {
            captureMessage("[ProtocolHandler] Failed to parse or validate protocol URL", "warning", {
                extra: { url: urlString },
            });
            return;
        }

        // Invoke callback if registered
        if (!this.protocolCallback) {
            captureMessage("[ProtocolHandler] No protocol callback registered", "warning");
            return;
        }

        try {
            await this.protocolCallback(parsed.action, parsed.params);
            logInfo(`[ProtocolHandler] Protocol action completed: ${parsed.action} for tool ${parsed.params.toolId}`);
        } catch (error) {
            captureException(error instanceof Error ? error : new Error(String(error)), {
                tags: { manager: "ProtocolHandler", phase: "handle_callback" },
                extra: {
                    action: parsed.action,
                    toolId: parsed.params.toolId,
                },
            });
        }
    }
}
