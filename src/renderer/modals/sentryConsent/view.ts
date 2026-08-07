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
            <h3>Help Improve Power Platform ToolBox</h3>
        </div>
    </div>
    <div class="modal-body">
        <p class="telemetry-consent-note">
            We'd like to collect anonymous diagnostic data to help us find and fix issues faster.
            <strong>No personal information will ever be collected.</strong>
        </p>
        <p class="telemetry-consent-note">What will be captured:</p>
        <ul class="telemetry-consent-list">
            <li>Install ID (anonymous unique identifier)</li>
            <li>Installed version (${model.appVersion})</li>
            <li>Operating system (${model.platform})</li>
            <li>CPU architecture (${model.arch})</li>
            <li>Warning and error logs</li>
        </ul>
        <p class="telemetry-consent-note">
            You can change this preference at any time in
            <strong>Settings &rarr; Telemetry</strong>
        </p>
        <p class="telemetry-consent-note">
            No existing data will be backfilled. Telemetry collection starts after the next app restart.
        </p>
    </div>
    <div class="modal-footer">
        <button id="sentry-consent-no-btn" class="fluent-button fluent-button-secondary">No</button>
        <button id="sentry-consent-yes-btn" class="fluent-button fluent-button-primary">Yes</button>
    </div>
</div>`;

    return { styles, body };
}
