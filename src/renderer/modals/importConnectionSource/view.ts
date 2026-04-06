import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the import connection source selection modal.
 */
export function getImportConnectionSourceModalView(isDarkTheme: boolean): ModalViewTemplate {
    const styles = getModalStyles(isDarkTheme);

    const extraStyles = `
<style>
    .source-cards {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .source-card {
        display: flex;
        align-items: flex-start;
        gap: 14px;
        padding: 14px 16px;
        border-radius: 10px;
        border: 2px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        text-align: left;
        width: 100%;
    }

    .source-card:hover {
        border-color: ${isDarkTheme ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.25)"};
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
    }

    .source-card.selected {
        border-color: #0e639c;
        background: ${isDarkTheme ? "rgba(14, 99, 156, 0.15)" : "rgba(14, 99, 156, 0.08)"};
    }

    .source-card-radio {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.3)"};
        flex-shrink: 0;
        margin-top: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: border-color 0.15s;
    }

    .source-card.selected .source-card-radio {
        border-color: #0e639c;
    }

    .source-card-radio-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #0e639c;
        display: none;
    }

    .source-card.selected .source-card-radio-dot {
        display: block;
    }

    .source-card-content {
        flex: 1;
        min-width: 0;
    }

    .source-card-title {
        font-size: 14px;
        font-weight: 600;
        color: ${isDarkTheme ? "#f3f3f3" : "#1f1f1f"};
        margin: 0 0 3px;
    }

    .source-card-desc {
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.55)"};
        margin: 0;
    }

    .source-card-badge {
        font-size: 11px;
        padding: 2px 7px;
        border-radius: 4px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.08)"};
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.5)"};
        flex-shrink: 0;
        margin-top: 1px;
        font-family: "Consolas", "Courier New", monospace;
    }

    .xtb-hint {
        display: none;
        margin-top: 12px;
        padding: 12px 14px;
        border-radius: 8px;
        background: ${isDarkTheme ? "rgba(255, 200, 50, 0.08)" : "rgba(180, 130, 0, 0.07)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 200, 50, 0.2)" : "rgba(180, 130, 0, 0.2)"};
        font-size: 12.5px;
        color: ${isDarkTheme ? "rgba(255, 230, 130, 0.9)" : "rgba(100, 70, 0, 0.9)"};
        line-height: 1.55;
    }

    .xtb-hint.visible {
        display: block;
    }

    .xtb-hint strong {
        display: block;
        margin-bottom: 6px;
        font-size: 12.5px;
    }

    .xtb-hint ol {
        margin: 0;
        padding-left: 18px;
    }

    .xtb-hint ol li {
        margin-bottom: 4px;
    }

    .xtb-hint code {
        font-family: "Consolas", "Courier New", monospace;
    }

    .xtb-hint .xtb-path {
        display: inline-block;
        font-family: "Consolas", "Courier New", monospace;
        font-size: 11px;
        background: ${isDarkTheme ? "rgba(0, 0, 0, 0.3)" : "rgba(0, 0, 0, 0.07)"};
        padding: 3px 7px;
        border-radius: 4px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.65)"};
    }

    .xtb-path-col {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 8px;
    }

    .xtb-path-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .copy-path-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        padding: 0;
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.18)"};
        border-radius: 4px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)"};
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.55)"};
        cursor: pointer;
        transition: background 0.12s, border-color 0.12s, color 0.12s;
    }

    .copy-path-btn:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.1)"};
        border-color: ${isDarkTheme ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.3)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .copy-path-btn.copied {
        color: #4caf50;
        border-color: #4caf50;
        background: ${isDarkTheme ? "rgba(76, 175, 80, 0.15)" : "rgba(76, 175, 80, 0.1)"};
    }

    .copy-path-btn svg {
        width: 13px;
        height: 13px;
        pointer-events: none;
    }
</style>`;

    const body = `
<body>
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Connections</p>
            <h3>Import Connections</h3>
        </div>
        <button id="close-import-source-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <p style="margin: 0 0 14px; font-size: 13.5px; color: ${isDarkTheme ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.65)"};">Choose the source format for the connection file you want to import.</p>
        <div class="source-cards">
            <button class="source-card selected" id="card-xtb" aria-pressed="true">
                <div class="source-card-radio"><div class="source-card-radio-dot"></div></div>
                <div class="source-card-content">
                    <p class="source-card-title">XrmToolBox</p>
                    <p class="source-card-desc">Import from an XrmToolBox connection list file</p>
                </div>
                <span class="source-card-badge">.xml</span>
            </button>
            <button class="source-card" id="card-pptb" aria-pressed="false">
                <div class="source-card-radio"><div class="source-card-radio-dot"></div></div>
                <div class="source-card-content">
                    <p class="source-card-title">Power Platform ToolBox</p>
                    <p class="source-card-desc">Import from a PPTB connections backup file</p>
                </div>
                <span class="source-card-badge">.json</span>
            </button>
        </div>
        <div class="xtb-hint visible" id="xtb-hint">
            <strong>💡 How to export connections from XrmToolBox:</strong>
            <ol>
                <li><span>Open <b>XrmToolBox</b> and click the <b>Connect</b> button to open the Connection Manager.</span></li>
                <li><span>In the Connection Manager, right-click a connection and choose <b>Export to XML</b> or export all connections via the toolbar.</span></li>
                <li><span>Save the file and select it here. The file is typically named <code>ConnectionsList.xml</code>.</span></li>
            </ol>
            <div class="xtb-path-col">
                <span style="font-size: 11px; color: ${isDarkTheme ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)"};">Default location:</span>
                <div class="xtb-path-row">
                    <span class="xtb-path" id="xtb-path-text">%AppData%\\MscrmTools\\XrmToolBox\\Connections\\ConnectionsList.xml</span>
                    <button class="copy-path-btn" id="copy-path-btn" title="Copy path" aria-label="Copy path"
                        data-path="%AppData%\\MscrmTools\\XrmToolBox\\Connections\\ConnectionsList.xml">
                        <svg viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" id="copy-path-icon">
                            <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h6A1.5 1.5 0 0 1 13 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-6A1.5 1.5 0 0 1 4 12.5v-8ZM5.5 4a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-6ZM2 6.5A1.5 1.5 0 0 1 3.5 5H4v1h-.5a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h6a.5.5 0 0 0 .5-.5V14h1v.5A1.5 1.5 0 0 1 10 16H4a1.5 1.5 0 0 1-1.5-1.5v-8Z"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-footer">
        <button id="cancel-import-source-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="confirm-import-source-btn" class="fluent-button fluent-button-primary">Next</button>
    </div>
</div>
</body>`;

    return { styles: styles + extraStyles, body };
}
