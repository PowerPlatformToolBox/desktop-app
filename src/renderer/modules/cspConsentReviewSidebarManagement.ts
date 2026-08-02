/**
 * CSP consent review module
 * Renders consent review in sidebar and in full-tab mode.
 */

import { logError, logInfo } from "../../common/logger";
import { CspConsentRecord, Tool } from "../../common/types";
import { getNormalizedCspDomains } from "../../common/utils/cspConsent";
import { openCspConsentManagementModal } from "./cspExceptionModal";
import { openLocalPageAsTab, registerCloseGuard } from "./toolManagement";

interface ConsentReviewEntry {
    toolId: string;
    toolName: string;
    description?: string;
    granted: boolean;
    contributors: string[];
    requiredDomains: string[];
    optionalDomains: string[];
    approvedOptionalDomains: string[];
    seenOptionalDomains: string[];
    tool: Tool;
}

interface ConsentReviewContext {
    key: string;
    searchInput: HTMLInputElement;
    statusFilter: HTMLSelectElement;
    listContainer: HTMLElement;
}

const contexts = new Map<string, ConsentReviewContext>();
const contextEntries = new Map<string, ConsentReviewEntry[]>();

function isMarketplaceInstalledTool(tool: Tool): boolean {
    return !tool.localPath && !tool.npmPackageName && !tool.id.startsWith("local-") && !tool.id.startsWith("npm-");
}

function hasCspExceptions(tool: Tool): boolean {
    return !!tool.cspExceptions && Object.keys(tool.cspExceptions).length > 0;
}

function collectDomainsFromTool(tool: Tool): { required: string[]; optional: string[] } {
    return getNormalizedCspDomains(tool.cspExceptions);
}

function buildConsentEntries(tools: Tool[], consentsByToolId: { [toolId: string]: CspConsentRecord }): ConsentReviewEntry[] {
    return tools
        .filter((tool) => isMarketplaceInstalledTool(tool) && hasCspExceptions(tool))
        .map((tool) => {
            const domains = collectDomainsFromTool(tool);
            const consent = consentsByToolId[tool.id];
            return {
                toolId: tool.id,
                toolName: tool.name,
                description: tool.description,
                granted: consent?.allowed === true,
                contributors: tool.authors ?? [],
                requiredDomains: domains.required,
                optionalDomains: domains.optional,
                approvedOptionalDomains: (consent?.optional ?? []).filter((domain) => domains.optional.includes(domain)).sort(),
                seenOptionalDomains: consent?.seenOptional ?? consent?.optional ?? domains.optional,
                tool,
            };
        })
        .sort((left, right) => {
            if (left.granted !== right.granted) {
                return left.granted ? -1 : 1;
            }
            return left.toolName.localeCompare(right.toolName);
        });
}

function createCountBadge(label: string, count: number): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "consent-review-count-badge";
    badge.textContent = `${label} ${count}`;
    return badge;
}

function createDomainList(title: string, domains: string[]): HTMLElement {
    const section = document.createElement("div");
    section.className = "consent-review-domain-section";

    const heading = document.createElement("p");
    heading.className = "consent-review-domain-title";
    heading.textContent = title;
    section.appendChild(heading);

    if (domains.length === 0) {
        const emptyText = document.createElement("p");
        emptyText.className = "consent-review-domain-empty";
        emptyText.textContent = "None";
        section.appendChild(emptyText);
        return section;
    }

    const list = document.createElement("div");
    list.className = "consent-review-domain-list";
    domains.forEach((domain) => {
        const chip = document.createElement("span");
        chip.className = "consent-review-domain-chip";
        chip.textContent = domain;
        list.appendChild(chip);
    });
    section.appendChild(list);

    return section;
}

function getConsentedDomains(entry: ConsentReviewEntry): string[] {
    if (!entry.granted) {
        return [];
    }

    return [...entry.requiredDomains, ...entry.approvedOptionalDomains].sort();
}

function getNotConsentedDomains(entry: ConsentReviewEntry): string[] {
    const approvedOptionalSet = new Set(entry.approvedOptionalDomains);
    const unapprovedOptional = entry.optionalDomains.filter((domain) => !approvedOptionalSet.has(domain));

    if (!entry.granted) {
        return [...entry.requiredDomains, ...entry.optionalDomains].sort();
    }

    return unapprovedOptional.sort();
}

function getFilteredEntries(entries: ConsentReviewEntry[], context: ConsentReviewContext): ConsentReviewEntry[] {
    const status = context.statusFilter.value === "granted" || context.statusFilter.value === "revoked" ? context.statusFilter.value : "all";
    const searchTerm = context.searchInput.value.trim().toLowerCase();

    return entries.filter((entry) => {
        if (status === "granted" && !entry.granted) {
            return false;
        }
        if (status === "revoked" && entry.granted) {
            return false;
        }
        if (!searchTerm) {
            return true;
        }

        const haystack = [entry.toolName, ...entry.contributors, ...entry.requiredDomains, ...entry.optionalDomains].join(" ").toLowerCase();
        return haystack.includes(searchTerm);
    });
}

