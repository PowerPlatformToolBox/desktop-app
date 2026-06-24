import { logError } from "../../common/logger";
import { openLocalPageAsTab, registerCloseGuard } from "./toolManagement";

/**
 * Render the MCP server content into a panel
 */
export function renderMCPServerContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="mcp-tab">
            <div class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">
                    MCP Server
                    <p class="mcp-subheader" style="margin-bottom: 16px;">
                        Server connection details and invocation history for MCP-triggered tool launches.
                    </p>
                </h2>

                <div class="settings-vscode-item" style="margin-bottom: 8px;">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Server Status</span>
                    </div>
                    <div class="settings-vscode-item-control">
                        <span id="mcp-server-status" style="font-weight: 600;"></span>
                    </div>
                </div>

                <div class="settings-vscode-item" style="margin-bottom: 8px;">
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

                <div class="settings-vscode-item" style="margin-bottom: 8px;">
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

                <div class="settings-vscode-item" style="margin-bottom: 16px;">
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

                <div class="settings-vscode-item" style="margin-bottom: 16px;">
                    <div class="settings-vscode-item-info">
                        <span class="settings-vscode-item-label">Quick Connect</span>
                        <p class="settings-vscode-item-description">Create or update local MCP config files for supported clients using this server's URL and auth header/token.</p>
                    </div>
                    <div class="settings-vscode-item-control mcp-server-item-control">
                        <div class="mcp-client-connect-row">
                            <button id="connect-claude-desktop-btn" class="fluent-button fluent-button-secondary settings-vscode-btn">Connect to Claude Desktop</button>
                            <button id="connect-vscode-btn" class="fluent-button fluent-button-secondary settings-vscode-btn">Connect to VSCode</button>
                        </div>
                        <div id="mcp-client-config-status" class="settings-vscode-item-description" style="margin-top: 6px; display: none;"></div>
                    </div>
                </div>

                <div id="agent-invocation-logs-container" class="invocation-logs-container">
                    <div class="empty-state" id="agent-invocation-logs-empty" style="display: none;">
                        <p>No agent invocations recorded yet.</p>
                        <p class="empty-state-hint">Invoke tools through the MCP server to see activity here.</p>
                    </div>
