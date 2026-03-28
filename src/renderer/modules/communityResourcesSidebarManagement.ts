/**
 * Community Resources sidebar module
 * Fetches curated Power Platform community links from the Supabase community_links
 * table and renders them into the Community Resources sidebar panel.
 * Falls back to the bundled static importantLinks.json when Supabase is unavailable.
 */

import { logError, logInfo, logWarn } from "../../common/logger";
import type { CommunityLinksCollection, CommunityLinksGroup } from "../../common/types";
import importantLinksCollectionJson from "../data/importantLinks.json";

// Static fallback collection (bundled with the app)
const staticFallbackCollection = importantLinksCollectionJson as unknown as CommunityLinksCollection;

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

function buildAllowlist(collection: CommunityLinksCollection): ReadonlySet<string> {
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

function openAllowlistedLink(candidateUrl: string, allowlist: ReadonlySet<string>): void {
    const normalized = tryNormalizeHttpsUrl(candidateUrl);
    if (!normalized) {
        logWarn("Blocked attempt to open non-https or invalid community link", { url: candidateUrl });
        return;
    }

    if (!allowlist.has(normalized)) {
        logWarn("Blocked attempt to open non-allowlisted community link", { url: normalized });
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

function createGroupSection(group: CommunityLinksGroup, iconColorOffset: number, allowlist: ReadonlySet<string>): HTMLElement {
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
            faviconImg.onerror = applyFallback;
            iconEl.appendChild(faviconImg);
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
            openAllowlistedLink(link.url, allowlist);
        });

        li.appendChild(button);
        list.appendChild(li);
    });

    section.appendChild(list);
    return section;
}

function renderCollection(container: HTMLElement, collection: CommunityLinksCollection): void {
    if (!collection || !Array.isArray(collection.groups)) {
        throw new Error("Community links collection is missing groups");
    }

    const allowlist = buildAllowlist(collection);

    container.appendChild(createHubIntro());

    let iconColorOffset = 0;
    for (const group of collection.groups) {
        if (!group || typeof group.title !== "string" || !Array.isArray(group.links)) {
            continue;
        }

        container.appendChild(createGroupSection(group, iconColorOffset, allowlist));
        iconColorOffset += group.links.length;
    }

    if (collection.groups.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        const message = document.createElement("p");
        message.textContent = "No links configured";
        empty.appendChild(message);
        container.appendChild(empty);
    }
}

/**
 * Render the Community Resources panel in the sidebar.
 * Fetches links dynamically from Supabase; falls back to bundled static data when unavailable.
 */
export async function loadSidebarCommunityResources(): Promise<void> {
    const container = document.getElementById("sidebar-important-links-container");
    if (!container) {
        return;
    }

    container.innerHTML = "";

    // Show a loading indicator while fetching from Supabase
    const loadingEl = document.createElement("div");
    loadingEl.className = "links-hub-loading";
    const loadingSpinner = document.createElement("fluent-progress-ring");
    loadingSpinner.setAttribute("size", "small");
    loadingEl.appendChild(loadingSpinner);
    container.appendChild(loadingEl);

    let collection: CommunityLinksCollection | null = null;

    try {
        collection = (await window.toolboxAPI.fetchCommunityLinks()) as CommunityLinksCollection | null;
        if (collection) {
            logInfo("Community Resources: loaded from Supabase");
        } else {
            logInfo("Community Resources: Supabase unavailable, using bundled fallback");
        }
    } catch (error) {
        logWarn("Community Resources: fetch failed, using bundled fallback", { error: (error as Error).message });
        collection = null;
    }

    // Fall back to bundled static data when Supabase is unavailable or returns nothing
    if (!collection) {
        collection = staticFallbackCollection;
    }

    container.innerHTML = "";

    try {
        renderCollection(container, collection);
    } catch (error) {
        logError("Failed to render Community Resources sidebar", error);

        container.innerHTML = "";

        const empty = document.createElement("div");
        empty.className = "empty-state";

        const errorTitle = document.createElement("p");
        errorTitle.textContent = "Error loading links";

        const errorHint = document.createElement("p");
        errorHint.className = "empty-state-hint";
        errorHint.textContent = (error as Error).message;

        empty.appendChild(errorTitle);
        empty.appendChild(errorHint);
        container.appendChild(empty);
    }
}
