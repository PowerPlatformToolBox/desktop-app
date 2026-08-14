import type { AgentInvocationLogEntry, HeadlessJobDetails } from "../../../common/types";

function escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

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

function getStatusBadgeStyle(status: string): string {
    switch (status) {
        case "completed":
            return "background: #107c10; color: white;";
        case "failed":
            return "background: #d13438; color: white;";
        case "in_progress":
            return "background: #0f6cbd; color: white;";
        case "pending":
            return "background: #8a8886; color: white;";
        default:
            return "background: #6b6b6b; color: white;";
    }
}

function getLogLevelBadgeStyle(level: string): string {
    switch (level) {
        case "error":
            return "background: #d13438; color: white;";
        case "warn":
            return "background: #f7630c; color: white;";
        case "info":
            return "background: #0f6cbd; color: white;";
        case "debug":
            return "background: #8a8886; color: white;";
        default:
            return "background: #6b6b6b; color: white;";
    }
}

export function getMcpInvocationDetailsModalView(): string {
    return `
        <div id="mcp-invocation-modal" class="modal mcp-invocation-modal">
            <div role="dialog" aria-modal="true" aria-labelledby="mcp-invocation-modal-title" class="modal-content mcp-invocation-modal-content">
                <div class="modal-header mcp-invocation-modal-header">
                    <h3 id="mcp-invocation-modal-title">Invocation Details</h3>
                    <button id="mcp-invocation-modal-close" class="fluent-button fluent-button-secondary settings-vscode-btn">Close</button>
                </div>
                <div id="mcp-invocation-modal-content" class="modal-body mcp-invocation-modal-body"></div>
            </div>
        </div>
    `;
}

export function getMcpInvocationDetailsContent(logEntry: AgentInvocationLogEntry | null, job: HeadlessJobDetails | null): string {
    if (!logEntry && !job) {
        return `<div class="empty-state" style="padding: 14px 16px;"><p>No invocation details are available.</p></div>`;
    }

    const status = job?.status ?? (logEntry?.outcome === "completed" ? "completed" : logEntry?.outcome === "rejected" ? "failed" : "pending");
    const logs = job?.logs ?? [];
    const progressText = job?.progress ? `${job.progress.percent}%${job.progress.message ? ` - ${escapeHtml(job.progress.message)}` : ""}` : "-";

    const detailsSummary = `
        <div style="display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); width: 100%;">
            <div><strong>Tool</strong><div>${escapeHtml(logEntry?.toolName ?? job?.toolName ?? "Unknown")}</div></div>
            <div><strong>Job / Correlation ID</strong><div style="font-family: monospace; word-break: break-all;">${escapeHtml(job?.jobId ?? logEntry?.correlationId ?? "-")}</div></div>
            <div><strong>Status</strong><div><span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; ${getStatusBadgeStyle(status)}">${escapeHtml(status)}</span></div></div>
            <div><strong>Progress</strong><div>${progressText}</div></div>
            <div><strong>Invocation Mode</strong><div>${escapeHtml(logEntry?.invocationMode ?? "-")}</div></div>
            <div><strong>Outcome</strong><div>${escapeHtml(logEntry?.outcome ?? "-")}</div></div>
        </div>
    `;

    const detailsLogs =
        logs.length > 0
            ? `<div style="display: grid; gap: 6px; max-height: 240px; overflow: auto;">
            ${logs
                .map(
                    (entry) => `
                <div style="padding: 7px 10px; border: 1px solid var(--border-color-light, rgba(0,0,0,0.08)); border-radius: 7px;">
                    <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 3px; flex-wrap: wrap;">
                        <span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; line-height: 1.2; ${getLogLevelBadgeStyle(entry.level)}">${escapeHtml(entry.level)}</span>
                        <span style="font-size: 11px; color: var(--text-muted, rgba(0,0,0,0.6));">${formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div style="white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.4;">${escapeHtml(entry.message)}</div>
                </div>
            `,
                )
                .join("")}
        </div>`
            : `<div class="empty-state" style="padding: 14px 16px;"><p>No tool log messages were captured for this job.</p></div>`;

    const resolvedError = job?.error ?? logEntry?.error;

    const resultBlock = resolvedError
        ? `<div style="padding: 12px; border: 1px solid rgba(209,52,56,0.35); background: rgba(209,52,56,0.08); border-radius: 8px; white-space: pre-wrap; word-break: break-word;">${escapeHtml(resolvedError)}</div>`
        : job?.result
          ? `<pre style="margin: 0; padding: 12px; border-radius: 8px; background: rgba(0,0,0,0.04); overflow: auto; white-space: pre-wrap; word-break: break-word;">${escapeHtml(JSON.stringify(job.result, null, 2))}</pre>`
          : `<div class="empty-state" style="padding: 14px 16px;"><p>No final result or error is available yet.</p></div>`;

    return `
        <div class="mcp-modal-section">
            <div class="mcp-modal-section-title">Selected Job</div>
            <div class="mcp-modal-section-content">${detailsSummary}</div>
        </div>
        <div class="mcp-modal-section">
            <div class="mcp-modal-section-title">Tool Logs</div>
            <p class="mcp-modal-section-description">Messages captured from the headless runtime for this job.</p>
            <div class="mcp-modal-section-content">${detailsLogs}</div>
        </div>
        <div class="mcp-modal-section">
            <div class="mcp-modal-section-title">Result / Error</div>
            <div class="mcp-modal-section-content">${resultBlock}</div>
        </div>
    `;
}
