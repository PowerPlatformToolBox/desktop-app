import { defaultClient, DistributedTracingModes, setup, start, TelemetryClient } from "applicationinsights";
import { randomUUID } from "crypto";
import { app } from "electron";
import { MachineIdManager } from "./machineIdManager";

export enum TelemetryEvent {
    // Application lifecycle
    APP_STARTED = "app_started",
    APP_READY = "app_ready",
    APP_QUIT = "app_quit",

    // Tool operations
    TOOL_INSTALLED = "tool_installed",
    TOOL_UNINSTALLED = "tool_uninstalled",
    TOOL_LOADED = "tool_loaded",
    TOOL_UNLOADED = "tool_unloaded",
    TOOL_LAUNCHED = "tool_launched",
    TOOL_CLOSED = "tool_closed",
    TOOL_ERROR = "tool_error",

    // Connection operations
    CONNECTION_CREATED = "connection_created",
    CONNECTION_UPDATED = "connection_updated",
    CONNECTION_DELETED = "connection_deleted",
    CONNECTION_AUTHENTICATED = "connection_authenticated",
    CONNECTION_TEST_SUCCESS = "connection_test_success",
    CONNECTION_TEST_FAILED = "connection_test_failed",
    TOKEN_REFRESHED = "token_refreshed",
    TOKEN_REFRESH_FAILED = "token_refresh_failed",

    // Settings operations
    SETTINGS_UPDATED = "settings_updated",
    THEME_CHANGED = "theme_changed",

    // Update operations
    UPDATE_AVAILABLE = "update_available",
    UPDATE_DOWNLOADED = "update_downloaded",
    UPDATE_INSTALLED = "update_installed",
    UPDATE_ERROR = "update_error",

    // Error tracking
    UNHANDLED_ERROR = "unhandled_error",
    UNHANDLED_REJECTION = "unhandled_rejection",

    // Terminal operations
    TERMINAL_CREATED = "terminal_created",
    TERMINAL_CLOSED = "terminal_closed",

    // Dataverse operations
    DATAVERSE_REQUEST = "dataverse_request",
    DATAVERSE_ERROR = "dataverse_error",
}

export enum LogLevel {
    VERBOSE = "verbose",
    INFO = "info",
    WARNING = "warning",
    ERROR = "error",
    CRITICAL = "critical",
}

export interface TelemetryProperties {
    [key: string]: string | number | boolean | undefined;
}

export interface TelemetryMetrics {
    [key: string]: number;
}

/**
 * TelemetryManager handles all Application Insights telemetry
 * Tracks events, metrics, logs, and exceptions for application monitoring
 */
export class TelemetryManager {
    private client: TelemetryClient | null = null;
    private machineIdManager: MachineIdManager;
    private isEnabled: boolean = false;
    private appVersion: string;
    private sessionId: string;

    constructor(machineIdManager: MachineIdManager, connectionString?: string) {
        this.machineIdManager = machineIdManager;
        this.appVersion = app.getVersion();
        this.sessionId = this.generateSessionId();

        // Initialize Application Insights if connection string is provided
        if (connectionString && connectionString.trim() !== "") {
            this.initialize(connectionString);
        } else {
            console.log("[Telemetry] Application Insights connection string not provided. Telemetry disabled.");
        }
    }

    /**
     * Initialize Application Insights
     */
    private initialize(connectionString: string): void {
        try {
            // Ensure this runs before any AppInsights code
            if (typeof globalThis.crypto === "undefined") {
                const nodeCrypto = require("node:crypto");
                globalThis.crypto = nodeCrypto.webcrypto || nodeCrypto;
            }

            setup(connectionString)
                .setAutoCollectRequests(false) // Disable auto HTTP request tracking
                .setAutoCollectPerformance(true, true) // Enable performance tracking with extended metrics
                .setAutoCollectExceptions(true) // Enable exception tracking
                .setAutoCollectDependencies(true) // Enable dependency tracking
                .setAutoCollectConsole(false) // Don't auto-collect console logs
                .setUseDiskRetryCaching(true) // Cache telemetry to disk if network fails
                .setSendLiveMetrics(false) // Disable live metrics for privacy
                .setDistributedTracingMode(DistributedTracingModes.AI_AND_W3C); // Enable distributed tracing

            start();

            this.client = defaultClient;

            // Set common properties for all telemetry
            this.client.commonProperties = {
                appVersion: this.appVersion,
                sessionId: this.sessionId,
                machineId: this.machineIdManager.getMachineId(),
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                electronVersion: process.versions.electron || "unknown",
            };

            // Set up global error handlers
            this.setupErrorHandlers();

            this.isEnabled = true;
            console.log("[Telemetry] Application Insights initialized successfully");
        } catch (error) {
            console.error("[Telemetry] Failed to initialize Application Insights:", error);
            this.isEnabled = false;
        }
    }

