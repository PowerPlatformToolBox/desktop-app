import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the select multi-connection modal BrowserWindow.
 */
export function getSelectMultiConnectionModalView(isDarkTheme: boolean): ModalViewTemplate {
    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    /* Additional styles specific to multi-connection modal */
    .connections-container {
        display: flex;
        gap: 16px;
        flex: 1;
    }

    .connection-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .section-label {
        font-size: 14px;
        font-weight: 600;
        color: #fff;
        margin-bottom: 12px;
        display: block;
    }

    .connection-badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-left: 8px;
    }

    .connection-badge.primary {
        background: rgba(14, 99, 156, 0.2);
        color: #4cc2ff;
    }

    .connection-badge.secondary {
        background: rgba(255, 140, 0, 0.2);
        color: #ff8c00;
    }

    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: rgba(255, 255, 255, 0.6);
    }

    .empty-state p {
        margin: 8px 0;
    }

    .connection-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }

    .connection-item {
        padding: 16px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        transition: all 0.2s ease;
        position: relative;
    }

    .connection-item:not(.authenticated):hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.16);
    }

    .connection-item.authenticated {
        background: rgba(14, 99, 156, 0.15);
        border-color: #0e639c;
    }

    .connection-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
    }

    .connection-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 8px;
        gap: 8px;
    }

    .connection-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .connection-name {
        font-size: 15px;
        font-weight: 600;
        color: #fff;
    }

    .connection-actions {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .connect-button {
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        padding: 6px 14px;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
        background: #0e639c;
        color: #fff;
        white-space: nowrap;
    }

    .connect-button:hover:not(:disabled) {
        background: #1177bb;
    }

    .connect-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .connected-badge {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        background: rgba(16, 124, 16, 0.2);
        color: #4ade80;
        white-space: nowrap;
    }

    .connected-badge svg {
        width: 14px;
        height: 14px;
        fill: currentColor;
    }

    .connection-env-badge {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .env-dev {
        background: ${isDarkTheme ? "rgba(46, 125, 50, 0.2)" : "rgba(46, 125, 50, 0.2)"};
        color: ${isDarkTheme ? "#2e7d32" : "#2e7d32"};
    }

    .env-test {
        background: ${isDarkTheme ? "rgba(255, 179, 0, 0.2)" : "rgba(245, 124, 0, 0.2)"};
        color: ${isDarkTheme ? "#ffb300" : "#f57c00"};
    }

    .env-uat {
        background: ${isDarkTheme ? "rgba(2, 136, 209, 0.2)" : "rgba(2, 119, 189, 0.2)"};
        color: ${isDarkTheme ? "#0288d1" : "#0277bd"};
    }

    .env-production {
        background: ${isDarkTheme ? "rgba(198, 40, 40, 0.2)" : "rgba(198, 40, 40, 0.2)"};
        color: ${isDarkTheme ? "#c62828" : "#c62828"};
    }

    .env-sandbox {
        background: ${isDarkTheme ? "rgba(2, 136, 209, 0.2)" : "rgba(2, 119, 189, 0.2)"};
        color: ${isDarkTheme ? "#0288d1" : "#0277bd"};
    }

    .env-development {
        background: ${isDarkTheme ? "rgba(46, 125, 50, 0.2)" : "rgba(46, 125, 50, 0.2)"};
        color: ${isDarkTheme ? "#2e7d32" : "#2e7d32"};
    }

    .connection-url {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.6);
        margin-bottom: 8px;
        word-break: break-all;
    }

    .connection-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.5);
    }

    .connection-meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .auth-type-badge {
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 11px;
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
            <p class="modal-eyebrow">Multi-Connection Required</p>
            <h3>Select Connections</h3>
        </div>
        <button id="close-select-multi-connection-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div class="info-message">
            This tool requires two connections: a primary connection and a secondary connection. Please select both connections to continue.
        </div>
        
        <div class="connections-container">
            <div class="connection-section">
                <span class="section-label">
                    Primary Connection
                    <span class="connection-badge primary">Required</span>
                </span>
                <div id="primary-connections-list" class="connection-list">
                    <!-- Primary connections will be populated here -->
                </div>
            </div>

            <div class="connection-section">
                <span class="section-label">
                    Secondary Connection
                    <span class="connection-badge secondary">Required</span>
                </span>
                <div id="secondary-connections-list" class="connection-list">
                    <!-- Secondary connections will be populated here -->
                </div>
            </div>
        </div>
    </div>
    <div class="modal-footer">
        <button id="cancel-select-multi-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="confirm-multi-connection-btn" class="fluent-button fluent-button-primary" disabled>Confirm</button>
    </div>
</div>`;

    return { styles, body };
}
