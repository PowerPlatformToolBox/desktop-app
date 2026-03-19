/**
 * Important links sidebar module
 * Renders the curated allowlisted external links into the Links sidebar panel.
 */

import { logError, logWarn } from "../../common/logger";
import importantLinksCollectionJson from "../data/importantLinks.json";

interface ImportantLinksCollection {
    version: number;
    groups: ImportantLinksGroup[];
}

interface ImportantLinksGroup {
    id: string;
    title: string;
    links: ImportantLinksItem[];
}

interface ImportantLinksItem {
    id: string;
    label: string;
    url: string;
}

const importantLinksCollection = importantLinksCollectionJson as unknown as ImportantLinksCollection;

function tryNormalizeHttpsUrl(value: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return null;
    }

    if (parsed.protocol !== "https:") {
        return null;
    }

    return parsed.toString();
}

function tryGetDisplayHost(value: string): string | null {
    const normalized = tryNormalizeHttpsUrl(value);
    if (!normalized) {
        return null;
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.hostname.replace(/^www\./i, "");
        return host || null;
    } catch {
        return null;
    }
}

function buildAllowlist(collection: ImportantLinksCollection): ReadonlySet<string> {
    const allowlist = new Set<string>();

    for (const group of collection.groups ?? []) {
        for (const link of group.links ?? []) {
            if (typeof link.url !== "string") {
                continue;
            }

            const normalized = tryNormalizeHttpsUrl(link.url);
            if (normalized) {
                allowlist.add(normalized);
            }
        }
    }

    return allowlist;
}

const IMPORTANT_LINK_ALLOWLIST: ReadonlySet<string> = buildAllowlist(importantLinksCollection);

function openAllowlistedImportantLink(candidateUrl: string): void {
    const normalized = tryNormalizeHttpsUrl(candidateUrl);
    if (!normalized) {
        logWarn("Blocked attempt to open non-https or invalid Important link", { url: candidateUrl });
        return;
    }

    if (!IMPORTANT_LINK_ALLOWLIST.has(normalized)) {
        logWarn("Blocked attempt to open non-allowlisted Important link", { url: normalized });
        return;
    }

    window.toolboxAPI.openExternal(normalized);
}

function createHeaderCard(): HTMLElement {
    const card = document.createElement("section");
    card.className = "settings-section-card";

    const header = document.createElement("div");
    header.className = "settings-section-header";

    const title = document.createElement("p");
    title.className = "settings-section-title";
    title.textContent = "Important links";

    const description = document.createElement("p");
    description.className = "settings-section-description";
    description.textContent = "Curated Power Platform resources—news, planning, and quick calculators.";

    header.appendChild(title);
    header.appendChild(description);
    card.appendChild(header);

    return card;
}

function createGroupCard(group: ImportantLinksGroup): HTMLElement {
    const card = document.createElement("section");
    card.className = "settings-section-card";

    const header = document.createElement("div");
    header.className = "settings-section-header";

    const title = document.createElement("p");
    title.className = "settings-section-title";
    title.textContent = group.title;

    header.appendChild(title);

    const body = document.createElement("div");
    body.className = "settings-section-body links-list";

    for (const link of group.links) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fluent-button fluent-button-secondary links-list-item";
        const content = document.createElement("span");
        content.className = "links-list-item-content";

        const text = document.createElement("span");
        text.className = "links-list-item-text";

        const titleText = document.createElement("span");
        titleText.className = "links-list-item-title";
        titleText.textContent = link.label;

        const metaText = document.createElement("span");
        metaText.className = "links-list-item-meta";
        metaText.textContent = tryGetDisplayHost(link.url) ?? "";

        text.appendChild(titleText);
        if (metaText.textContent) {
            text.appendChild(metaText);
        }

        const indicator = document.createElement("span");
        indicator.className = "links-list-item-indicator";
        indicator.textContent = "\u2197";
        indicator.setAttribute("aria-hidden", "true");

        content.appendChild(text);
        content.appendChild(indicator);
        button.appendChild(content);
        button.setAttribute("aria-label", `Open ${link.label} in your browser`);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            openAllowlistedImportantLink(link.url);
        });

        body.appendChild(button);
    }

    card.appendChild(header);
    card.appendChild(body);

    return card;
}

/**
 * Render the Important links panel in the sidebar.
 */
export function loadSidebarImportantLinks(): void {
    const container = document.getElementById("sidebar-important-links-container");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    try {
        if (!importantLinksCollection || !Array.isArray(importantLinksCollection.groups)) {
            throw new Error("Important links JSON is missing groups");
        }

        container.appendChild(createHeaderCard());

        for (const group of importantLinksCollection.groups) {
            if (!group || typeof group.title !== "string" || !Array.isArray(group.links)) {
                continue;
            }

            container.appendChild(createGroupCard(group));
        }

        if (importantLinksCollection.groups.length === 0) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.innerHTML = "<p>No links configured</p>";
            container.appendChild(empty);
        }
    } catch (error) {
        logError("Failed to render Important links sidebar", error);

        container.innerHTML = `
            <div class="empty-state">
                <p>Error loading links</p>
                <p class="empty-state-hint">${(error as Error).message}</p>
            </div>
        `;
    }
}
