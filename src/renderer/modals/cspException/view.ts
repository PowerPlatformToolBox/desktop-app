import { getModalStyles } from "../sharedStyles";

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

    // Build list of CSP exceptions
    let exceptionsHtml = "";
    for (const [directive, sources] of Object.entries(model.cspExceptions)) {
        if (Array.isArray(sources) && sources.length > 0) {
            const directiveName = directive.replace("-src", "").replace(/-/g, " ");
            exceptionsHtml += `
                <div class="csp-exception">
                    <strong>${directiveName}:</strong>
                    <ul>
                        ${sources.map((source: string) => `<li><code>${source}</code></li>`).join("")}
                    </ul>
                </div>
            `;
        }
    }

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
        padding: 16px;
        margin: 16px 0;
        max-height: 300px;
        overflow-y: auto;
    }

    .csp-exception {
        margin-bottom: 16px;
    }

    .csp-exception:last-child {
        margin-bottom: 0;
    }

    .csp-exception strong {
        display: block;
        margin-bottom: 8px;
        color: #4cc2ff;
        text-transform: capitalize;
    }

    .csp-exception ul {
        margin: 0;
        padding-left: 20px;
    }

    .csp-exception li {
        margin: 4px 0;
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
    }

    .csp-exception code {
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
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">⚠️ Security Permissions</p>
            <h3>Review Required</h3>
        </div>
    </div>
    <div class="modal-body">
        <p>
            <span class="tool-name">${model.toolName}</span> by <span class="tool-author">${authorsList}</span>
            is requesting permission to access external resources.
        </p>
        <p>
            This tool needs the following Content Security Policy (CSP) exceptions to function properly:
        </p>
        <div class="csp-exceptions-list">
            ${exceptionsHtml}
        </div>
        <div class="csp-warning">
            <p>
                <strong>⚠️ Important:</strong> Only grant these permissions if you trust this tool and its author. 
                These permissions will allow the tool to:
            </p>
            <ul>
                <li>Make network requests to the specified domains</li>
                <li>Load scripts and styles from external sources</li>
                <li>Access external resources as specified above</li>
            </ul>
        </div>
    </div>
    <div class="modal-footer">
        <button id="csp-decline-btn" class="fluent-button fluent-button-secondary">Decline</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Accept &amp; Continue</button>
    </div>
</div>`;

    return { styles, body };
}