function renderContext(context: ConsentReviewContext, entries: ConsentReviewEntry[]): void {
    const container = context.listContainer;
    container.innerHTML = "";

    const filtered = getFilteredEntries(entries, context);

    const summaryCard = document.createElement("section");
    summaryCard.className = "settings-section-card consent-review-summary-card";
    summaryCard.innerHTML = `
        <div class="settings-section-header">
            <p class="settings-section-eyebrow">Security</p>
            <p class="settings-section-description">Review marketplace tool permissions and apply changes in one flow.</p>
        </div>
    `;

    const summaryBody = document.createElement("div");
    summaryBody.className = "consent-review-summary-badges";
    const grantedCount = entries.filter((entry) => entry.granted).length;
    const revokedCount = entries.length - grantedCount;
    summaryBody.appendChild(createCountBadge("Total", entries.length));
    summaryBody.appendChild(createCountBadge("Granted", grantedCount));
    summaryBody.appendChild(createCountBadge("Revoked", revokedCount));
    summaryCard.appendChild(summaryBody);
    container.appendChild(summaryCard);

    if (filtered.length === 0) {
        const emptyCard = document.createElement("section");
        emptyCard.className = "settings-section-card";
        const emptyText = document.createElement("p");
        emptyText.className = "settings-section-description";
        emptyText.textContent = entries.length === 0 ? "No marketplace-installed tools currently request CSP permissions." : "No tools match the current filters.";
        emptyCard.appendChild(emptyText);
        container.appendChild(emptyCard);
        return;
    }

    filtered.forEach((entry) => {
        const card = document.createElement("section");
        card.className = "settings-section-card consent-review-card";

        const statusClass = entry.granted ? "granted" : "revoked";
        const statusText = entry.granted ? "Granted" : "Revoked";
        const contributorsText = entry.contributors.length > 0 ? entry.contributors.join(", ") : "Unknown contributors";
        const consentedDomains = getConsentedDomains(entry);
        const notConsentedDomains = getNotConsentedDomains(entry);

        card.innerHTML = `
            <div class="consent-review-card-header">
                <div class="consent-review-card-title-wrap">
                    <p class="consent-review-card-title">${entry.toolName}</p>
                    <p class="consent-review-card-subtitle">${contributorsText}</p>
                </div>
                <span class="consent-status-badge ${statusClass}">${statusText}</span>
            </div>
            ${entry.description ? `<p class="consent-review-card-description">${entry.description}</p>` : ""}
        `;

        const domains = document.createElement("div");
        domains.className = "consent-review-domains-grid";
        domains.appendChild(createDomainList("Consented", consentedDomains));
        domains.appendChild(createDomainList("Not Consented", notConsentedDomains));
        card.appendChild(domains);

        const actions = document.createElement("div");
        actions.className = "consent-review-card-actions";

        const actionButton = document.createElement("button");
        actionButton.className = "fluent-button fluent-button-primary consent-action-btn";
        actionButton.textContent = "Make Changes";
        actionButton.setAttribute("data-tool-id", entry.toolId);
        actions.appendChild(actionButton);
        card.appendChild(actions);

        container.appendChild(card);
    });
}

async function loadEntries(): Promise<ConsentReviewEntry[]> {
    const [tools, cspConsents] = await Promise.all([window.toolboxAPI.getAllTools(), window.toolboxAPI.getCspConsents()]);
    return buildConsentEntries(tools, cspConsents);
}

async function refreshContext(context: ConsentReviewContext): Promise<void> {
    const loading = document.createElement("div");
    loading.className = "links-hub-loading";
    const progress = document.createElement("fluent-progress-ring");
    progress.setAttribute("size", "small");
    loading.appendChild(progress);

    context.listContainer.innerHTML = "";
    context.listContainer.appendChild(loading);

    try {
        const entries = await loadEntries();
        contextEntries.set(context.key, entries);
        renderContext(context, entries);
        logInfo("Consent review loaded", { mode: context.key, count: entries.length });
    } catch (error) {
        logError(error instanceof Error ? error : new Error(String(error)));
        context.listContainer.innerHTML = "";
        const errorCard = document.createElement("section");
        errorCard.className = "settings-section-card";
        const message = document.createElement("p");
        message.className = "settings-section-description";
        message.textContent = "Unable to load consent review. Try refreshing.";
        errorCard.appendChild(message);
        context.listContainer.appendChild(errorCard);
    }
}

async function refreshAllContexts(): Promise<void> {
    for (const context of contexts.values()) {
        await refreshContext(context);
    }
}

