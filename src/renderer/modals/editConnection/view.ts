import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the edit connection modal BrowserWindow.
 */
export function getEditConnectionModalView(isDarkTheme: boolean): ModalViewTemplate {
    const styles = getModalStyles(isDarkTheme);

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Connections</p>
            <h3>Edit Dataverse Connection</h3>
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
                <option value="interactive">Microsoft Login (OAuth)</option>
                <option value="clientSecret">Client ID/Secret</option>
                <option value="usernamePassword">Username/Password</option>
                <option value="connectionString">Connection String</option>
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
        <div class="field-group">
            <span class="section-label">Browser Settings (Optional)</span>
            <label for="connection-browser-type">Browser</label>
            <select id="connection-browser-type" class="modal-input">
                <option value="default">System Default</option>
                <option value="chrome">Google Chrome</option>
                <option value="edge">Microsoft Edge</option>
            </select>
            <p class="helper-text">Choose which browser to use when opening URLs with authentication. Defaults to your system's default browser.</p>
            <div id="browser-not-installed-warning" class="modal-warning" style="display: none;">
                <span>⚠️ Selected browser is not installed. URLs will open using the system default browser.</span>
            </div>
            <label for="connection-browser-profile">Browser Profile</label>
            <select id="connection-browser-profile" class="modal-input" disabled>
                <option value="">No profile needed</option>
            </select>
            <p class="helper-text">Select a browser profile to use. Profiles will be loaded when you select a browser above.</p>
        </div>
        <div id="interactive-fields" class="field-group" style="display: none">
            <span class="section-label">Microsoft Login Options</span>
            <label for="connection-username">Username / Email (Optional)</label>
            <input type="text" id="connection-username" class="modal-input" placeholder="user@domain.com" />
            <p class="helper-text">Pre-fill the login prompt with a specific email address. Leave empty to choose from browser accounts.</p>
            <label for="connection-optional-client-id">Client ID (Optional)</label>
            <input type="text" id="connection-optional-client-id" class="modal-input" placeholder="51f81489-12ee-4a9e-aaae-a2591f45987d" />
            <p class="helper-text">Override the default Azure AD App ID if needed. Leave empty to use the development app.</p>
            <label for="connection-tenant-id">Tenant ID (Optional)</label>
            <input type="text" id="connection-tenant-id" class="modal-input" placeholder="organizations" />
            <p class="helper-text">Defaults to 'organizations' for multi-tenant authentication. Specify your tenant ID for single-tenant apps.</p>
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
            <label for="connection-tenant-id-cs">Tenant ID</label>
            <input type="text" id="connection-tenant-id-cs" class="modal-input" placeholder="tenant-id" />
        </div>
        <div id="username-password-fields" class="field-group" style="display: none">
            <span class="section-label">Username & Password</span>
            <label for="connection-username-up">Username</label>
            <input type="text" id="connection-username-up" class="modal-input" placeholder="user@domain.com" />
            <label for="connection-password">Password</label>
            <div class="password-wrapper">
                <input type="password" id="connection-password" class="modal-input" placeholder="password" />
                <button type="button" id="toggle-password" class="password-toggle-btn" aria-label="Toggle visibility">👁️</button>
            </div>
            <label for="connection-optional-client-id-up">Client ID (Optional)</label>
            <input type="text" id="connection-optional-client-id-up" class="modal-input" placeholder="51f81489-12ee-4a9e-aaae-a2591f45987d" />
            <p class="helper-text">Override the default Azure AD App ID if needed. Leave empty to use the development app.</p>
            <label for="connection-tenant-id-up">Tenant ID (Optional)</label>
            <input type="text" id="connection-tenant-id-up" class="modal-input" placeholder="organizations" />
            <p class="helper-text">Defaults to 'organizations' for multi-tenant authentication. Specify your tenant ID for single-tenant apps.</p>
        </div>
        <div id="connection-string-fields" class="field-group" style="display: none">
            <span class="section-label">Connection String</span>
            <label for="connection-string-input">Connection String</label>
            <textarea id="connection-string-input" class="modal-input" rows="4" placeholder="AuthType=Office365;Username=user@domain.com;Password=password;Url=https://org.crm.dynamics.com"></textarea>
            <p class="helper-text">Enter your connection string. Supports Office365, OAuth, and ClientSecret authentication types. URL and authentication details will be extracted automatically.</p>
        </div>
    </div>
    <div id="connection-test-feedback" class="modal-feedback" role="alert" aria-live="polite"></div>
    <div class="modal-footer">
        <button id="test-connection-btn" class="fluent-button fluent-button-ghost" style="display: none">Test Connection</button>
        <span class="footer-spacer"></span>
        <button id="cancel-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="confirm-connection-btn" class="fluent-button fluent-button-primary">Save Changes</button>
    </div>
</div>`;

    return { styles, body };
}
