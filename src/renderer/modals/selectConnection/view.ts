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
        <div class="modal-search-container">
            <div class="modal-search-bar">
                <input type="text" id="select-connection-search" class="modal-search-input" placeholder="Search connections..." />
                <button type="button" id="select-connection-filter-btn" class="modal-search-filter-btn" aria-label="Filters and sorting" aria-haspopup="true" aria-expanded="false" aria-controls="select-connection-filter-dropdown">
                    <svg class="modal-filter-icon" viewBox="0 0 24 24" focusable="false">
                        <path d="M4 5h16l-6 7v5l-4 2v-7z" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
            <div class="modal-filter-dropdown" id="select-connection-filter-dropdown" style="display: none;">
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Sort By</div>
                    <select id="select-connection-sort" class="modal-filter-select">
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="name-desc">Name (Z-A)</option>
                        <option value="environment">Environment Type</option>
                    </select>
                </div>
                <div class="modal-filter-divider"></div>
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Environment</div>
                    <select id="select-connection-env-filter" class="modal-filter-select">
                        <option value="">All Environments</option>
                        <option value="Dev">Dev</option>
                        <option value="Test">Test</option>
                        <option value="UAT">UAT</option>
                        <option value="Production">Production</option>
                    </select>
                </div>
                <div class="modal-filter-divider"></div>
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Authentication</div>
                    <select id="select-connection-auth-filter" class="modal-filter-select">
                        <option value="">All Auth Types</option>
                        <option value="interactive">Microsoft Login</option>
                        <option value="clientSecret">Client Secret</option>
                        <option value="usernamePassword">Username/Password</option>
                    </select>
                </div>
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
