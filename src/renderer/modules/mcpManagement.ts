import reconnectIcon from "@fluentui/svg-icons/icons/arrow_sync_20_regular.svg?raw";
import connectIcon from "@fluentui/svg-icons/icons/plug_connected_20_regular.svg?raw";
import disconnectIcon from "@fluentui/svg-icons/icons/plug_disconnected_20_regular.svg?raw";
import { logError } from "../../common/logger";
import { McpClientConfigStatus, ToolBoxEvent } from "../../common/types";
import {
    hideMcpInvocationDetailsModal,
    initializeMcpInvocationDetailsModalController,
    isMcpInvocationDetailsModalOpen,
    setMcpInvocationDetailsModalContent,
    showMcpInvocationDetailsModal,
} from "../modals/mcpInvocationDetails/controller";
import { getMcpInvocationDetailsContent, getMcpInvocationDetailsModalView } from "../modals/mcpInvocationDetails/view";
import { getMcpClientPresentation, MCP_CLIENTS } from "./mcpClients";
import { openLocalPageAsTab, registerCloseGuard } from "./toolManagement";

const MCP_REFRESH_INTERVAL_MS = 2000;

let mcpRefreshTimer: number | null = null;
let mcpLiveUpdatesBound = false;
let activeDetailsCorrelationId: string | null = null;

/**
 * Render the MCP server content into a panel
 */
