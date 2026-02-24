import { getModalStyles } from "../sharedStyles";

export type UpdateNotificationModalType = "available" | "downloaded";

export interface UpdateNotificationModalViewModel {
    type: UpdateNotificationModalType;
    version: string;
    currentVersion: string;
    releaseNotes?: string | null;
    isDarkTheme: boolean;
}

export interface UpdateNotificationModalViewTemplate {
    styles: string;
    body: string;
}

export function getUpdateNotificationModalView(model: UpdateNotificationModalViewModel): UpdateNotificationModalViewTemplate {
    const isAvailable = model.type === "available";

    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    .update-modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 0;
        background: ${model.isDarkTheme ? "rgba(20, 20, 24, 0.97)" : "rgba(255, 255, 255, 0.97)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 40px 90px rgba(0, 0, 0, ${model.isDarkTheme ? "0.65" : "0.25"});
        overflow: hidden;
    }

    .update-modal-hero {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 24px 28px 20px;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.18)" : "rgba(14, 99, 156, 0.08)"};
        border-bottom: 1px solid ${model.isDarkTheme ? "rgba(14, 99, 156, 0.35)" : "rgba(14, 99, 156, 0.2)"};
    }

    .update-modal-icon {
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

    .update-modal-hero-text {
        flex: 1;
        min-width: 0;
    }

    .update-modal-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.55)"};
        margin: 0 0 4px;
    }

    .update-modal-title {
        margin: 0;
        font-size: 22px;
        font-weight: 600;
        color: ${model.isDarkTheme ? "#ffffff" : "#1f1f1f"};
        line-height: 1.2;
    }

    .update-modal-version-badge {
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

    .update-modal-close-btn {
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

    .update-modal-close-btn:hover {
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.18)"};
    }

    .update-modal-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 28px;
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .update-process-banner {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 10px;
        background: ${model.isDarkTheme ? "rgba(255, 185, 0, 0.08)" : "rgba(255, 185, 0, 0.08)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 185, 0, 0.3)" : "rgba(255, 185, 0, 0.35)"};
    }

    .update-process-banner svg {
        flex-shrink: 0;
        margin-top: 1px;
        color: ${model.isDarkTheme ? "#ffc83d" : "#8b6500"};
    }

    .update-process-banner-text {
        font-size: 13px;
        line-height: 1.5;
        color: ${model.isDarkTheme ? "#ffc83d" : "#8b6500"};
    }

    .update-process-steps {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .update-process-steps-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
        margin: 0 0 4px;
    }

    .update-process-step {
        display: flex;
        align-items: flex-start;
        gap: 12px;
    }

    .update-process-step-number {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        background: ${model.isDarkTheme ? "rgba(14, 99, 156, 0.35)" : "rgba(14, 99, 156, 0.12)"};
        color: ${model.isDarkTheme ? "#6eb3e6" : "#0e639c"};
        border: 1px solid ${model.isDarkTheme ? "rgba(14, 99, 156, 0.4)" : "rgba(14, 99, 156, 0.2)"};
        margin-top: 1px;
    }

    .update-process-step-text {
        font-size: 13px;
        line-height: 1.5;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.8)"};
    }

    .update-release-notes-section {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .update-release-notes-title {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
        margin: 0;
    }

    .update-release-notes-content {
        padding: 14px 16px;
        border-radius: 10px;
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.07)"};
        font-size: 13px;
        line-height: 1.6;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.75)"};
        max-height: 140px;
        overflow-y: auto;
    }

    .update-release-notes-content p {
        margin: 0 0 8px;
    }

    .update-release-notes-content p:last-child {
        margin-bottom: 0;
    }

    .update-release-notes-content ul,
    .update-release-notes-content ol {
        margin: 0 0 8px;
        padding-left: 18px;
    }

    .update-release-notes-content li {
        margin-bottom: 4px;
    }

    .update-release-notes-link {
        display: inline-block;
        margin-top: 8px;
        font-size: 13px;
        color: ${model.isDarkTheme ? "#6eb3e6" : "#0e639c"};
        text-decoration: none;
        cursor: pointer;
    }

    .update-release-notes-link:hover {
        text-decoration: underline;
    }

    .update-modal-footer {
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: flex-end;
        padding: 16px 28px;
        border-top: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        flex-wrap: wrap;
    }

    .update-modal-progress-bar-wrap {
        display: none;
        flex-direction: column;
        gap: 6px;
        padding: 12px 28px 0;
    }

    .update-modal-progress-label {
        font-size: 12px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.6)"};
    }

    .update-modal-progress-track {
        height: 4px;
        border-radius: 999px;
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        overflow: hidden;
    }

    .update-modal-progress-fill {
        height: 100%;
        width: 0%;
        border-radius: 999px;
        background: #0e639c;
        transition: width 0.3s ease;
    }
