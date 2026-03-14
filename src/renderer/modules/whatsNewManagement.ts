/**
 * What's New management module
 * Renders a VS Code-style "What's New" page inside a tool detail-style tab.
 */

import { logWarn } from "../../common/logger";
import { renderMarkdownToSafeHtml, wireExternalLinks } from "../utils/markdown";
import { openToolDetailTab } from "./toolManagement";

const WHATS_NEW_TAB_ID = "whats-new";
const WHATS_NEW_TAB_TITLE = "What's New";
const WHATS_NEW_TITLE = "Check out what's new in this version";
const UPDATES_ORIGIN = process.env.PPTB_UPDATES_ORIGIN || "https://www.powerplatformtoolbox.com";
const UPDATES_WEBSITE_PATH = "/updates";
const UPDATES_MARKDOWN_PATH = "/api/updates";

function normalizeOrigin(origin: string): string {
    const trimmed = origin.trim();
    if (!trimmed) {
        return "";
    }
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeVersion(version: string): string {
    const trimmed = version.trim();
    return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

function toUpdatesSlug(version: string): string {
    // Convert a semver-ish string like 0.1.0 to the website route format v0_1_0
    // Keep it tolerant of pre-release/build metadata by converting non-alphanumerics to underscores.
    const normalized = normalizeVersion(version);
    const underscored = normalized.replace(/[^a-zA-Z0-9]+/g, "_");
    return `v${underscored}`;
}

function buildWhatsNewWebsiteUrl(version: string): string {
    const slug = toUpdatesSlug(version);
    return `${normalizeOrigin(UPDATES_ORIGIN)}${UPDATES_WEBSITE_PATH}/${encodeURIComponent(slug)}`;
}

function buildWhatsNewMarkdownUrl(version: string): string {
    const slug = toUpdatesSlug(version);
    return `${normalizeOrigin(UPDATES_ORIGIN)}${UPDATES_MARKDOWN_PATH}/${encodeURIComponent(slug)}`;
}

function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export async function openWhatsNewTab(versionOverride?: string): Promise<void> {
    const version = versionOverride || ((await window.toolboxAPI.getAppVersion().catch(() => "")) as string) || "";
    const normalizedVersion = version ? normalizeVersion(version) : "";
    const websiteUrl = normalizedVersion ? buildWhatsNewWebsiteUrl(normalizedVersion) : "";
    const markdownUrl = normalizedVersion ? buildWhatsNewMarkdownUrl(normalizedVersion) : "";

    await openToolDetailTab(
        WHATS_NEW_TAB_ID,
        WHATS_NEW_TAB_TITLE,
        (panel) => {
            const versionLabel = normalizedVersion ? `Version ${normalizedVersion}` : "Release Notes";
            const linkMarkup = websiteUrl ? `<a class="tool-detail-tab-link" href="${websiteUrl}" data-url="${websiteUrl}">Open on website</a>` : "";

            panel.innerHTML = `
                <div class="tool-detail-tab-header">
                    <div class="tool-detail-tab-header-left">
                        <div class="tool-detail-tab-meta">
                            <h2 class="tool-detail-tab-name">${WHATS_NEW_TITLE}</h2>
                            <p class="tool-detail-tab-description">${versionLabel}</p>
                            ${linkMarkup ? `<div class="tool-detail-tab-links">${linkMarkup}</div>` : ""}
                        </div>
                    </div>
                </div>
                <div class="tool-detail-tab-body">
                    <div class="tool-detail-tab-readme-card">
                        <h3>Highlights</h3>
                        <div id="whats-new-content" class="tool-detail-tab-markdown">${markdownUrl ? "Loading release notes…" : "Unable to determine app version."}</div>
                    </div>
                </div>
            `.trim();

            // Wire up the "Open on website" link to open externally
            panel.querySelectorAll<HTMLAnchorElement>(".tool-detail-tab-link").forEach((link) => {
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    const linkUrl = link.getAttribute("data-url") || link.getAttribute("href");
                    if (linkUrl && (linkUrl.startsWith("https://") || linkUrl.startsWith("http://"))) {
                        window.toolboxAPI.openExternal(linkUrl).catch(() => undefined);
                    }
                });
            });

            if (!markdownUrl) {
                return;
            }

            void (async () => {
                const container = panel.querySelector<HTMLElement>("#whats-new-content");
                if (!container) {
                    return;
                }

                try {
                    const response = await fetch(markdownUrl, { cache: "no-store" });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }

                    const markdown = await response.text();

                    // Discard if the user switched away from this tab while the fetch was in flight
                    const detailPanel = document.getElementById("tool-detail-content-panel");
                    if (!detailPanel || detailPanel.getAttribute("data-tab-id") !== WHATS_NEW_TAB_ID) {
                        return;
                    }

                    container.innerHTML = renderMarkdownToSafeHtml(markdown);
                    wireExternalLinks(container, (href) => window.toolboxAPI.openExternal(href));
                } catch (error) {
                    logWarn("Failed to load What's New content", { markdownUrl, error: formatError(error) });
                    const detailPanel = document.getElementById("tool-detail-content-panel");
                    if (detailPanel && detailPanel.getAttribute("data-tab-id") === WHATS_NEW_TAB_ID) {
                        container.textContent = `Unable to load release notes. ${markdownUrl ? "Check your connection or try again later." : ""}`;
                    }
                }
            })();
        },
        "",
    );
}
