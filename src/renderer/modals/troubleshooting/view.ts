import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface TroubleshootingModalViewModel {
    isDarkTheme: boolean;
}

export function getTroubleshootingModalView(model: TroubleshootingModalViewModel): ModalViewTemplate {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    /* Troubleshooting modal specific styles */

    .troubleshooting-modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        background: ${model.isDarkTheme ? "#1f1f23" : "#ffffff"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 30px 80px rgba(0, 0, 0, ${model.isDarkTheme ? "0.6" : "0.15"});
    }

    .troubleshooting-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
    }

    .troubleshooting-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin: 0;
    }

    .troubleshooting-header h3 {
        margin: 4px 0 0;
        font-size: 20px;
        font-weight: 600;
    }

    .troubleshooting-body {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }

    .troubleshooting-intro {
        padding: 16px;
        border-radius: 8px;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.15)" : "rgba(14, 99, 156, 0.1)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(14, 99, 156, 0.3)" : "rgba(14, 99, 156, 0.2)"};
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
        font-size: 13px;
        line-height: 1.5;
        margin-bottom: 20px;
    }

    .checks-section {
        margin-bottom: 24px;
    }

    .checks-section h4 {
        font-size: 14px;
        font-weight: 600;
        margin: 0 0 12px 0;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
    }

    .check-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        margin-bottom: 8px;
        transition: all 0.2s ease;
    }

    .check-status-icon {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .check-status-icon.pending {
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.4)"};
    }

    .check-status-icon.loading {
        animation: spin 1s linear infinite;
    }

    .check-status-icon.success {
        color: #107c10;
    }

    .check-status-icon.error {
        color: #d13438;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .check-content {
        flex: 1;
        min-width: 0;
    }

    .check-name {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 4px 0;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
    }

    .check-message {
        font-size: 12px;
        margin: 0;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        line-height: 1.4;
    }

    .check-message.success {
        color: #107c10;
    }

    .check-message.error {
        color: #d13438;
    }

    .troubleshooting-footer {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: flex-end;
        padding-top: 12px;
        border-top: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
    }

    .retry-button {
        padding: 10px 18px;
        border-radius: 8px;
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)"};
        color: ${model.isDarkTheme ? "#fff" : "#000"};
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .retry-button:hover:not(:disabled) {
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)"};
    }

    .retry-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .icon-svg {
        width: 20px;
        height: 20px;
        fill: currentColor;
    }
</style>`;

    const body = `
<div class="troubleshooting-modal-panel">
    <div class="troubleshooting-header">
        <div>
            <p class="troubleshooting-eyebrow">Help & Support</p>
            <h3>Troubleshooting</h3>
        </div>
        <button id="close-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="troubleshooting-body">
        <div class="troubleshooting-intro">
            This tool checks critical connectivity and configuration to help diagnose issues with marketplace tools loading.
            Click "Run Checks" to begin troubleshooting.
        </div>
        
        <div class="checks-section">
            <h4>Configuration Checks</h4>
            
            <div class="check-item" id="check-user-settings">
                <div class="check-status-icon pending" id="check-user-settings-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">User Settings</p>
                    <p class="check-message" id="check-user-settings-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-tool-settings">
                <div class="check-status-icon pending" id="check-tool-settings-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Tool Settings</p>
                    <p class="check-message" id="check-tool-settings-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-connections">
                <div class="check-status-icon pending" id="check-connections-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Connections Storage</p>
                    <p class="check-message" id="check-connections-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-sentry">
                <div class="check-status-icon pending" id="check-sentry-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Sentry Logging</p>
                    <p class="check-message" id="check-sentry-message">Ready to check</p>
                </div>
            </div>
        </div>

        <div class="checks-section">
            <h4>Connectivity Checks</h4>
            
            <div class="check-item" id="check-supabase">
                <div class="check-status-icon pending" id="check-supabase-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Supabase API Connectivity</p>
                    <p class="check-message" id="check-supabase-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-registry">
                <div class="check-status-icon pending" id="check-registry-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Local Registry File</p>
                    <p class="check-message" id="check-registry-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-download">
                <div class="check-status-icon pending" id="check-download-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Tool Download from GitHub Releases</p>
                    <p class="check-message" id="check-download-message">Ready to check</p>
                </div>
            </div>

            <div class="check-item" id="check-fallback">
                <div class="check-status-icon pending" id="check-fallback-icon">
                    <svg class="icon-svg" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" fill="none"/>
                    </svg>
                </div>
                <div class="check-content">
                    <p class="check-name">Fallback API Connectivity</p>
                    <p class="check-message" id="check-fallback-message">Ready to check</p>
                </div>
            </div>
        </div>
    </div>
    <div class="troubleshooting-footer">
        <button id="retry-checks-btn" class="retry-button">Run Checks</button>
        <button id="close-btn" class="fluent-button fluent-button-secondary">Close</button>
    </div>
</div>`;

    return { styles, body };
}
