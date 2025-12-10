export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the add connection modal BrowserWindow.
 */
export function getAddConnectionModalView(): ModalViewTemplate {
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

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }

    label {
        font-size: 13px;
        color: rgba(255, 255, 255, 0.8);
    }

    .modal-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        background: rgba(255, 255, 255, 0.05);
        color: #fff;
        font-size: 14px;
    }

    .modal-input:focus {
        outline: 2px solid #0e639c;
        border-color: transparent;
    }

    .field-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .password-wrapper {
        position: relative;
    }

    .password-toggle-btn {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        border: none;
        background: transparent;
        cursor: pointer;
        color: rgba(255, 255, 255, 0.7);
        font-size: 16px;
    }

    .modal-footer {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .footer-spacer {
        flex: 1;
    }

    .modal-feedback {
        display: none;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 77, 109, 0.35);
        background: rgba(255, 77, 109, 0.12);
        color: #ffb3c1;
        font-size: 13px;
        line-height: 1.4;
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

    .fluent-button-primary {
        background: #0e639c;
        color: #fff;
    }

    .fluent-button-primary:hover {
        background: #1177bb;
    }

    .fluent-button-secondary {
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
    }

    .fluent-button-secondary:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .fluent-button-ghost {
        background: transparent;
        color: rgba(255, 255, 255, 0.8);
    }

    .section-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(255, 255, 255, 0.5);
    }

    .helper-text {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: -6px;
        margin-bottom: 8px;
    }

    select.modal-input option {
        background: #1f1f23;
        color: #fff;
    }
</style>`;

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
