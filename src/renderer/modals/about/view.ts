import { getModalStyles } from "../sharedStyles";

export interface AboutModalViewModel {
    appVersion: string;
    installId: string;
    locale: string;
    electronVersion: string;
    nodeVersion: string;
    chromeVersion: string;
    platform: string;
    arch: string;
    osVersion: string;
    isDarkTheme: boolean;
}

export interface AboutModalViewTemplate {
    styles: string;
    body: string;
}

export function getAboutModalView(model: AboutModalViewModel): AboutModalViewTemplate {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(4px);
    }

    .about-modal-panel {
        width: var(--modal-panel-width, 480px);
        height: var(--modal-panel-height, 480px);
        max-width: calc(100vw - 48px);
        max-height: calc(100vh - 48px);
        display: flex;
        flex-direction: column;
        background: ${model.isDarkTheme ? "rgba(20, 20, 24, 0.97)" : "rgba(255, 255, 255, 0.97)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 40px 90px rgba(0, 0, 0, ${model.isDarkTheme ? "0.65" : "0.25"});
        overflow: hidden;
        border-radius: 8px;
    }

    .about-modal-hero {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 24px 28px 20px;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.18)" : "rgba(14, 99, 156, 0.08)"};
        border-bottom: 1px solid ${model.isDarkTheme ? "rgba(14, 99, 156, 0.35)" : "rgba(14, 99, 156, 0.2)"};
    }

    .about-modal-app-icon {
        width: 52px;
        height: 52px;
        flex-shrink: 0;
        border-radius: 14px;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.5)" : "rgba(14, 99, 156, 0.15)"};
        display: flex;
        align-items: center;
        justify-content: center;
        color: #0e639c;
    }

    .about-modal-hero-text {
        flex: 1;
        min-width: 0;
    }

    .about-modal-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.55)"};
        margin: 0 0 4px;
    }

    .about-modal-title {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: ${model.isDarkTheme ? "#ffffff" : "#1f1f1f"};
        line-height: 1.2;
    }

    .about-modal-version-badge {
        display: inline-block;
        margin-top: 6px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.45)" : "rgba(14, 99, 156, 0.12)"};
        color: ${model.isDarkTheme ? "#6eb3e6" : "#0e639c"};
        border: 1px solid ${model.isDarkTheme ? "rgba(14, 99, 156, 0.5)" : "rgba(14, 99, 156, 0.25)"};
    }

    .about-modal-close-btn {
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.07)"};
        border: none;
        color: ${model.isDarkTheme ? "#fff" : "#000"};
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        flex-shrink: 0;
        align-self: flex-start;
    }

    .about-modal-close-btn:hover {
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.18)"};
    }

    .about-modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .about-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .about-section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
        margin: 0;
    }

    .about-info-table {
        display: flex;
        flex-direction: column;
        gap: 0;
        padding: 4px 0;
        border-radius: 10px;
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.07)"};
        overflow: hidden;
    }

    .about-info-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 14px;
        font-size: 13px;
    }

    .about-info-row + .about-info-row {
        border-top: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
    }

    .about-info-label {
        min-width: 110px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.55)"};
        flex-shrink: 0;
    }

    .about-info-value {
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.85)"};
        font-family: "Consolas", "SF Mono", "Fira Code", monospace;
        font-size: 12px;
        word-break: break-all;
    }

    .about-modal-footer {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
        padding: 16px 28px;
        border-top: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
    }
</style>`;

    const appIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

    const body = `
<div class="modal-overlay">
<div class="about-modal-panel">
    <div class="about-modal-hero">
        <div class="about-modal-app-icon">${appIcon}</div>
        <div class="about-modal-hero-text">
            <p class="about-modal-eyebrow">About</p>
            <h2 class="about-modal-title">Power Platform ToolBox</h2>
            <span class="about-modal-version-badge">Version ${escapeHtml(model.appVersion)}</span>
        </div>
        <button id="about-close-btn" class="about-modal-close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="about-modal-body">
        <div class="about-section">
            <p class="about-section-title">Environment</p>
            <div class="about-info-table">
                <div class="about-info-row">
                    <span class="about-info-label">Electron</span>
                    <span class="about-info-value">${escapeHtml(model.electronVersion)}</span>
                </div>
                <div class="about-info-row">
                    <span class="about-info-label">Node.js</span>
                    <span class="about-info-value">${escapeHtml(model.nodeVersion)}</span>
                </div>
                <div class="about-info-row">
                    <span class="about-info-label">Chromium</span>
                    <span class="about-info-value">${escapeHtml(model.chromeVersion)}</span>
                </div>
            </div>
        </div>
        <div class="about-section">
            <p class="about-section-title">System</p>
            <div class="about-info-table">
                <div class="about-info-row">
                    <span class="about-info-label">OS</span>
                    <span class="about-info-value">${escapeHtml(model.platform)} ${escapeHtml(model.arch)}</span>
                </div>
                <div class="about-info-row">
                    <span class="about-info-label">OS Version</span>
                    <span class="about-info-value">${escapeHtml(model.osVersion)}</span>
                </div>
                <div class="about-info-row">
                    <span class="about-info-label">Locale</span>
                    <span class="about-info-value">${escapeHtml(model.locale)}</span>
                </div>
            </div>
        </div>
        <div class="about-section">
            <p class="about-section-title">Diagnostics</p>
            <div class="about-info-table">
                <div class="about-info-row">
                    <span class="about-info-label">Install ID</span>
                    <span class="about-info-value">${escapeHtml(model.installId)}</span>
                </div>
            </div>
        </div>
    </div>
    <div class="about-modal-footer">
        <button id="about-copy-btn" class="fluent-button fluent-button-secondary">Copy to Clipboard</button>
        <button id="about-ok-btn" class="fluent-button fluent-button-primary">OK</button>
    </div>
</div>
</div>`;

    return { styles, body };
}

function escapeHtml(text: string): string {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
