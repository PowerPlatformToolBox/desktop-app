import { logError } from "../../common/logger";
import { registerCloseGuard } from "./toolManagement";

/**
 * Render the agent invocation logs content into a panel
 */
export function renderAgentInvocationLogsContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="agent-invocation-logs-tab">
            <div class="settings-vscode-section">
                <h2 class="settings-vscode-section-title">Agent Invocation Logs</h2>
                <p class="settings-vscode-item-description" style="margin-bottom: 16px;">
                    History of tool invocations triggered through the MCP server by external agents.
                </p>
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
        const logs = await window.toolboxAPI.agentInvocation.getLogs();
        const container = document.getElementById("agent-invocation-logs-container");
        const emptyState = document.getElementById("agent-invocation-logs-empty");
        const table = document.getElementById("invocation-logs-table");
        const tbody = document.getElementById("invocation-logs-tbody");

        if (!container || !emptyState || !table || !tbody) return;

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
    await openToolDetailTab("agent-invocation-logs", "Agent Logs", renderAgentInvocationLogsContent, "");
}

/**
 * Import openToolDetailTab dynamically to avoid circular dependencies
 */
async function openToolDetailTab(
    tabId: string,
    displayName: string,
    renderContent: (panel: HTMLElement) => void,
    tabLabelSuffix: string,
): Promise<void> {
    const { openToolDetailTab: fn } = await import("./toolManagement");
    fn(tabId, displayName, renderContent, tabLabelSuffix);
}