</style>`;

    const releaseNotesHtml = buildReleaseNotesHtml(model.releaseNotes, model.version);

    const processSteps = isAvailable
        ? [
              { n: "1", text: "The update will download in the background." },
              { n: "2", text: "Once downloaded, you will be prompted to install." },
              { n: "3", text: "The app will restart automatically to apply the update." },
          ]
        : [
              { n: "1", text: "Click <strong>Restart &amp; Install</strong> to apply the update now." },
              { n: "2", text: "The app will close and restart automatically." },
              { n: "3", text: "Any in-progress work in open tools will be lost. Your app settings and connections will be preserved." },
          ];

    const heroIcon = isAvailable
        ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/>
    </svg>`
        : `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill="currentColor"/>
    </svg>`;

    const stepsHtml = processSteps.map((s) => `<div class="update-process-step"><span class="update-process-step-number">${s.n}</span><span class="update-process-step-text">${s.text}</span></div>`).join("\n");

    const bannerText = isAvailable ? "This update requires an app restart to take effect. You can choose to download now or be reminded later." : "This update has been downloaded and is ready to install. The app will restart to apply the changes.";

    const footerButtons = isAvailable
        ? `<button id="update-later-btn" class="fluent-button fluent-button-secondary">Later</button>
        <button id="update-action-btn" class="fluent-button fluent-button-primary">Download &amp; Install</button>`
        : `<button id="update-later-btn" class="fluent-button fluent-button-secondary">Install on Exit</button>
        <button id="update-action-btn" class="fluent-button fluent-button-primary">Restart &amp; Install Now</button>`;

    const body = `
<div class="update-modal-panel">
    <div class="update-modal-hero">
        <div class="update-modal-icon">${heroIcon}</div>
        <div class="update-modal-hero-text">
            <p class="update-modal-eyebrow">${isAvailable ? "Software Update" : "Ready to Install"}</p>
            <h2 class="update-modal-title">${isAvailable ? "Update Available" : "Update Downloaded"}</h2>
            <span class="update-modal-version-badge">Version ${model.version}</span>
        </div>
        <button id="update-close-btn" class="update-modal-close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="update-modal-progress-bar-wrap" id="update-progress-wrap">
        <span class="update-modal-progress-label" id="update-progress-label">Downloading update…</span>
        <div class="update-modal-progress-track"><div class="update-modal-progress-fill" id="update-progress-fill"></div></div>
    </div>
    <div class="update-modal-body">
        <div class="update-process-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>
            </svg>
            <span class="update-process-banner-text">${bannerText}</span>
        </div>
        <div class="update-process-steps">
            <p class="update-process-steps-title">What to expect</p>
            ${stepsHtml}
        </div>
        ${releaseNotesHtml}
    </div>
    <div class="update-modal-footer">
        ${footerButtons}
    </div>
</div>`;

    return { styles, body };
}

function buildReleaseNotesHtml(releaseNotes: string | null | undefined, version: string): string {
    if (!releaseNotes) {
        return "";
    }

    // releaseNotes from electron-updater can be a string (HTML or plain text) or an array of objects
    const rawText = typeof releaseNotes === "string" ? releaseNotes.trim() : "";
    if (!rawText) {
        return "";
    }

    // Extract only the ## Highlights section from the markdown-formatted release notes.
    // The release notes follow a structured format with sections like ## Highlights, ## Fixes, etc.
    const highlightsText = extractHighlightsSection(rawText);

    // Sanitize using an allowlist approach: strip all tags except safe formatting elements,
    // and strip all attributes from allowed tags to prevent XSS via event handlers or
    // javascript: URLs in the inline data URL modal context.
    const ALLOWED_TAGS = new Set(["b", "i", "em", "strong", "ul", "ol", "li", "p", "br", "code", "pre", "span"]);
    const sanitize = (html: string) =>
        html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tag: string) => {
            if (!ALLOWED_TAGS.has(tag.toLowerCase())) {
                return "";
            }
            // Keep only the tag name, strip all attributes
            const isClosing = match.startsWith("</");
            return isClosing ? `</${tag.toLowerCase()}>` : `<${tag.toLowerCase()}>`;
        });

    const fullNotesUrl = `https://github.com/PowerPlatformToolBox/desktop-app/releases/tag/v${version}`;

    if (highlightsText) {
        // Convert the extracted plain-text bullet list to basic HTML list items
        const listItems = highlightsText
            .split("\n")
            .map((line) => line.replace(/^-\s*/, "").trim())
            .filter((line) => line.length > 0)
            .map((line) => `<li>${sanitize(line)}</li>`)
            .join("\n");

        return `
<div class="update-release-notes-section">
    <p class="update-release-notes-title">Highlights</p>
    <div class="update-release-notes-content"><ul>${listItems}</ul></div>
    <a class="update-release-notes-link" href="${fullNotesUrl}">View full release notes &#8594;</a>
</div>`;
    }

    // Fallback: no structured highlights found — show sanitized raw notes with a link
    const sanitizedRaw = sanitize(rawText);
    return `
<div class="update-release-notes-section">
    <p class="update-release-notes-title">Release Notes</p>
    <div class="update-release-notes-content">${sanitizedRaw}</div>
    <a class="update-release-notes-link" href="${fullNotesUrl}">View full release notes &#8594;</a>
</div>`;
}

/**
 * Extract the content of the "## Highlights" section from markdown-formatted release notes.
 * Returns the raw bullet-list text, or an empty string if the section is not found.
 */
function extractHighlightsSection(markdown: string): string {
    // Match the ## Highlights section up to the next ## heading or end of string
    const match = /^##\s+Highlights\s*\n([\s\S]*?)(?=^##\s|\s*$)/im.exec(markdown);
    if (!match) {
        return "";
    }
    return match[1].trim();
}
