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
    description?: string;
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

const LINK_ICON_COLOR_CLASSES = ["link-icon-color-purple", "link-icon-color-blue", "link-icon-color-teal", "link-icon-color-green", "link-icon-color-orange"] as const;

function getFaviconApiUrl(url: string): string {
    return `https://www.google.com/s2/favicons?domain=${url}&sz=64`;
}

const EXTERNAL_LINK_SVG = `<svg width="13" height="13" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5.5 4.25H15.75V14.5M15.75 4.25L4.25 15.75" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function createHubIntro(): HTMLElement {
    const intro = document.createElement("div");
    intro.className = "links-hub-intro";

    const desc = document.createElement("p");
    desc.className = "links-hub-intro-text";
    desc.textContent = "Curated Power Platform resources—news, planning, and quick calculators.";

    intro.appendChild(desc);
    return intro;
}

function createGroupSection(group: ImportantLinksGroup, iconColorOffset: number): HTMLElement {
    const section = document.createElement("section");
    section.className = "links-group";

    // Category header
    const groupHeader = document.createElement("div");
    groupHeader.className = "links-group-header";

    const categoryLabel = document.createElement("span");
    categoryLabel.className = "links-group-category";
    categoryLabel.textContent = group.title;
    groupHeader.appendChild(categoryLabel);

    section.appendChild(groupHeader);

    // Links list
    const list = document.createElement("ul");
    list.className = "links-group-list";

    group.links.forEach((link, linkIndex) => {
        const li = document.createElement("li");

        const button = document.createElement("button");
        button.type = "button";
        button.className = "link-row";
        button.setAttribute("aria-label", `Open ${link.label} in your browser`);

        const iconEl = document.createElement("span");
        iconEl.className = "link-row-icon link-row-icon--favicon";
        iconEl.setAttribute("aria-hidden", "true");

        const host = tryGetDisplayHost(link.url);
        const faviconImg = document.createElement("img");
        faviconImg.className = "link-row-favicon";
        faviconImg.width = 28;
        faviconImg.height = 28;
        faviconImg.setAttribute("aria-hidden", "true");

        const applyFallback = () => {
            faviconImg.remove();
            iconEl.classList.remove("link-row-icon--favicon");
            const colorClass = LINK_ICON_COLOR_CLASSES[(iconColorOffset + linkIndex) % LINK_ICON_COLOR_CLASSES.length];
            iconEl.classList.add(colorClass);
            iconEl.textContent = link.label.charAt(0).toUpperCase();
        };

        if (host) {
            const faviconApiUrl = getFaviconApiUrl(link.url);
            window.toolboxAPI
                .fetchFavicon(faviconApiUrl)
                .then((dataUri) => {
                    if (dataUri) {
                        faviconImg.src = dataUri;
                    } else {
                        applyFallback();
                    }
                })
                .catch(() => applyFallback());
        } else {
            applyFallback();
        }

        faviconImg.onerror = applyFallback;
        iconEl.appendChild(faviconImg);

        // Text body
        const bodyEl = document.createElement("span");
        bodyEl.className = "link-row-body";

        const titleEl = document.createElement("span");
        titleEl.className = "link-row-title";
        titleEl.textContent = link.label;

        const hostEl = document.createElement("span");
        hostEl.className = "link-row-host";
        hostEl.textContent = tryGetDisplayHost(link.url) ?? "";

        bodyEl.appendChild(titleEl);
        if (hostEl.textContent) {
            bodyEl.appendChild(hostEl);
        }

        // External link arrow
        const arrowEl = document.createElement("span");
        arrowEl.className = "link-row-arrow";
        arrowEl.innerHTML = EXTERNAL_LINK_SVG;

        button.appendChild(iconEl);
        button.appendChild(bodyEl);
        button.appendChild(arrowEl);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            openAllowlistedImportantLink(link.url);
        });

        li.appendChild(button);
        list.appendChild(li);
    });

    section.appendChild(list);
    return section;
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

        container.appendChild(createHubIntro());

        let iconColorOffset = 0;
        for (const group of importantLinksCollection.groups) {
            if (!group || typeof group.title !== "string" || !Array.isArray(group.links)) {
                continue;
            }

            container.appendChild(createGroupSection(group, iconColorOffset));
            iconColorOffset += group.links.length;
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
