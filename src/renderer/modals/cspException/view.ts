import { getModalStyles } from "../sharedStyles";
import { escapeHtml } from "../../utils/toolIconResolver";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface CspExceptionModalViewModel {
    toolName: string;
    authors: string[];
    cspExceptions: { [directive: string]: string[] };
    isDarkTheme: boolean;
}

/**
 * Returns the view markup (styles + body) for the CSP exception modal BrowserWindow.
 */
export function getCspExceptionModalView(model: CspExceptionModalViewModel): ModalViewTemplate {
    const isDarkTheme = model.isDarkTheme;

    const authorsList = model.authors && model.authors.length ? model.authors.join(", ") : "Unknown";

    // Build flat list of unique CSP source expressions across all directives
    const allSources = new Set<string>();
    for (const sources of Object.values(model.cspExceptions)) {
        if (Array.isArray(sources)) {
            sources.forEach((source: string) => allSources.add(source));
        }
    }
    const exceptionsHtml = Array.from(allSources)
        .map((source: string) => `<li><code>${escapeHtml(source)}</code></li>`)
        .join("");

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    /* CSP exception modal specific styles */
    .modal-header h3 {
        color: #ffb900;
    }

    .modal-body p {
        margin-bottom: 16px;
        line-height: 1.6;
    }

    .tool-info {
        margin-bottom: 20px;
    }

    .tool-name {
        font-weight: 600;
        font-size: 15px;
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .tool-author {
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin-top: 4px;
    }

    .csp-exceptions-list {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border-radius: 8px;
        padding: 12px 16px;
        margin: 16px 0;
        max-height: 300px;
        overflow-y: auto;
    }

    .csp-exceptions-list ul {
        margin: 0;
        padding-left: 20px;
    }

    .csp-exceptions-list li {
        margin: 4px 0;
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
    }

    .csp-exceptions-list code {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"};
        border-radius: 3px;
        padding: 2px 6px;
        font-family: "Consolas", "Monaco", "Courier New", monospace;
        font-size: 12px;
        color: ${isDarkTheme ? "#f48771" : "#d84315"};
    }

    .csp-warning {
        background: rgba(255, 185, 0, 0.1);
        border: 1px solid rgba(255, 185, 0, 0.3);
        border-radius: 8px;
        padding: 12px;
        margin: 16px 0;
    }

    .csp-warning p {
        margin: 0 0 12px 0;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
        font-size: 13px;
        line-height: 1.5;
    }

    .csp-warning p:last-child {
        margin-bottom: 0;
    }

    .csp-warning strong {
        color: #ffb900;
    }

    .csp-warning ul {
        margin: 0;
        padding-left: 20px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
    }

    .csp-warning li {
        margin: 4px 0;
        font-size: 13px;
    }

    .csp-learn-more {
        color: #4cc2ff;
    }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">⚠️ Permission Request</p>
            <h3>Website Access Required</h3>
        </div>
    </div>
    <div class="modal-body">
        <p>
            <strong class="tool-name">${escapeHtml(model.toolName)}</strong> by <span class="tool-author">${escapeHtml(authorsList)}</span>
            wants to connect to websites outside this application.
        </p>
        <p>
            Only allow this if you trust the tool and who created it.
            Allowing access means the tool can download information, load content, and communicate with the listed websites:
        </p>
        <div class="csp-exceptions-list">
            <ul>
                ${exceptionsHtml}
            </ul>
        </div>
        <div class="csp-warning">
            <p>
                <strong>⚠️ Only allow this if you trust the tool.</strong>
            </p>
            <p>
                If you are unsure, decline and check the tool's documentation or contact its author before proceeding.
                <a href="https://docs.pptoolbox.com/security/csp-exceptions" target="_blank" rel="noopener noreferrer" class="csp-learn-more">Learn more about website permissions.</a>
            </p>
        </div>
    </div>
    <div class="modal-footer">
        <button id="csp-decline-btn" class="fluent-button fluent-button-secondary">Decline</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Allow &amp; Continue</button>
    </div>
</div>`;

    return { styles, body };
}