function bindActionHandling(context: ConsentReviewContext): void {
    context.listContainer.addEventListener("click", async (event) => {
        const target = event.target as HTMLElement;
        const button = target.closest(".consent-action-btn") as HTMLButtonElement | null;
        if (!button) {
            return;
        }

        const toolId = button.getAttribute("data-tool-id");
        if (!toolId) {
            return;
        }

        button.disabled = true;
        try {
            const entries = await loadEntries();
            const entry = entries.find((candidate) => candidate.toolId === toolId);
            if (!entry) {
                return;
            }

            const result = await openCspConsentManagementModal(entry.tool, entry.granted, entry.approvedOptionalDomains);
            if (!result) {
                return;
            }

            if (result.action === "revoke-all") {
                await window.toolboxAPI.revokeCspConsent(entry.toolId);
                await window.toolboxAPI.utils.showNotification({
                    title: "Consent Revoked",
                    body: `All permissions were revoked for ${entry.toolName}.`,
                    type: "warning",
                });
            } else {
                const approvedOptionalDomains = result.action === "grant-all" ? entry.optionalDomains : result.approvedOptionalDomains;
                await window.toolboxAPI.grantCspConsent(entry.toolId, entry.requiredDomains, approvedOptionalDomains, entry.optionalDomains);
                await window.toolboxAPI.utils.showNotification({
                    title: "Consent Updated",
                    body: `Permissions were updated for ${entry.toolName}.`,
                    type: "success",
                });
            }

            await refreshAllContexts();
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
            await window.toolboxAPI.utils.showNotification({
                title: "Consent Update Failed",
                body: "Unable to update consent settings for this tool.",
                type: "error",
            });
        } finally {
            button.disabled = false;
        }
    });
}

function attachContextEventHandlers(context: ConsentReviewContext): void {
    context.searchInput.addEventListener("input", () => {
        const entries = contextEntries.get(context.key) ?? [];
        renderContext(context, entries);
    });

    context.statusFilter.addEventListener("change", () => {
        const entries = contextEntries.get(context.key) ?? [];
        renderContext(context, entries);
    });

    bindActionHandling(context);
}

function registerSidebarContext(): ConsentReviewContext | null {
    const searchInput = document.getElementById("consents-search-input") as HTMLInputElement | null;
    const statusFilter = document.getElementById("consents-status-filter") as HTMLSelectElement | null;
    const listContainer = document.getElementById("sidebar-consent-review-container") as HTMLElement | null;

    if (!searchInput || !statusFilter || !listContainer) {
        return null;
    }

    const existing = contexts.get("sidebar");
    if (existing) {
        return existing;
    }

    const context: ConsentReviewContext = {
        key: "sidebar",
        searchInput,
        statusFilter,
        listContainer,
    };
    contexts.set("sidebar", context);
    attachContextEventHandlers(context);

    const openTabBtn = document.getElementById("sidebar-consents-open-tab-btn");
    if (openTabBtn && openTabBtn.getAttribute("data-bound") !== "true") {
        openTabBtn.setAttribute("data-bound", "true");
        openTabBtn.addEventListener("click", () => {
            openConsentReviewTab().catch((error) => {
                logError(error instanceof Error ? error : new Error(String(error)));
            });
        });
    }

    return context;
}

function renderConsentTabContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="consent-review-tab-scroll-area">
            <section class="settings-vscode-section" id="consent-review-section">
                <h2 class="settings-vscode-section-title">Consent Review</h2>
                <p class="settings-vscode-item-description" style="margin-bottom: 12px;">Review and update permissions for marketplace-installed tools.</p>
                <div class="sidebar-search-bar consent-review-tab-toolbar">
                    <div class="sidebar-search-input-wrapper">
                        <input type="text" id="consent-tab-search-input" class="search-input" placeholder="Search tools..." />
                    </div>
                    <div class="filter-btn-group">
                        <select id="consent-tab-status-filter" class="filter-dropdown-select" aria-label="Filter consent status">
                            <option value="all">All</option>
                            <option value="granted">Granted</option>
                            <option value="revoked">Revoked</option>
                        </select>
                        <button id="consent-tab-refresh-btn" class="fluent-button fluent-button-secondary">Refresh</button>
                    </div>
                </div>
                <div id="consent-tab-list-container" class="settings-container-sidebar"></div>
            </section>
        </div>
    `;

    const searchInput = panel.querySelector("#consent-tab-search-input") as HTMLInputElement | null;
    const statusFilter = panel.querySelector("#consent-tab-status-filter") as HTMLSelectElement | null;
    const listContainer = panel.querySelector("#consent-tab-list-container") as HTMLElement | null;
    const refreshBtn = panel.querySelector("#consent-tab-refresh-btn") as HTMLButtonElement | null;

    if (!searchInput || !statusFilter || !listContainer) {
        return;
    }

    const context: ConsentReviewContext = {
        key: "tab",
        searchInput,
        statusFilter,
        listContainer,
    };

    contexts.set("tab", context);
    attachContextEventHandlers(context);

    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            refreshContext(context).catch((error) => {
                logError(error instanceof Error ? error : new Error(String(error)));
            });
        });
    }

    refreshContext(context).catch((error) => {
        logError(error instanceof Error ? error : new Error(String(error)));
    });
}

export async function openConsentReviewTab(): Promise<void> {
    registerCloseGuard("consent-review", async () => true);
    await openLocalPageAsTab("consent-review", "Consent Review", renderConsentTabContent, "");
}

/**
 * Loads and renders all CSP consent records in the sidebar panel.
 */
export async function loadSidebarConsentReview(): Promise<void> {
    const context = registerSidebarContext();
    if (!context) {
        return;
    }

    await refreshContext(context);
}
