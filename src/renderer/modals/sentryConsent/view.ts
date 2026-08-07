import { getModalStyles } from "../sharedStyles";

export interface SentryConsentModalViewModel {
    isDarkTheme: boolean;
    appVersion: string;
    platform: string;
    arch: string;
}

export function getSentryConsentModalView(model: SentryConsentModalViewModel): { styles: string; body: string } {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    .modal-body {
        font-size: 13px;
    }
    .telemetry-consent-list {
        margin: 0;
        padding-left: 20px;
        display: grid;
        gap: 8px;
    }
    .telemetry-consent-list li {
        line-height: 1.5;
    }
    .telemetry-consent-note {
        line-height: 1.6;
    }
    .telemetry-consent-details {
        background: rgba(0, 120, 212, 0.06);
        border: 1px solid rgba(0, 120, 212, 0.18);
        border-radius: 6px;
        padding: 10px 14px;
        margin-bottom: 12px;
    }
    .telemetry-consent-details-title {
        margin: 0 0 6px;
        font-size: 12px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-muted, #666);
        color: ${model.isDarkTheme ? `rgba(255, 255, 255, 0.6)` : "#666"};
    }
    .telemetry-consent-list {
        margin: 0;
        padding-left: 18px;
        font-size: 13px;
        line-height: 1.6;
    }
    .telemetry-consent-prefooter {
        margin: 0;
        font-size: 12px;
        line-height: 1.45;
        color: ${model.isDarkTheme ? `rgba(255, 255, 255, 0.6)` : "#666"};
    }
    .modal-footer {
        border-top: 1px solid ${model.isDarkTheme ? "#3a3a3a" : "#e0e0e0"};
        padding-top: 12px;
    }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Privacy Choice</p>
            <h3>Help Improve Power Platform ToolBox</h3>
        </div>
    </div>
    <div class="modal-body">
        <p class="telemetry-consent-note">
            We'd like to collect anonymous diagnostic data to help us find and fix issues faster.
            <strong>No personal information will ever be collected.</strong>
        </p>
        <div class="telemetry-consent-details">
            <p class="telemetry-consent-details-title">What will be captured:</p>
            <ul class="telemetry-consent-list">
                <li>Install ID (anonymous unique identifier)</li>
                <li>Installed version</li>
                <li>Operating system</li>
                <li>CPU architecture</li>
                <li>Warnings and errors only (no user data)</li>
            </ul>
        </div>
        <p class="telemetry-consent-prefooter">
            You can change this preference at any time in
            <strong>Settings &rarr; Telemetry</strong>
            <br>Full telemetry starts after the next app restart.
        </p>
    </div>
    <div class="modal-footer">
        <button id="sentry-consent-no-btn" class="fluent-button fluent-button-secondary">No</button>
        <button id="sentry-consent-yes-btn" class="fluent-button fluent-button-primary">Yes</button>
    </div>
</div>`;

    return { styles, body };
}
