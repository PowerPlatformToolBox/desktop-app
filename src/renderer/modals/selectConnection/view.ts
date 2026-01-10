import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the select connection modal BrowserWindow.
 */
export function getSelectConnectionModalView(isDarkTheme: boolean): ModalViewTemplate {
    const styles = getModalStyles(isDarkTheme);

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Connections</p>
            <h3>Select Connection</h3>
        </div>
        <button id="close-select-connection-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div class="info-message">
            Please select a connection to connect to your Dataverse environment before using this tool.
        </div>
        <div style="margin-bottom: 12px;">
            <input type="text" id="select-connection-search" class="fluent-input" placeholder="Search connections..." style="width: 100%; margin-bottom: 8px;" />
            <div style="display: flex; gap: 8px;">
                <select id="select-connection-env-filter" class="fluent-select" style="flex: 1;">
                    <option value="">All Environments</option>
                    <option value="Dev">Dev</option>
                    <option value="Test">Test</option>
                    <option value="UAT">UAT</option>
                    <option value="Production">Production</option>
                </select>
                <select id="select-connection-auth-filter" class="fluent-select" style="flex: 1;">
                    <option value="">All Auth Types</option>
                    <option value="interactive">Microsoft Login</option>
                    <option value="clientSecret">Client Secret</option>
                    <option value="usernamePassword">Username/Password</option>
                </select>
            </div>
        </div>
        <div id="connections-list-container" class="connection-list">
            <!-- Connections will be populated here -->
        </div>
    </div>
    <div class="modal-footer">
        <button id="cancel-select-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="connect-selected-connection-btn" class="fluent-button fluent-button-primary" disabled>Connect</button>
    </div>
</div>`;

    return { styles, body };
}