<table class="invocation-logs-table" id="invocation-logs-table" style="width: 100%; border-collapse: collapse; display: none;">
                         <thead>
                             <tr style="border-bottom: 1px solid var(--border-color, rgba(0,0,0,0.1));">
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Timestamp</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Tool Name</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Tool ID</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Mode</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Connection</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));">Prefill</th>
                                 <th style="text-align: left; padding: 8px; font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-muted, rgba(0,0,0,0.6));;">Outcome</th>
                             </tr>
                         </thead>
                         <tbody id="invocation-logs-tbody"></tbody>
                     </table>
                </div>
            </div>
        </div>
    `;

    // Load and render logs
    loadAndRenderLogs();
}

/**
 * Outcome badge styles
 */
function getOutcomeBadgeStyle(outcome: string): string {
    switch (outcome) {
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

/**
 * Load and render the logs
 */
async function loadAndRenderLogs(): Promise<void> {
    try {
        const [serverDetails, logs] = await Promise.all([window.toolboxAPI.mcpServer.getDetails(), window.toolboxAPI.agentInvocation.getLogs()]);
        const container = document.getElementById("agent-invocation-logs-container");
        const emptyState = document.getElementById("agent-invocation-logs-empty");
        const table = document.getElementById("invocation-logs-table");
        const tbody = document.getElementById("invocation-logs-tbody");
        const statusLabel = document.getElementById("mcp-server-status");
        const addressInput = document.getElementById("mcp-server-address") as HTMLInputElement | null;
        const headerNameInput = document.getElementById("mcp-auth-header-name") as HTMLInputElement | null;
        const headerValueInput = document.getElementById("mcp-auth-header-value") as HTMLInputElement | null;

        if (!container || !emptyState || !table || !tbody) return;

        if (addressInput) {
            addressInput.value = serverDetails.address;
        }
        if (headerNameInput) {
            headerNameInput.value = serverDetails.authHeaderName;
        }
        if (headerValueInput) {
            headerValueInput.value = serverDetails.authHeaderValue;
        }
        if (statusLabel) {
            statusLabel.textContent = serverDetails.isRunning ? "Running" : "Stopped";
            statusLabel.setAttribute("style", `font-weight: 600; color: ${serverDetails.isRunning ? "#107c10" : "#d13438"};`);
        }

        wireCopyButton("copy-mcp-server-address-btn", () => serverDetails.address, "MCP server address copied");
        wireCopyButton("copy-mcp-auth-header-name-btn", () => serverDetails.authHeaderName, "MCP auth header name copied");
        wireCopyButton("copy-mcp-auth-header-value-btn", () => serverDetails.authHeaderValue, "MCP auth token copied");
        wireClientConfigButtons();

        if (logs.length === 0) {
            emptyState.style.display = "block";
            table.style.display = "none";
            return;
        }

        emptyState.style.display = "none";
        table.style.display = "table";

        tbody.innerHTML = logs
            .map(
                (log) => `
            <tr style="border-bottom: 1px solid var(--border-color-light, rgba(0,0,0,0.05));">
                <td style="padding: 8px; font-size: 13px; white-space: nowrap;">${formatTimestamp(log.timestamp)}</td>
                <td style="padding: 8px; font-size: 13px;">${escapeHtml(log.toolName)}</td>
                <td style="padding: 8px; font-size: 13px; font-family: monospace;">${escapeHtml(log.toolId)}</td>
                <td style="padding: 8px; font-size: 13px; text-transform: uppercase;">${log.invocationMode ? escapeHtml(log.invocationMode) : '<span style="color: var(--text-muted, rgba(0,0,0,0.4));">—</span>'}</td>
                <td style="padding: 8px; font-size: 13px;">${log.connectionId ? escapeHtml(log.connectionId) : '<span style="color: var(--text-muted, rgba(0,0,0,0.4));">—</span>'}</td>
                <td style="padding: 8px; font-size: 13px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(log.prefillSummary)}">${escapeHtml(log.prefillSummary)}</td>
                <td style="padding: 8px; font-size: 13px;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; ${getOutcomeBadgeStyle(log.outcome)}">${escapeHtml(log.outcome)}</span>
                    ${log.error ? `<span style="margin-left: 6px; color: var(--error-color, #d13438); cursor: pointer;" title="${escapeHtml(log.error)}">⚠</span>` : ""}
                </td>
            </tr>
        `,
            )
            .join("");
    } catch (error) {
        logError("Failed to load agent invocation logs", error);
        const container = document.getElementById("agent-invocation-logs-container");
        if (container) {
            container.innerHTML = `<div class="empty-state"><p>Error loading logs</p><p class="empty-state-hint">${escapeHtml(error instanceof Error ? error.message : String(error))}</p></div>`;
        }
    }
}

function wireClientConfigButtons(): void {
    const claudeBtn = document.getElementById("connect-claude-desktop-btn") as HTMLButtonElement | null;
    const vscodeBtn = document.getElementById("connect-vscode-btn") as HTMLButtonElement | null;
    const statusEl = document.getElementById("mcp-client-config-status") as HTMLDivElement | null;

    if (!claudeBtn || !vscodeBtn || !statusEl) {
        return;
    }

    const setButtonsEnabled = (enabled: boolean): void => {
        claudeBtn.disabled = !enabled;
        vscodeBtn.disabled = !enabled;
    };

    const showStatus = (message: string, isError: boolean): void => {
        statusEl.textContent = message;
        statusEl.style.display = "block";
        statusEl.style.color = isError ? "var(--error-color, #d13438)" : "var(--text-muted, rgba(0,0,0,0.65))";
    };

    const writeConfig = async (target: "claude" | "vscode"): Promise<void> => {
        try {
            setButtonsEnabled(false);
            showStatus(`Configuring ${target === "claude" ? "Claude Desktop" : "VSCode"}...`, false);

            const result = target === "claude" ? await window.toolboxAPI.mcpServer.configureClaudeDesktop() : await window.toolboxAPI.mcpServer.configureVSCode();

            showStatus(`Updated ${target === "claude" ? "Claude Desktop" : "VSCode"} config at ${result.filePath} (${result.os}).`, false);
            await window.toolboxAPI.utils.showNotification({
                title: "MCP Config Updated",
                body: `${target === "claude" ? "Claude Desktop" : "VSCode"} is now configured for ${result.serverName}.`,
                type: "success",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(`Failed to configure ${target === "claude" ? "Claude Desktop" : "VSCode"}: ${message}`, true);
            await window.toolboxAPI.utils.showNotification({
                title: "MCP Config Failed",
                body: `Unable to configure ${target === "claude" ? "Claude Desktop" : "VSCode"}.`,
                type: "error",
            });
            logError("Failed to write MCP client config", error);
        } finally {
            setButtonsEnabled(true);
        }
    };

    if (claudeBtn.dataset.bound !== "true") {
        claudeBtn.dataset.bound = "true";
        claudeBtn.addEventListener("click", () => {
            void writeConfig("claude");
        });
    }

    if (vscodeBtn.dataset.bound !== "true") {
        vscodeBtn.dataset.bound = "true";
        vscodeBtn.addEventListener("click", () => {
            void writeConfig("vscode");
        });
    }
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
    registerCloseGuard("agent-invocation-logs", async () => {
        return true;
    });
    await openLocalPageAsTab("agent-invocation-logs", "MCP Server", renderMCPServerContent, "");
}
