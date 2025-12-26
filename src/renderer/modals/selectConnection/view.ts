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
