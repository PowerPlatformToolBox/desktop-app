import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the add connection modal BrowserWindow.
 */
export function getAddConnectionModalView(isDarkTheme: boolean): ModalViewTemplate {
    const styles = getModalStyles(isDarkTheme);

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Connections</p>
            <h3>Add Dataverse Connection</h3>
        </div>
        <button id="close-connection-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div class="form-group">
            <label for="connection-name">Connection Name</label>
            <input type="text" id="connection-name" class="modal-input" placeholder="Production" />
        </div>
        <div class="form-group">
            <label for="connection-url">Environment URL</label>
            <input type="text" id="connection-url" class="modal-input" placeholder="https://org.crm.dynamics.com" />
        </div>
        <div class="form-group">
            <label for="connection-authentication-type">Authentication Type</label>
            <select id="connection-authentication-type" class="modal-input">
                <option value="interactive">Microsoft Login Prompt</option>
                <option value="clientSecret">Client ID/Secret</option>
                <option value="usernamePassword">Username/Password</option>
            </select>
        </div>
        <div class="form-group">
            <label for="connection-environment">Environment</label>
            <select id="connection-environment" class="modal-input">
                <option value="Dev">Dev</option>
                <option value="Test">Test</option>
                <option value="UAT">UAT</option>
                <option value="Production">Production</option>
            </select>
        </div>
        <div id="interactive-fields" class="field-group" style="display: none">
            <label for="connection-optional-client-id">Optional Client ID (override)</label>
            <input type="text" id="connection-optional-client-id" class="modal-input" placeholder="client-id" />
            <p class="helper-text">Provide when you need to override the default Azure AD application ID.</p>
        </div>
        <div id="client-secret-fields" class="field-group" style="display: none">
            <span class="section-label">Client Secret Authentication</span>
            <label for="connection-client-id">Client ID</label>
            <input type="text" id="connection-client-id" class="modal-input" placeholder="00000000-0000-0000-0000-000000000000" />
            <label for="connection-client-secret">Client Secret</label>
            <div class="password-wrapper">
                <input type="password" id="connection-client-secret" class="modal-input" placeholder="client-secret" />
                <button type="button" id="toggle-client-secret" class="password-toggle-btn" aria-label="Toggle visibility">👁️</button>
            </div>
            <label for="connection-tenant-id">Tenant ID</label>
            <input type="text" id="connection-tenant-id" class="modal-input" placeholder="tenant-id" />
        </div>
        <div id="username-password-fields" class="field-group" style="display: none">
            <span class="section-label">Username & Password</span>
            <label for="connection-username">Username</label>
            <input type="text" id="connection-username" class="modal-input" placeholder="user@domain.com" />
            <label for="connection-password">Password</label>
            <div class="password-wrapper">
                <input type="password" id="connection-password" class="modal-input" placeholder="password" />
                <button type="button" id="toggle-password" class="password-toggle-btn" aria-label="Toggle visibility">👁️</button>
            </div>
            <label for="connection-optional-client-id">Optional Client ID (override)</label>
            <input type="text" id="connection-optional-client-id" class="modal-input" placeholder="client-id" />
            <p class="helper-text">Provide when you need to override the default Azure AD application ID.</p>
        </div>
    </div>
    <div id="connection-test-feedback" class="modal-feedback" role="alert" aria-live="polite"></div>
    <div class="modal-footer">
        <button id="test-connection-btn" class="fluent-button fluent-button-ghost" style="display: none">Test Connection</button>
        <span class="footer-spacer"></span>
        <button id="cancel-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="confirm-connection-btn" class="fluent-button fluent-button-primary">Add</button>
    </div>
</div>`;

    return { styles, body };
}