    /**
     * Set up global error handlers to capture unhandled errors
     */
    private setupErrorHandlers(): void {
        // Catch uncaught exceptions
        process.on("uncaughtException", (error: Error) => {
            this.trackException(error, {
                event: TelemetryEvent.UNHANDLED_ERROR,
                handled: false,
            });
            console.error("[Telemetry] Uncaught exception:", error);
        });

        // Catch unhandled promise rejections
        process.on("unhandledRejection", (reason: unknown) => {
            const error = reason instanceof Error ? reason : new Error(String(reason));
            this.trackException(error, {
                event: TelemetryEvent.UNHANDLED_REJECTION,
                handled: false,
            });
            console.error("[Telemetry] Unhandled rejection:", reason);
        });
    }

    /**
     * Generate a unique session ID for this app session
     */
    private generateSessionId(): string {
        return `${Date.now()}-${randomUUID()}`;
    }

    /**
     * Sanitize properties to convert all values to strings
     */
    private sanitizeProperties(properties?: TelemetryProperties): { [key: string]: string } {
        const sanitized: { [key: string]: string } = {};
        if (properties) {
            Object.entries(properties).forEach(([key, value]) => {
                if (value !== undefined) {
                    sanitized[key] = String(value);
                }
            });
        }
        return sanitized;
    }

    /**
     * Track a custom event
     */
    trackEvent(eventName: TelemetryEvent | string, properties?: TelemetryProperties, metrics?: TelemetryMetrics): void {
        if (!this.isEnabled || !this.client) {
            return;
        }

        try {
            this.client.trackEvent({
                name: eventName,
                properties: this.sanitizeProperties(properties),
                measurements: metrics,
            });
        } catch (error) {
            console.error("[Telemetry] Failed to track event:", error);
        }
    }

    /**
     * Track an exception/error
     */
    trackException(error: Error, properties?: TelemetryProperties): void {
        if (!this.isEnabled || !this.client) {
            return;
        }

        try {
            this.client.trackException({
                exception: error,
                properties: this.sanitizeProperties(properties),
            });
        } catch (err) {
            console.error("[Telemetry] Failed to track exception:", err);
        }
    }

    /**
     * Track a log message with severity
     */
    trackTrace(message: string, level: LogLevel = LogLevel.INFO, properties?: TelemetryProperties): void {
        if (!this.isEnabled || !this.client) {
            return;
        }

        try {
            // Map our log levels to Application Insights severity levels (using string literals)
            const severityMap: { [key: string]: string } = {
                [LogLevel.VERBOSE]: "Verbose",
                [LogLevel.INFO]: "Information",
                [LogLevel.WARNING]: "Warning",
                [LogLevel.ERROR]: "Error",
                [LogLevel.CRITICAL]: "Critical",
            };

            this.client.trackTrace({
                message,
                severity: severityMap[level] as any, // Cast to any since the type definition expects specific values
                properties: this.sanitizeProperties(properties),
            });
        } catch (error) {
            console.error("[Telemetry] Failed to track trace:", error);
        }
    }

    /**
     * Track a custom metric
     */
    trackMetric(name: string, value: number, properties?: TelemetryProperties): void {
        if (!this.isEnabled || !this.client) {
            return;
        }

        try {
            this.client.trackMetric({
                name,
                value,
                properties: this.sanitizeProperties(properties),
            });
        } catch (error) {
            console.error("[Telemetry] Failed to track metric:", error);
        }
    }

    /**
     * Track application start
     */
    trackAppStart(): void {
        this.trackEvent(TelemetryEvent.APP_STARTED, {
            version: this.appVersion,
            platform: process.platform,
            arch: process.arch,
        });
    }

    /**
     * Track application ready
     */
    trackAppReady(): void {
        this.trackEvent(TelemetryEvent.APP_READY, {
            version: this.appVersion,
        });
    }

    /**
     * Track application quit
     */
    trackAppQuit(): void {
        this.trackEvent(TelemetryEvent.APP_QUIT, {
            version: this.appVersion,
        });
        this.flush();
    }

    /**
     * Flush all pending telemetry (useful before app shutdown)
     */
    flush(): void {
        if (!this.isEnabled || !this.client) {
            return;
        }

        try {
            this.client.flush();
        } catch (error) {
            console.error("[Telemetry] Failed to flush telemetry:", error);
        }
    }

    /**
     * Check if telemetry is enabled
     */
    isActive(): boolean {
        return this.isEnabled;
    }

    /**
     * Get the current session ID
     */
    getSessionId(): string {
        return this.sessionId;
    }
}
