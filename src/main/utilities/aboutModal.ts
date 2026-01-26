/**
 * About modal view generator
 * Generates HTML for the About modal with selectable text
 */

export interface AboutModalData {
    appVersion: string;
    machineId: string;
    electronVersion: string;
    nodeVersion: string;
    chromiumVersion: string;
    platform: string;
    arch: string;
    osVersion: string;
    locale: string;
    isDarkTheme: boolean;
}

function getModalStyles(isDarkTheme: boolean): string {
    return `
<style>
    :root {
        color-scheme: ${isDarkTheme ? "dark" : "light"};
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
        color: ${isDarkTheme ? "#f3f3f3" : "#1f1f1f"};
    }

    .about-modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        background: ${isDarkTheme ? "#1f1f23" : "#ffffff"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 30px 80px rgba(0, 0, 0, ${isDarkTheme ? "0.6" : "0.15"});
    }

    .about-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
    }

    .about-modal-title-section h3 {
        margin: 0 0 4px 0;
        font-size: 20px;
        font-weight: 600;
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .about-modal-subtitle {
        margin: 0;
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
    }

    .icon-button {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border: none;
        color: ${isDarkTheme ? "#fff" : "#000"};
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
    }

    .icon-button:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.18)"};
    }

    .about-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        border-radius: 8px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        font-family: "Consolas", "Monaco", "Courier New", monospace;
        font-size: 13px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-wrap: break-word;
        user-select: text;
        cursor: text;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
    }

    .about-modal-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
    }

    .about-note {
        padding: 12px;
        border-radius: 8px;
        background: rgba(14, 99, 156, 0.12);
        border: 1px solid rgba(14, 99, 156, 0.3);
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
        font-size: 12px;
        line-height: 1.5;
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

    .fluent-button-secondary {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .fluent-button-secondary:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"};
    }
</style>`;
}

export function generateAboutModalHtml(data: AboutModalData): string {
    const infoText = `Power Platform ToolBox
Version: ${data.appVersion}
Machine ID: ${data.machineId}

Environment:
Electron: ${data.electronVersion}
Node.js: ${data.nodeVersion}
Chromium: ${data.chromiumVersion}

System:
OS: ${data.platform} ${data.arch}
OS Version: ${data.osVersion}
Locale: ${data.locale}

Note: Machine ID is used for telemetry and error tracking in Sentry.`;

    const styles = getModalStyles(data.isDarkTheme);
    const body = `
<div class="about-modal-panel">
    <div class="about-modal-header">
        <div class="about-modal-title-section">
            <h3>About Power Platform ToolBox</h3>
            <p class="about-modal-subtitle">Application Information</p>
        </div>
        <button class="icon-button" id="closeBtn" title="Close">✕</button>
    </div>
    
    <div class="about-content" id="aboutContent">${infoText}</div>
    
    <div class="about-note">
        💡 <strong>Tip:</strong> You can select and copy any text above.
    </div>

    <div class="about-modal-footer">
        <button class="fluent-button fluent-button-secondary" id="copyAllBtn">Copy All</button>
        <button class="fluent-button fluent-button-primary" id="okBtn">OK</button>
    </div>
</div>

<script>
(function() {
    // Close button handlers
    document.getElementById('closeBtn')?.addEventListener('click', () => {
        window.modalBridge?.close();
    });

    document.getElementById('okBtn')?.addEventListener('click', () => {
        window.modalBridge?.close();
    });

    // Copy all button handler
    document.getElementById('copyAllBtn')?.addEventListener('click', () => {
        const aboutContent = document.getElementById('aboutContent');
        if (aboutContent) {
            const text = aboutContent.textContent || '';
            navigator.clipboard.writeText(text).then(() => {
                const copyBtn = document.getElementById('copyAllBtn');
                if (copyBtn) {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = 'Copied!';
                    setTimeout(() => {
                        copyBtn.textContent = originalText;
                    }, 1500);
                }
            }).catch((err) => {
                console.error('Failed to copy text:', err);
            });
        }
    });
})();
</script>
`;

    return `${styles}${body}`;
}
