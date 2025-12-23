export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the CSP exception modal BrowserWindow.
 */
export function getCspExceptionModalView(data: { toolName: string; authors: string[]; cspExceptions: { [directive: string]: string[] } }): ModalViewTemplate {
    const authorsList = data.authors && data.authors.length ? data.authors.join(", ") : "Unknown";

    // Build list of CSP exceptions
    let exceptionsHtml = "";
    for (const [directive, sources] of Object.entries(data.cspExceptions)) {
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

    const styles = `
<style>
    :root {
        color-scheme: dark;
    }

    * {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #f3f3f3;
    }

    .modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        background: #1f1f23;
        border-radius: 16px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
    }

    .modal-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
    }

    .modal-header h3 {
        margin: 4px 0 0;
        font-size: 20px;
        font-weight: 600;
        color: #ffb900;
    }

    .icon-button {
        background: rgba(255, 255, 255, 0.08);
        border: none;
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
    }

    .icon-button:hover {
        background: rgba(255, 255, 255, 0.18);
    }

    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
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
        color: #fff;
    }

    .tool-author {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
    }

    .csp-exceptions-list {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
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
        color: rgba(255, 255, 255, 0.8);
    }

    .csp-exception code {
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 3px;
        padding: 2px 6px;
        font-family: "Consolas", "Monaco", "Courier New", monospace;
        font-size: 12px;
        color: #f48771;
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
        color: rgba(255, 255, 255, 0.9);
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
        color: rgba(255, 255, 255, 0.8);
    }

    .csp-warning li {
        margin: 4px 0;
        font-size: 13px;
    }

    .modal-footer {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .fluent-button {
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        padding: 10px 18px;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
    }

    .fluent-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .fluent-button-primary {
        background: #0e639c;
        color: #fff;
    }

    .fluent-button-primary:hover:not(:disabled) {
        background: #1177bb;
    }

    .fluent-button-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .fluent-button-secondary:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
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
            <span class="tool-name">${data.toolName}</span> by <span class="tool-author">${authorsList}</span>
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
