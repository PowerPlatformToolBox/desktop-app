import { getModalStyles } from "../sharedStyles";

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
    isInstalled: boolean;
    isSupported?: boolean;
    readmeUrl?: string;
    isDarkTheme: boolean;
    repository?: string;
    website?: string;
    rating?: number;
}

export function getToolDetailModalView(model: ToolDetailModalViewModel): ModalViewTemplate {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    /* Tool detail specific styles */

    .tool-detail-modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 28px;
        background: ${model.isDarkTheme ? "rgba(20, 20, 24, 0.95)" : "rgba(255, 255, 255, 0.95)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 40px 90px rgba(0, 0, 0, ${model.isDarkTheme ? "0.65" : "0.25"});
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
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin: 0;
    }

    .tool-detail-name {
        margin: 0;
        font-size: 28px;
        font-weight: 600;
        color: ${model.isDarkTheme ? "#fff" : "#000"};
    }

    .tool-detail-description {
        margin: 0;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
        font-size: 15px;
        line-height: 1.5;
    }

    .tool-detail-authors {
        margin: 0;
        font-size: 13px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.75)"};
    }

    .tool-detail-meta-list,
    .tool-detail-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .tool-detail-meta-list {
        font-size: 12px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)"};
    }

    .tool-detail-meta-list span {
        display: inline-flex;
        align-items: center;
    }

    .tool-detail-meta-list span + span::before {
        content: "•";
        margin: 0 6px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.45)"};
    }

    .tool-detail-tags span {
        border-radius: 999px;
        padding: 4px 12px;
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"};
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        font-size: 12px;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.85)"};
    }

    .tool-detail-actions {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
    }

    .tool-installed-badge {
        border: 1px solid rgba(16, 124, 16, 0.35);
        background: #107c10;
        color: white;
        padding: 6px 16px;
        border-radius: 4px;
        font-size: 13px;
        display: inline-flex;
        align-items: center;
    }

    .tool-installed-badge::before {
        content: "✓";
        margin-right: 6px;
    }

    .tool-detail-links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        font-size: 13px;
    }

    .tool-detail-link {
        color: ${model.isDarkTheme ? "#a6c8ff" : "#004578"};
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
    }

    .tool-detail-link:hover {
        text-decoration: underline;
    }

    .tool-detail-icon-shell {
        width: 96px;
        height: 96px;
        border-radius: 20px;
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .tool-detail-icon-shell img {
        width: 80px;
        height: 80px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        object-fit: contain;
    }

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
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .tool-detail-readable {
        flex: 1;
        overflow-y: auto;
        padding-right: 6px;
    }

    .tool-detail-readme-card {
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.04)"};
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border-radius: 16px;
        padding: 20px;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow: hidden;
    }

    .tool-detail-readme-card h3 {
        margin-top: 0;
        margin-bottom: 16px;
    }

    .markdown-content {
        line-height: 1.6;
        font-size: 14px;
        color: ${model.isDarkTheme ? "#f3f3f3" : "#1f1f1f"};
        flex: 1;
        min-height: 0;
        overflow-y: auto;
    }

    .markdown-content h1,
    .markdown-content h2,
    .markdown-content h3,
    .markdown-content h4 {
        margin-top: 24px;
        margin-bottom: 12px;
    }

    .markdown-content pre {
        background: ${model.isDarkTheme ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.1)"};
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
    }

</style>`;

    const badgeMarkup = model.metaBadges.map((badge) => `<span>${badge}</span>`).join("");
    const tagsMarkup = model.categories.length ? model.categories.map((tag) => `<span>${tag}</span>`).join("") : "";

    const readmePlaceholder = model.readmeUrl ? "Loading README..." : "README is not available for this tool.";

    // Add rating badge with reviews link
    let ratingsHtml = "";
    if (model.rating !== undefined) {
        ratingsHtml = `<span>${model.rating.toFixed(1)} rating</span>`;
    }

    const linkItems: string[] = [];
    linkItems.push(`<a id="tool-detail-review-link" class="tool-detail-link" href="#" role="button">Leave a review</a>`);
    if (model.repository) {
        linkItems.push(`<a id="tool-detail-repo-link" class="tool-detail-link" href="#" role="button">Repository</a>`);
    }
    if (model.website) {
        linkItems.push(`<a id="tool-detail-website-link" class="tool-detail-link" href="#" role="button">Website</a>`);
    }

    const linksMarkup = linkItems.length ? `<div class="tool-detail-links">${linkItems.join("<span>•</span>")}</div>` : "";

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
                ${badgeMarkup || ratingsHtml ? `<div class="tool-detail-meta-list">${badgeMarkup}${ratingsHtml}</div>` : ""}
                <div class="tool-detail-actions">
                    <button id="tool-detail-install-btn" class="fluent-button fluent-button-primary" ${model.isInstalled ? 'style="display:none"' : ""} ${model.isSupported === false ? 'disabled title="This tool is not compatible with your version of Power Platform ToolBox"' : ""}>Install</button>
                    <span id="tool-detail-installed-badge" class="tool-installed-badge" ${model.isInstalled ? "" : 'style="display:none"'}>Installed</span>
                </div>
                ${linksMarkup}
            </div>
        </div>
        <button id="tool-detail-close-btn" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="tool-detail-body">
        <div class="tool-detail-readme-card">
            <h3>README</h3>
            <div id="tool-detail-readme-content" class="markdown-content">${readmePlaceholder}</div>
        </div>
    </div>
</div>`;

    return { styles, body };
}
