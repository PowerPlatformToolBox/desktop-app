export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface ToolDetailModalViewModel {
    toolId: string;
    name: string;
    description: string;
    authors: string;
    iconHtml: string;
    metaBadges: string[];
    categories: string[];
    readmeHtml: string;
    isInstalled: boolean;
}

export function getToolDetailModalView(model: ToolDetailModalViewModel): ModalViewTemplate {
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

    .tool-detail-modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 28px;
        background: rgba(20, 20, 24, 0.95);
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        box-shadow: 0 40px 90px rgba(0, 0, 0, 0.65);
    }

    .tool-detail-modal-header {
        display: flex;
        justify-content: space-between;
        gap: 16px;
    }

    .tool-detail-modal-header-left {
        display: flex;
        gap: 32px;
    }

    .tool-detail-modal-meta {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .tool-detail-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
    }

    .tool-detail-name {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        color: #fff;
    }

    .tool-detail-description {
        margin: 0;
        color: rgba(255, 255, 255, 0.8);
        font-size: 15px;
        line-height: 1.5;
    }

    .tool-detail-authors {
        margin: 0;
        font-size: 13px;
        color: rgba(255, 255, 255, 0.75);
    }

    .tool-detail-meta-list,
    .tool-detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tool-detail-meta-list {
        font-size: 12px;
        color: rgba(255, 255, 255, 0.65);
    }

    .tool-detail-meta-list span {
        display: inline-flex;
        align-items: center;
    }

    .tool-detail-meta-list span + span::before {
        content: "•";
        margin: 0 6px;
        color: rgba(255, 255, 255, 0.45);
    }

    .tool-detail-tags span {
        border-radius: 999px;
        padding: 4px 12px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.06);
        font-size: 12px;
        color: rgba(255, 255, 255, 0.85);
    }

    .tool-detail-actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
    }

    .tool-installed-badge {
        background: rgba(16, 124, 16, 0.2);
        border: 1px solid rgba(16, 124, 16, 0.35);
        color: #9ff29f;
        padding: 6px 12px;
        border-radius: 999px;
        font-size: 13px;
    }

    .tool-detail-icon-shell {
        width: 96px;
        height: 96px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(255, 255, 255, 0.05);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .tool-detail-icon-shell img,
    .tool-detail-icon-shell span {
        width: 64px;
        height: 64px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
    }

    .tool-detail-body {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .tool-detail-readable {
        flex: 1;
        overflow-y: auto;
        padding-right: 6px;
    }

    .tool-detail-readme-card {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 16px;
        padding: 20px;
        height: 100%;
    }

    .tool-detail-readme-card h3 {
        margin-top: 0;
        margin-bottom: 16px;
    }

    .tool-detail-feedback {
        font-size: 13px;
        min-height: 18px;
        color: rgba(255, 255, 255, 0.75);
    }

    .tool-detail-feedback.error {
        color: #ff9a9a;
    }

    .markdown-content {
        line-height: 1.6;
        font-size: 14px;
        color: #f3f3f3;
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4 {
        margin-top: 24px;
        margin-bottom: 12px;
    }

    .markdown-content pre {
        background: rgba(0, 0, 0, 0.5);
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
    }

    .tool-detail-close-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
    }

    .tool-detail-close-btn:hover {
        background: rgba(255, 255, 255, 0.2);
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

    .fluent-button-primary[disabled] {
        opacity: 0.6;
        cursor: default;
    }
</style>`;

    const badgeMarkup = model.metaBadges.map((badge) => `<span>${badge}</span>`).join("");
    const tagsMarkup = model.categories.length ? model.categories.map((tag) => `<span>${tag}</span>`).join("") : "";

    const body = `
<div class="tool-detail-modal-panel" data-tool-id="${model.toolId}">
    <div class="tool-detail-modal-header">
        <div class="tool-detail-modal-header-left">
            <div class="tool-detail-icon-shell">
                <div class="tool-detail-icon">${model.iconHtml}</div>
            </div>
            <div class="tool-detail-modal-meta">
                ${tagsMarkup ? `<div class="tool-detail-tags">${tagsMarkup}</div>` : ""}
                <h2 class="tool-detail-name">${model.name}</h2>
                <p class="tool-detail-description">${model.description}</p>
                <p class="tool-detail-authors">By ${model.authors}</p>
                ${badgeMarkup ? `<div class="tool-detail-meta-list">${badgeMarkup}</div>` : ""}
                <div class="tool-detail-actions">
                    <button id="tool-detail-install-btn" class="fluent-button fluent-button-primary" ${model.isInstalled ? 'style="display:none"' : ""}>Install</button>
                    <span id="tool-detail-installed-badge" class="tool-installed-badge" ${model.isInstalled ? "" : 'style="display:none"'}>Installed</span>
                </div>
                <div id="tool-detail-feedback" class="tool-detail-feedback"></div>
            </div>
        </div>
        <button id="tool-detail-close-btn" class="tool-detail-close-btn" aria-label="Close">&times;</button>
    </div>
    <div class="tool-detail-body">
        <div class="tool-detail-readme-card">
            <h3>README</h3>
            <div id="tool-detail-readme-content" class="markdown-content">${model.readmeHtml}</div>
        </div>
    </div>
</div>`;

    return { styles, body };
}
