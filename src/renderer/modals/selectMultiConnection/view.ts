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
        color: ${isDarkTheme ? "#fff" : "#000"};
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

    .connection-list {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }

    .connection-item:not(.authenticated):hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        border-color: ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
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
        align-items: flex-start;
        gap: 8px;
    }

    .connection-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .connected-badge {
        background: rgba(16, 124, 16, 0.2);
    }

    .filter-section {
        margin-bottom: 12px;
    }

    .filter-section input,
    .filter-section select {
        width: 100%;
    }

    .filter-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
    }

    .filter-row select {
        flex: 1;
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
        
        <div class="filter-section">
            <input type="text" id="multi-connection-search" class="fluent-input" placeholder="Search connections..." />
            <div class="filter-row">
                <select id="multi-connection-env-filter" class="fluent-select">
                    <option value="">All Environments</option>
                    <option value="Dev">Dev</option>
                    <option value="Test">Test</option>
                    <option value="UAT">UAT</option>
                    <option value="Production">Production</option>
                </select>
                <select id="multi-connection-auth-filter" class="fluent-select">
                    <option value="">All Auth Types</option>
                    <option value="interactive">Microsoft Login</option>
                    <option value="clientSecret">Client Secret</option>
                    <option value="usernamePassword">Username/Password</option>
                </select>
            </div>
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
