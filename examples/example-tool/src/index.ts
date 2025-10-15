/// <reference types="../types" />

/**
 * PowerPlatform Example Tool - Main Entry Point
 *
 * This tool demonstrates the HTML-first architecture with TypeScript.
 * It accesses the ToolBox API via window.toolboxAPI and displays
 * connection information, handles events, and performs actions.
 */

// Type the toolbox API
const toolbox = window.toolboxAPI;

// State management
let eventCount = 0;

/**
 * Initialize the tool when DOM is ready
 */
document.addEventListener("DOMContentLoaded", async () => {
    console.log("Example Tool Initialized");

    // Display connection context
    await displayConnectionContext();

    // Setup event listeners for UI interactions
    setupUIEventListeners();

    // Subscribe to ToolBox events
    subscribeToToolBoxEvents();

    // Log tool startup
    logEvent("Tool started successfully");
});

/**
 * Display connection context from TOOLBOX_CONTEXT or getToolContext
 */
async function displayConnectionContext(): Promise<void> {
    try {
        // First, try to get context from injected window.TOOLBOX_CONTEXT
        let context = window.TOOLBOX_CONTEXT;

        // If not available, fetch it via API
        if (!context) {
            context = await toolbox.getToolContext();
        }

        // Update UI
        updateElement("tool-id", context.toolId || "Not set");
        updateElement("connection-url", context.connectionUrl || "Not set");
        updateElement("access-token", context.accessToken ? "***" + context.accessToken.slice(-10) : "Not set");

        logEvent("Connection context loaded", context);
    } catch (error) {
        console.error("Failed to load connection context:", error);
        logEvent("Error loading connection context", error);
    }
}

/**
 * Setup UI event listeners
 */
function setupUIEventListeners(): void {
    // Show Notification button
    document.getElementById("btn-show-notification")?.addEventListener("click", async () => {
        try {
            await toolbox.showNotification({
                title: "Hello from Example Tool!",
                body: "This is a notification from the example tool",
                type: "success",
                duration: 5000,
            });
            logEvent("Notification shown");
        } catch (error) {
            logEvent("Error showing notification", error);
        }
    });

    // Get Connections button
    document.getElementById("btn-get-connections")?.addEventListener("click", async () => {
        try {
            const connections = await toolbox.getConnections();
            displayOutput("Connections", connections);
            logEvent(`Retrieved ${connections.length} connections`);
        } catch (error) {
            logEvent("Error getting connections", error);
        }
    });

    // Copy Connection URL button
    document.getElementById("btn-copy-url")?.addEventListener("click", async () => {
        try {
            const context = await toolbox.getToolContext();
            if (context.connectionUrl) {
                await toolbox.copyToClipboard(context.connectionUrl);
                logEvent("Connection URL copied to clipboard");
            } else {
                logEvent("No connection URL available");
            }
        } catch (error) {
            logEvent("Error copying URL", error);
        }
    });

    // List All Tools button
    document.getElementById("btn-get-tools")?.addEventListener("click", async () => {
        try {
            const tools = await toolbox.getAllTools();
            displayOutput("Installed Tools", tools);
            logEvent(`Retrieved ${tools.length} tools`);
        } catch (error) {
            logEvent("Error getting tools", error);
        }
    });

    // Clear Log button
    document.getElementById("btn-clear-log")?.addEventListener("click", () => {
        const eventLog = document.getElementById("event-log");
        if (eventLog) {
            eventLog.innerHTML = "";
            eventCount = 0;
        }
    });
}

/**
 * Subscribe to ToolBox events
 */
function subscribeToToolBoxEvents(): void {
    toolbox.onToolboxEvent((event, payload) => {
        logEvent(`ToolBox Event: ${payload.event}`, payload.data);
    });

    logEvent("Subscribed to ToolBox events");
}

/**
 * Update an element's text content with animation
 */
function updateElement(id: string, value: string): void {
    const element = document.getElementById(id);
    if (element) {
        element.textContent = value;
        element.classList.add("status-updated");
        setTimeout(() => element.classList.remove("status-updated"), 500);
    }
}

/**
 * Display output in the output panel
 */
function displayOutput(title: string, data: any): void {
    const output = document.getElementById("output");
    if (output) {
        output.textContent = `=== ${title} ===\n\n${JSON.stringify(data, null, 2)}`;
    }
}

/**
 * Log an event to the event log panel
 */
function logEvent(message: string, data?: any): void {
    const eventLog = document.getElementById("event-log");
    if (!eventLog) return;

    eventCount++;
    const time = new Date().toLocaleTimeString();

    const entry = document.createElement("div");
    entry.className = "event-entry";
    entry.innerHTML = `
        <span class="event-time">[${time}]</span>
        <span class="event-type">#${eventCount}</span>
        <span>${message}</span>
    `;

    eventLog.appendChild(entry);
    eventLog.scrollTop = eventLog.scrollHeight;

    // Also log to console
    if (data) {
        console.log(`[${time}] ${message}`, data);
    } else {
        console.log(`[${time}] ${message}`);
    }
}

// Export for debugging
(window as any).exampleTool = {
    displayConnectionContext,
    logEvent,
    displayOutput,
};
