export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Returns the view markup (styles + body) for the select multi-connection modal BrowserWindow.
 */
export function getSelectMultiConnectionModalView(): ModalViewTemplate {
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

    .info-message {
        padding: 12px;
        border-radius: 8px;
        background: rgba(14, 99, 156, 0.12);
        border: 1px solid rgba(14, 99, 156, 0.3);
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        line-height: 1.5;
        margin-bottom: 16px;
    }

    .connection-section {
        margin-bottom: 24px;
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
    }

    .connection-item {
        padding: 16px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .connection-item:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.16);
    }

    .connection-item.active {
        background: rgba(14, 99, 156, 0.15);
        border-color: #0e639c;
    }

    .connection-item.selected {
        background: rgba(14, 99, 156, 0.25);
        border-color: #1177bb;
    }

    .connection-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
    }

    .connection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
    }

    .connection-name {
        font-size: 15px;
        font-weight: 600;
        color: #fff;
    }

    .connection-env-badge {
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .env-dev {
        background: rgba(0, 120, 212, 0.2);
        color: #4cc2ff;
    }

    .env-test {
        background: rgba(255, 185, 0, 0.2);
        color: #ffb900;
    }

    .env-uat {
        background: rgba(255, 140, 0, 0.2);
        color: #ff8c00;
    }

    .env-production {
        background: rgba(232, 17, 35, 0.2);
        color: #ff4343;
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
    <div class="modal-footer">
        <button id="cancel-select-multi-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="connect-multi-connection-btn" class="fluent-button fluent-button-primary" disabled>Connect</button>
    </div>
</div>`;

    return { styles, body };
}