export function renderMCPServerContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="mcp-tab">
            <div class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">MCP Server</h2>
                <p class="mcp-subheader">Server connection details and invocation history for MCP-triggered tool launches.</p>

                <div class="settings-vscode-item mcp-settings-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Server Status</span>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <span id="mcp-server-status" style="font-weight: 600;"></span>
                    </div>
                </div>

                <div class="settings-vscode-item mcp-settings-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Server Control</span>
                        <p class="settings-vscode-item-description">Start or stop the local MCP server.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-server-actions-row">
                            <button id="mcp-server-toggle-btn" class="fluent-button fluent-button-primary settings-vscode-btn">Start MCP Server</button>
                            <span id="mcp-server-action-status" class="settings-vscode-item-description mcp-server-action-status"></span>
                        </div>
                    </div>
                </div>

                <div class="settings-vscode-item mcp-settings-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Startup Behavior</span>
                        <p class="settings-vscode-item-description">Automatically keep MCP available by restarting it when tools are opened or reopened.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <label class="settings-vscode-checkbox-label">
                            <input type="checkbox" id="mcp-keep-running-checkbox" class="settings-vscode-checkbox" />
                            Keep MCP Server Running
                        </label>
                        <span id="mcp-keep-running-status" class="settings-vscode-item-description mcp-server-action-status"></span>
                    </div>
                </div>

                <div class="settings-vscode-item mcp-settings-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Server Address</span>
                        <p class="settings-vscode-item-description">Use this HTTP endpoint when configuring your MCP client.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-server-control-row">
                            <input type="text" id="mcp-server-address" class="fluent-input settings-vscode-input mcp-server-value-input" readonly />
                            <button id="copy-mcp-server-address-btn" class="sidebar-icon-btn mcp-copy-icon-btn" aria-label="Copy server address" title="Copy server address">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M8.5 5.5C8.5 4.12 9.62 3 11 3H18C19.38 3 20.5 4.12 20.5 5.5V12.5C20.5 13.88 19.38 15 18 15H11C9.62 15 8.5 13.88 8.5 12.5V5.5ZM11 4.5C10.45 4.5 10 4.95 10 5.5V12.5C10 13.05 10.45 13.5 11 13.5H18C18.55 13.5 19 13.05 19 12.5V5.5C19 4.95 18.55 4.5 18 4.5H11Z" fill="currentColor"/>
                                    <path d="M4.5 9.5C4.5 8.12 5.62 7 7 7H7.5V8.5H7C6.45 8.5 6 8.95 6 9.5V17.5C6 18.05 6.45 18.5 7 18.5H14C14.55 18.5 15 18.05 15 17.5V17H16.5V17.5C16.5 18.88 15.38 20 14 20H7C5.62 20 4.5 18.88 4.5 17.5V9.5Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="settings-vscode-item mcp-settings-item">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Auth Header Name</span>
                        <p class="settings-vscode-item-description">Include this header in each MCP request.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-server-control-row">
                            <input type="text" id="mcp-auth-header-name" class="fluent-input settings-vscode-input mcp-server-value-input" readonly />
                            <button id="copy-mcp-auth-header-name-btn" class="sidebar-icon-btn mcp-copy-icon-btn" aria-label="Copy auth header name" title="Copy auth header name">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M8.5 5.5C8.5 4.12 9.62 3 11 3H18C19.38 3 20.5 4.12 20.5 5.5V12.5C20.5 13.88 19.38 15 18 15H11C9.62 15 8.5 13.88 8.5 12.5V5.5ZM11 4.5C10.45 4.5 10 4.95 10 5.5V12.5C10 13.05 10.45 13.5 11 13.5H18C18.55 13.5 19 13.05 19 12.5V5.5C19 4.95 18.55 4.5 18 4.5H11Z" fill="currentColor"/>
                                    <path d="M4.5 9.5C4.5 8.12 5.62 7 7 7H7.5V8.5H7C6.45 8.5 6 8.95 6 9.5V17.5C6 18.05 6.45 18.5 7 18.5H14C14.55 18.5 15 18.05 15 17.5V17H16.5V17.5C16.5 18.88 15.38 20 14 20H7C5.62 20 4.5 18.88 4.5 17.5V9.5Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="settings-vscode-item mcp-settings-item-spaced">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Auth Header Value (Token)</span>
                        <p class="settings-vscode-item-description">Secret token used by MCP clients to authenticate with the local server.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-server-control-row">
                            <input type="text" id="mcp-auth-header-value" class="fluent-input settings-vscode-input mcp-server-value-input" readonly />
                            <button id="copy-mcp-auth-header-value-btn" class="sidebar-icon-btn mcp-copy-icon-btn" aria-label="Copy auth token" title="Copy auth token">
                                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                    <path d="M8.5 5.5C8.5 4.12 9.62 3 11 3H18C19.38 3 20.5 4.12 20.5 5.5V12.5C20.5 13.88 19.38 15 18 15H11C9.62 15 8.5 13.88 8.5 12.5V5.5ZM11 4.5C10.45 4.5 10 4.95 10 5.5V12.5C10 13.05 10.45 13.5 11 13.5H18C18.55 13.5 19 13.05 19 12.5V5.5C19 4.95 18.55 4.5 18 4.5H11Z" fill="currentColor"/>
                                    <path d="M4.5 9.5C4.5 8.12 5.62 7 7 7H7.5V8.5H7C6.45 8.5 6 8.95 6 9.5V17.5C6 18.05 6.45 18.5 7 18.5H14C14.55 18.5 15 18.05 15 17.5V17H16.5V17.5C16.5 18.88 15.38 20 14 20H7C5.62 20 4.5 18.88 4.5 17.5V9.5Z" fill="currentColor"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <section class="settings-vscode-item mcp-clients-section" aria-labelledby="mcp-clients-heading">
                    <h3 id="mcp-clients-heading" class="settings-vscode-item-label">AI Clients</h3>
                    <ul class="mcp-client-list">
                        ${MCP_CLIENTS.map(
                            (client) => `
                            <li class="mcp-client-row">
                                <div class="mcp-client-identity">
                                    <span id="${client.id}-client-name" class="mcp-client-name">${client.name}</span>
                                    <span id="${client.id}-config-status" class="mcp-client-status" role="status">Checking configuration...</span>
                                </div>
                                <div class="mcp-client-actions" role="group" aria-labelledby="${client.id}-client-name">
                                    <button id="connect-${client.id}-btn" class="fluent-button fluent-button-secondary mcp-client-configure" title="Connect ${client.name}" disabled>
                                        ${connectIcon}<span>Connect</span>
                                    </button>
                                    <button id="disconnect-${client.id}-btn" class="fluent-button fluent-button-secondary mcp-client-disconnect" aria-label="Disconnect ${client.name}" title="Remove PPTB's MCP registration from ${client.name}" hidden>
                                        ${disconnectIcon}
                                    </button>
                                </div>
                            </li>
                        `,
                        ).join("")}
                    </ul>
                </section>

                <div class="settings-vscode-item mcp-settings-item-spaced">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Log Maintenance</span>
                        <p class="settings-vscode-item-description">Clear the invocation history and captured tool logs for this MCP server.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-client-connect-row">
                            <button id="mcp-clear-logs-btn" class="fluent-button fluent-button-secondary settings-vscode-btn">Clear Logs</button>
                        </div>
                        <div id="mcp-clear-logs-status" class="settings-vscode-item-description" style="margin-top: 6px; display: none;"></div>
                    </div>
                </div>

                <div id="mcp-container" class="invocation-logs-container mcp-invocations-container">
                    <h3 class="mcp-invocations-title">Invocations</h3>
                    <div class="empty-state" id="mcp-empty" style="display: none;">
                        <p>No agent invocations recorded yet.</p>
                        <p class="empty-state-hint">Invoke tools through the MCP server to see activity here.</p>
                    </div>
                    <table class="invocation-logs-table" id="invocation-logs-table" style="width: 100%; border-collapse: collapse; display: none;">
                         <thead>
                             <tr style="border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));">
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Timestamp</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Tool Name</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Status</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Outcome</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Actions</th>
                             </tr>
                         </thead>
                         <tbody id="invocation-logs-tbody"></tbody>
                    </table>
                </div>

                ${getMcpInvocationDetailsModalView()}
            </div>
        </div>
    `;

    initializeMcpInvocationDetailsModalController(() => {
        activeDetailsCorrelationId = null;
    });

    // Load and render logs
    wireMcpLiveUpdates();
    loadAndRenderLogs();
    startMcpRefreshLoop();
}

/**
 * Outcome badge styles
 */
function getOutcomeBadgeStyle(outcome: string): string {
    switch (outcome) {
        case "in-progress":
            return "background: #0078d4; color: white;";
        case "completed":
            return "background: #107c10; color: white;";
        case "no-result":
            return "background: #8a8886; color: white;";
        case "rejected":
            return "background: #d13438; color: white;";
        default:
            return "background: #6b6b6b; color: white;";
    }
}

function updateMcpServerStatusUi(isRunning: boolean, status: "starting" | "running" | "stopped" | "error" = isRunning ? "running" : "stopped"): void {
    const statusLabel = document.getElementById("mcp-server-status");
    const toggleButton = document.getElementById("mcp-server-toggle-btn") as HTMLButtonElement | null;

    if (statusLabel) {
        const label = status === "running" ? "Running" : status === "error" ? "Error" : status === "starting" ? "Starting" : "Stopped";
        const color = status === "running" ? "#107c10" : status === "error" ? "#d13438" : "#8a8886";
        statusLabel.textContent = label;
        statusLabel.setAttribute("style", `font-weight: 600; color: ${color};`);
    }

    if (toggleButton) {
        toggleButton.textContent = isRunning ? "Stop MCP Server" : "Start MCP Server";
        toggleButton.dataset.running = String(isRunning);
    }
}

function wireMcpLiveUpdates(): void {
    if (mcpLiveUpdatesBound) {
        return;
    }

    mcpLiveUpdatesBound = true;
    window.toolboxAPI.events.on((_, payload) => {
        if (payload && typeof payload === "object" && (payload as { event?: string }).event === ToolBoxEvent.MCP_HEADLESS_JOB_UPDATED) {
            void loadAndRenderLogs();
        }
    });
}

/**
 * Load and render the logs.
 */
async function loadAndRenderLogs(): Promise<void> {
    try {
        const [serverDetails, clientConfigStatuses, logs, userSettings] = await Promise.all([
            window.toolboxAPI.mcpServer.getDetails(),
            window.toolboxAPI.mcpServer.getClientConfigStatuses(),
            window.toolboxAPI.agentInvocation.getLogs(),
            window.toolboxAPI.getUserSettings(),
        ]);
        const container = document.getElementById("mcp-container");
        const emptyState = document.getElementById("mcp-empty");
        const table = document.getElementById("invocation-logs-table");
        const tbody = document.getElementById("invocation-logs-tbody");
        const clearLogsButton = document.getElementById("mcp-clear-logs-btn") as HTMLButtonElement | null;
        const clearLogsStatus = document.getElementById("mcp-clear-logs-status") as HTMLDivElement | null;
        const addressInput = document.getElementById("mcp-server-address") as HTMLInputElement | null;
        const headerNameInput = document.getElementById("mcp-auth-header-name") as HTMLInputElement | null;
        const headerValueInput = document.getElementById("mcp-auth-header-value") as HTMLInputElement | null;

        if (!container || !emptyState || !table || !tbody) {
            return;
        }

        if (addressInput) {
            addressInput.value = serverDetails.address;
        }
        if (headerNameInput) {
            headerNameInput.value = serverDetails.authHeaderName;
        }
        if (headerValueInput) {
            headerValueInput.value = serverDetails.authHeaderValue;
        }
        updateMcpServerStatusUi(serverDetails.isRunning, serverDetails.status);

        wireCopyButton("copy-mcp-server-address-btn", () => serverDetails.address, "MCP server address copied");
        wireCopyButton("copy-mcp-auth-header-name-btn", () => serverDetails.authHeaderName, "MCP auth header name copied");
        wireCopyButton("copy-mcp-auth-header-value-btn", () => serverDetails.authHeaderValue, "MCP auth token copied");
        wireMcpServerToggleButton();
        wireKeepMcpServerRunningToggle(serverDetails.isRunning, Boolean(userSettings.keepMcpServerRunning));
        updateClientConfigStatusUi(clientConfigStatuses);
        wireClientConfigButtons();
        wireClearLogsButton(clearLogsButton, clearLogsStatus);
        wireInvocationTableInteractions();

        if (logs.length === 0) {
            emptyState.style.display = "block";
            table.style.display = "none";
            tbody.innerHTML = "";
            activeDetailsCorrelationId = null;
            return;
        }

        emptyState.style.display = "none";
        table.style.display = "table";

        const jobStatuses = await Promise.all(logs.map((log) => window.toolboxAPI.mcpServer.getJobStatus(log.correlationId).catch(() => null)));

        tbody.innerHTML = logs
            .map((log, index) => {
                const job = jobStatuses[index];
                const status = job?.status ?? (log.outcome === "completed" ? "completed" : log.outcome === "rejected" ? "failed" : "no-result");
                return `
            <tr style="border-bottom: 1px solid var(--border-color-light, rgba(0,0,0,0.05));">
                <td style="padding: 8px; font-size: 13px; white-space: nowrap;">${formatTimestamp(log.timestamp)}</td>
                <td style="padding: 8px; font-size: 13px;">${escapeHtml(log.toolName)}</td>
                <td style="padding: 8px; font-size: 13px; text-transform: uppercase;">${escapeHtml(status)}</td>
                <td style="padding: 8px; font-size: 13px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; ${getOutcomeBadgeStyle(log.outcome)}">${escapeHtml(log.outcome)}</span>
                    ${log.error ? `<span style="margin-left: 6px; color: var(--error-color, #d13438); cursor: pointer;" title="${escapeHtml(log.error)}">⚠</span>` : ""}
                </td>
                <td style="padding: 8px; font-size: 13px;">
                    <button class="fluent-button fluent-button-secondary settings-vscode-btn mcp-invocation-details-btn" data-correlation-id="${escapeHtml(log.correlationId)}">Details</button>
                </td>
            </tr>
        `;
            })
            .join("");

        if (activeDetailsCorrelationId && !isMcpInvocationDetailsModalOpen()) {
            const activeLog = logs.find((log) => log.correlationId === activeDetailsCorrelationId) ?? null;
            if (activeLog) {
                const activeJob = await window.toolboxAPI.mcpServer.getJobStatus(activeDetailsCorrelationId).catch(() => null);
                setMcpInvocationDetailsModalContent(getMcpInvocationDetailsContent(activeLog, activeJob));
            }
        }
    } catch (error) {
        logError("Failed to load agent invocation logs", error);
        const container = document.getElementById("mcp-container");
        if (container) {
            container.innerHTML = `<div class="empty-state"><p>Error loading logs</p><p class="empty-state-hint">${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
        }
    }
}

