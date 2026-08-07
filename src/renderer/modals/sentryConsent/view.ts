import { getModalStyles } from "../sharedStyles";

export interface SentryConsentModalViewModel {
    isDarkTheme: boolean;
    appVersion: string;
    platform: string;
    arch: string;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function getSentryConsentModalView(model: SentryConsentModalViewModel): { styles: string; body: string } {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
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
        margin: 0;
        line-height: 1.6;
    }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Privacy Choice</p>
            <h3>Sentry Log Collection Consent</h3>
        </div>
    </div>
    <div class="modal-body">
        <p class="telemetry-consent-note">
            Power Platform ToolBox can send warning and error logs to Sentry to help diagnose problems. No existing data will be backfilled.
        </p>
        <p class="telemetry-consent-note">If you choose <strong>Yes</strong>, the following data will be sent:</p>
        <ul class="telemetry-consent-list">
            <li>Install ID</li>
            <li>Installed version (${escapeHtml(model.appVersion)})</li>
            <li>Operating system (${escapeHtml(model.platform)})</li>
            <li>CPU architecture (${escapeHtml(model.arch)})</li>
            <li>Warning and error logs</li>
        </ul>
        <p class="telemetry-consent-note">You can change this choice later from Settings.</p>
    </div>
    <div class="modal-footer">
        <button id="sentry-consent-no-btn" class="fluent-button fluent-button-secondary">No</button>
        <button id="sentry-consent-yes-btn" class="fluent-button fluent-button-primary">Yes</button>
    </div>
</div>`;

    return { styles, body };
}