function wireInvocationTableInteractions(): void {
    const tbody = document.getElementById("invocation-logs-tbody");
    if (!tbody || tbody.dataset.bound === "true") {
        return;
    }

    tbody.dataset.bound = "true";
    tbody.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        const button = target?.closest(".mcp-invocation-details-btn") as HTMLButtonElement | null;
        const correlationId = button?.dataset.correlationId;

        if (!correlationId) {
            return;
        }

        activeDetailsCorrelationId = correlationId;
        void openInvocationDetailsModal(correlationId);
    });
}

async function openInvocationDetailsModal(correlationId: string): Promise<void> {
    await refreshInvocationDetailsModal(correlationId);
    showMcpInvocationDetailsModal();
}

async function refreshInvocationDetailsModal(correlationId: string): Promise<void> {
    const logs = await window.toolboxAPI.agentInvocation.getLogs();
    const logEntry = logs.find((log) => log.correlationId === correlationId) ?? null;
    const job = await window.toolboxAPI.mcpServer.getJobStatus(correlationId).catch(() => null);
    setMcpInvocationDetailsModalContent(getMcpInvocationDetailsContent(logEntry, job));
}

function wireClearLogsButton(button: HTMLButtonElement | null, status: HTMLDivElement | null): void {
    if (!button || !status || button.dataset.bound === "true") {
        return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
        void (async () => {
            if (!window.confirm("Clear all MCP invocation history and captured tool logs?")) {
                return;
            }

            try {
                button.disabled = true;
                status.textContent = "Clearing logs...";
                status.style.display = "block";
                status.style.color = "var(--text-muted, rgba(0,0,0,0.65))";

                await window.toolboxAPI.mcpServer.clearLogs();
                hideMcpInvocationDetailsModal();
                await loadAndRenderLogs();

                status.textContent = "Logs cleared.";
                await window.toolboxAPI.utils.showNotification({
                    title: "MCP Logs Cleared",
                    body: "Invocation history and tool logs were cleared.",
                    type: "success",
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                status.textContent = `Failed to clear logs: ${message}`;
                status.style.color = "var(--error-color, #d13438)";
                logError("Failed to clear MCP logs", error);
            } finally {
                button.disabled = false;
            }
        })();
    });
}

function startMcpRefreshLoop(): void {
    if (mcpRefreshTimer !== null) {
        window.clearInterval(mcpRefreshTimer);
    }

    mcpRefreshTimer = window.setInterval(() => {
        void loadAndRenderLogs();
    }, MCP_REFRESH_INTERVAL_MS);
}

function wireKeepMcpServerRunningToggle(isServerRunning: boolean, initialKeepRunning: boolean): void {
    const checkbox = document.getElementById("mcp-keep-running-checkbox") as HTMLInputElement | null;
    const status = document.getElementById("mcp-keep-running-status") as HTMLSpanElement | null;

    if (!checkbox || !status || checkbox.dataset.bound === "true") {
        return;
    }

    const setStatus = (message: string, isError: boolean): void => {
        status.textContent = message;
        status.style.color = isError ? "var(--error-color, #d13438)" : "var(--text-secondary, #8a8886)";
    };

    checkbox.checked = initialKeepRunning;
    setStatus(initialKeepRunning ? "Enabled" : "Disabled", false);

    checkbox.dataset.bound = "true";
    checkbox.addEventListener("change", () => {
        void (async () => {
            const enabled = checkbox.checked;
            checkbox.disabled = true;
            setStatus("Saving...", false);

            try {
                await window.toolboxAPI.updateUserSettings({ keepMcpServerRunning: enabled });

                if (enabled && !isServerRunning) {
                    const details = await window.toolboxAPI.mcpServer.start();
                    updateMcpServerStatusUi(details.isRunning, details.status);
                    isServerRunning = details.isRunning;
                    setStatus("Enabled. MCP server started.", false);
                    await window.toolboxAPI.utils.showNotification({
                        title: "MCP Keep Running Enabled",
                        body: "MCP server started and will auto-start when tools are reopened.",
                        type: "success",
                    });
                } else {
                    setStatus(enabled ? "Enabled" : "Disabled", false);
                    await window.toolboxAPI.utils.showNotification({
                        title: enabled ? "MCP Keep Running Enabled" : "MCP Keep Running Disabled",
                        body: enabled ? "MCP server will auto-start when tools are reopened." : "MCP server will not auto-start when tools are reopened.",
                        type: "success",
                    });
                }
            } catch (error) {
                checkbox.checked = !enabled;
                setStatus("Failed to update setting.", true);
                logError("Failed to update MCP keep-running setting", error);
                await window.toolboxAPI.utils.showNotification({
                    title: "MCP Keep Running Update Failed",
                    body: "Unable to update Keep MCP Server Running setting.",
                    type: "error",
                });
            } finally {
                checkbox.disabled = false;
            }
        })();
    });
}

function wireClientConfigButtons(): void {
    const list = document.querySelector<HTMLElement>(".mcp-client-list");
    if (!list) {
        return;
    }

    const setButtonsEnabled = (enabled: boolean): void => {
        list.dataset.busy = String(!enabled);
        list.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
            button.disabled = !enabled;
        });
    };

    const showStatus = (clientId: McpClientConfigStatus["client"], message: string, isError: boolean): void => {
        const statusEl = document.getElementById(`${clientId}-config-status`);
        if (!statusEl) {
            return;
        }
        statusEl.textContent = message;
        statusEl.dataset.state = isError ? "invalid" : "pending";
    };

    const writeConfig = async (client: (typeof MCP_CLIENTS)[number], disconnect = false): Promise<void> => {
        try {
            setButtonsEnabled(false);
            showStatus(client.id, disconnect ? "Removing..." : "Configuring...", false);

            const clientApi = window.toolboxAPI.mcpServer;
            const result = await clientApi[disconnect ? client.disconnect : client.configure]();

            updateClientConfigStatusUi(await window.toolboxAPI.mcpServer.getClientConfigStatuses());
            await window.toolboxAPI.utils.showNotification({
                title: disconnect ? "MCP Client Registration Removed" : "MCP Client Configured",
                body: disconnect
                    ? `${result.serverName} was removed from ${client.name}. Restart or reload the client to close any cached connection.`
                    : `${client.name} is configured and the PPTB MCP server is running. ${
                          client.id === "vscode"
                              ? "In VS Code, enable and start pptb from MCP: List Servers, and approve trust if prompted."
                              : "Restart Claude Desktop to load the updated MCP configuration."
                      }`,
                type: "success",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(client.id, "Update failed", true);
            await window.toolboxAPI.utils.showNotification({
                title: "MCP Config Failed",
                body: `Unable to ${disconnect ? "disconnect" : "configure"} ${client.name}: ${message}`,
                type: "error",
            });
            logError(disconnect ? "Failed to remove MCP client config" : "Failed to write MCP client config", error);
        } finally {
            setButtonsEnabled(true);
        }
    };

    for (const client of MCP_CLIENTS) {
        for (const action of ["connect", "disconnect"] as const) {
            const button = document.getElementById(`${action}-${client.id}-btn`);
            if (button && button.dataset.bound !== "true") {
                button.dataset.bound = "true";
                button.addEventListener("click", () => {
                    void writeConfig(client, action === "disconnect");
                });
            }
        }
    }
}

function updateClientConfigStatusUi(statuses: McpClientConfigStatus[]): void {
    for (const status of statuses) {
        const client = MCP_CLIENTS.find((entry) => entry.id === status.client);
        const button = document.getElementById(`connect-${status.client}-btn`) as HTMLButtonElement | null;
        const statusEl = document.getElementById(`${status.client}-config-status`);
        const disconnectButton = document.getElementById(`disconnect-${status.client}-btn`);
        if (!client || !button || !statusEl || !disconnectButton) {
            continue;
        }

        const presentation = getMcpClientPresentation(status.status);
        statusEl.textContent = presentation.label;
        statusEl.dataset.state = status.status;
        statusEl.title = status.filePath;
        disconnectButton.hidden = !presentation.canDisconnect;
        button.title = `${presentation.action} ${client.name}`;
        button.setAttribute("aria-label", button.title);
        const label = button.querySelector("span");
        if (label?.textContent !== presentation.action) {
            button.innerHTML = `${presentation.canDisconnect ? reconnectIcon : connectIcon}<span>${presentation.action}</span>`;
        }
        button.disabled = document.querySelector<HTMLElement>(".mcp-client-list")?.dataset.busy === "true";
    }
}

function wireMcpServerToggleButton(): void {
    const toggleBtn = document.getElementById("mcp-server-toggle-btn") as HTMLButtonElement | null;
    const actionStatus = document.getElementById("mcp-server-action-status") as HTMLSpanElement | null;

    if (!toggleBtn || !actionStatus || toggleBtn.dataset.bound === "true") {
        return;
    }

    const setBusy = (busy: boolean): void => {
        toggleBtn.disabled = busy;
    };

    const setActionStatus = (message: string, isError: boolean): void => {
        actionStatus.textContent = message;
        actionStatus.style.color = isError ? "var(--error-color, #d13438)" : "var(--text-secondary, #8a8886)";
    };

    toggleBtn.dataset.bound = "true";
    toggleBtn.addEventListener("click", () => {
        void (async () => {
            const isRunning = toggleBtn.dataset.running === "true";
            const nextActionLabel = isRunning ? "Stopping MCP server..." : "Starting MCP server...";
            setBusy(true);
            setActionStatus(nextActionLabel, false);

            try {
                const details = isRunning ? await window.toolboxAPI.mcpServer.stop() : await window.toolboxAPI.mcpServer.start();
                updateMcpServerStatusUi(details.isRunning, details.status);
                setActionStatus(details.isRunning ? "MCP server is running." : "MCP server is stopped.", false);
                await window.toolboxAPI.utils.showNotification({
                    title: details.isRunning ? "MCP Server Started" : "MCP Server Stopped",
                    body: details.isRunning ? "Local MCP server is now running." : "Local MCP server has been stopped.",
                    type: "success",
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                setActionStatus(`Failed to ${isRunning ? "stop" : "start"} MCP server: ${message}`, true);
                logError("Failed to toggle MCP server", error);
                await window.toolboxAPI.utils.showNotification({
                    title: "MCP Server Action Failed",
                    body: `Unable to ${isRunning ? "stop" : "start"} MCP server.`,
                    type: "error",
                });
            } finally {
                setBusy(false);
            }
        })();
    });
}

function wireCopyButton(buttonId: string, getValue: () => string, successMessage: string): void {
    const button = document.getElementById(buttonId) as HTMLButtonElement | null;
    if (!button || button.dataset.bound === "true") {
        return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
        const value = getValue();
        void window.toolboxAPI.utils.copyToClipboard(value);
        void window.toolboxAPI.utils.showNotification({
            title: "Copied",
            body: successMessage,
            type: "success",
        });
    });
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp: string): string {
    try {
        const date = new Date(timestamp);
        return date.toLocaleString([], {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    } catch {
        return timestamp;
    }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Open agent invocation logs as a tab
 */
export async function openAgentInvocationLogsTab(): Promise<void> {
    registerCloseGuard("mcp", async () => {
        return true;
    });
    await openLocalPageAsTab("mcp", "MCP Server", renderMCPServerContent, "");
}
