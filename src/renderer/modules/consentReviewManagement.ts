import { logError, logInfo } from "../../common/logger";
import { CspConsentRecord, DataverseHeaderConsentRecord, Tool } from "../../common/types";
import { getNormalizedCspDomains } from "../../common/utils/cspConsent";
import { openCspConsentManagementModal } from "./cspExceptionModal";
import { openLocalPageAsTab, registerCloseGuard } from "./toolManagement";

type ConsentType = "csp" | "dataverse";
type ConsentStatus = "granted" | "partial" | "revoked";

interface CspEntry {
    type: "csp";
    tool: Tool;
    toolId: string;
    toolName: string;
    contributors: string[];
    granted: boolean;
    requiredDomains: string[];
    approvedRequiredDomains: string[];
    optionalDomains: string[];
    approvedOptionalDomains: string[];
}

interface DataverseEntry {
    type: "dataverse";
    toolId: string;
    toolName: string;
    contributors: string[];
    granted: boolean;
    grantedAt: string;
    revokedAt?: string;
}

type ConsentEntry = CspEntry | DataverseEntry;

interface ConsentReviewContext {
    activeType: ConsentType;
    searchInput: HTMLInputElement;
    statusFilter: HTMLSelectElement;
    listContainer: HTMLElement;
    tabButtons: NodeListOf<HTMLButtonElement>;
    expandedRows: Set<string>;
    entries: Record<ConsentType, ConsentEntry[]>;
}

function isMarketplaceInstalledTool(tool: Tool): boolean {
    return !tool.localPath && !tool.npmPackageName && !tool.id.startsWith("local-") && !tool.id.startsWith("npm-");
}

function buildCspEntries(tools: Tool[], consents: Record<string, CspConsentRecord>): CspEntry[] {
    return tools
        .filter((tool) => isMarketplaceInstalledTool(tool) && !!tool.cspExceptions && Object.keys(tool.cspExceptions).length > 0)
        .map((tool) => {
            const domains = getNormalizedCspDomains(tool.cspExceptions);
            const consent = consents[tool.id];
            return {
                type: "csp" as const,
                tool,
                toolId: tool.id,
                toolName: tool.name,
                contributors: tool.authors ?? [],
                granted: consent?.allowed === true,
                requiredDomains: domains.required,
                approvedRequiredDomains: (consent?.required ?? []).filter((domain) => domains.required.includes(domain)).sort(),
                optionalDomains: domains.optional,
                approvedOptionalDomains: (consent?.optional ?? []).filter((domain) => domains.optional.includes(domain)).sort(),
            };
        })
        .sort(compareEntries);
}

function buildDataverseEntries(tools: Tool[], consents: Record<string, DataverseHeaderConsentRecord>): DataverseEntry[] {
    const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
    return Object.entries(consents)
        .map(([toolId, consent]) => {
            const tool = toolsById.get(toolId);
            return {
                type: "dataverse" as const,
                toolId,
                toolName: tool?.name ?? toolId,
                contributors: tool?.authors ?? [],
                granted: consent.status === "granted",
                grantedAt: consent.grantedAt,
                revokedAt: consent.revokedAt,
            };
        })
        .sort(compareEntries);
}

function compareEntries(left: ConsentEntry, right: ConsentEntry): number {
    const statusOrder: Record<ConsentStatus, number> = { granted: 0, partial: 1, revoked: 2 };
    const statusDifference = statusOrder[getConsentStatus(left)] - statusOrder[getConsentStatus(right)];
    if (statusDifference !== 0) return statusDifference;
    return left.toolName.localeCompare(right.toolName);
}

function getConsentStatus(entry: ConsentEntry): ConsentStatus {
    if (!entry.granted) return "revoked";
    if (entry.type === "csp" && (entry.approvedRequiredDomains.length < entry.requiredDomains.length || entry.approvedOptionalDomains.length < entry.optionalDomains.length)) return "partial";
    return "granted";
}

function createStatus(consentStatus: ConsentStatus): HTMLElement {
    const status = document.createElement("span");
    status.className = `consent-status ${consentStatus}`;
    const dot = document.createElement("span");
    dot.className = "consent-status-dot";
    dot.setAttribute("aria-hidden", "true");
    const statusText: Record<ConsentStatus, string> = { granted: "Granted", partial: "Partially granted", revoked: "Revoked" };
    status.append(dot, statusText[consentStatus]);
    return status;
}

function createDomainGroup(title: string, domains: string[]): HTMLElement {
    const group = document.createElement("div");
    group.className = "consent-review-detail-group";
    const heading = document.createElement("p");
    heading.className = "consent-review-detail-label";
    heading.textContent = title;
    const list = document.createElement("div");
    list.className = "consent-review-domain-list";
    if (domains.length === 0) {
        const empty = document.createElement("span");
        empty.className = "consent-review-domain-empty";
        empty.textContent = "None";
        list.appendChild(empty);
    } else {
        domains.forEach((domain) => {
            const chip = document.createElement("code");
            chip.className = "consent-review-domain-chip";
            chip.textContent = domain;
            list.appendChild(chip);
        });
    }
    group.append(heading, list);
    return group;
}

function formatTimestamp(value?: string): string {
    if (!value) return "Not recorded";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function createEntryRow(entry: ConsentEntry, context: ConsentReviewContext): HTMLElement {
    const rowKey = `${entry.type}:${entry.toolId}`;
    const detailId = `consent-detail-${encodeURIComponent(rowKey)}`;
    const expanded = context.expandedRows.has(rowKey);
    const row = document.createElement("section");
    row.className = "consent-review-row";
    row.setAttribute("data-row-key", rowKey);

    const overview = document.createElement("div");
    overview.className = "consent-review-row-overview";
    const identity = document.createElement("div");
    identity.className = "consent-review-row-identity";
    const name = document.createElement("h3");
    name.className = "consent-review-row-title";
    name.textContent = entry.toolName;
    const authors = document.createElement("p");
    authors.className = "consent-review-row-authors";
    authors.textContent = entry.contributors.length > 0 ? entry.contributors.join(", ") : "Unknown contributors";
    identity.append(name, authors);

    const summary = document.createElement("p");
    summary.className = "consent-review-row-summary";
    if (entry.type === "csp") {
        summary.textContent = `${entry.requiredDomains.length} required, ${entry.optionalDomains.length} optional, ${entry.approvedOptionalDomains.length} optional approved`;
    } else {
        summary.textContent = entry.granted ? "Any additional Dataverse request header" : `Revoked ${formatTimestamp(entry.revokedAt)}`;
    }

    const controls = document.createElement("div");
    controls.className = "consent-review-row-controls";
    controls.appendChild(createStatus(getConsentStatus(entry)));
    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "fluent-button fluent-button-secondary consent-details-btn";
    detailsButton.textContent = expanded ? "Hide details" : "Details";
    detailsButton.setAttribute("data-row-key", rowKey);
    detailsButton.setAttribute("aria-expanded", String(expanded));
    detailsButton.setAttribute("aria-controls", detailId);
    controls.appendChild(detailsButton);
    overview.append(identity, summary, controls);
    row.appendChild(overview);

    if (expanded) {
        const detail = document.createElement("div");
        detail.className = "consent-review-row-detail";
        detail.id = detailId;
        if (entry.type === "csp") {
            const approved = entry.granted ? [...entry.approvedRequiredDomains, ...entry.approvedOptionalDomains].sort() : [];
            const approvedRequired = new Set(entry.approvedRequiredDomains);
            const approvedOptional = new Set(entry.approvedOptionalDomains);
            const notApproved = entry.granted
                ? [...entry.requiredDomains.filter((domain) => !approvedRequired.has(domain)), ...entry.optionalDomains.filter((domain) => !approvedOptional.has(domain))].sort()
                : [...entry.requiredDomains, ...entry.optionalDomains].sort();
            detail.append(createDomainGroup("Consented", approved), createDomainGroup("Not consented", notApproved));
            const action = document.createElement("button");
            action.type = "button";
            action.className = "fluent-button fluent-button-primary consent-csp-action";
            action.textContent = "Review permissions";
            action.setAttribute("data-tool-id", entry.toolId);
            detail.appendChild(action);
        } else {
            const scope = document.createElement("p");
            scope.className = "consent-review-scope-note";
            scope.textContent = entry.granted
                ? "This tool may send any additional header name and value through Dataverse API methods until access is revoked."
                : "The next Dataverse API request with additional headers will ask for consent again and show the exact values.";
            const timestamps = document.createElement("dl");
            timestamps.className = "consent-review-timestamps";
            const grantedLabel = document.createElement("dt");
            grantedLabel.textContent = "Granted";
            const grantedValue = document.createElement("dd");
            grantedValue.textContent = formatTimestamp(entry.grantedAt);
            timestamps.append(grantedLabel, grantedValue);
            if (entry.revokedAt) {
                const revokedLabel = document.createElement("dt");
                revokedLabel.textContent = "Revoked";
                const revokedValue = document.createElement("dd");
                revokedValue.textContent = formatTimestamp(entry.revokedAt);
                timestamps.append(revokedLabel, revokedValue);
            }
            detail.append(scope, timestamps);
            if (entry.granted) {
                const revoke = document.createElement("button");
                revoke.type = "button";
                revoke.className = "fluent-button fluent-button-secondary consent-dataverse-revoke";
                revoke.textContent = "Revoke access";
                revoke.setAttribute("data-tool-id", entry.toolId);
                detail.appendChild(revoke);
            }
        }
        row.appendChild(detail);
    }
    return row;
}

function filteredEntries(context: ConsentReviewContext): ConsentEntry[] {
    const search = context.searchInput.value.trim().toLowerCase();
    const status = context.statusFilter.value;
    return context.entries[context.activeType].filter((entry) => {
        if (status !== "all" && status !== getConsentStatus(entry)) return false;
        const details = entry.type === "csp" ? [...entry.requiredDomains, ...entry.optionalDomains] : [];
        return !search || [entry.toolName, entry.toolId, ...entry.contributors, ...details].join(" ").toLowerCase().includes(search);
    });
}

function render(context: ConsentReviewContext): void {
    const partialOption = context.statusFilter.querySelector<HTMLOptionElement>('option[value="partial"]');
    if (partialOption) {
        partialOption.hidden = context.activeType !== "csp";
        partialOption.disabled = context.activeType !== "csp";
    }
    context.tabButtons.forEach((button) => {
        const active = button.dataset.consentType === context.activeType;
        button.classList.toggle("active", active);
        button.setAttribute("aria-selected", String(active));
        button.tabIndex = active ? 0 : -1;
        const type = button.dataset.consentType as ConsentType;
        const count = button.querySelector(".consent-review-tab-count");
        if (count) count.textContent = String(context.entries[type].length);
    });

    context.listContainer.innerHTML = "";
    const allEntries = context.entries[context.activeType];
    const visibleEntries = filteredEntries(context);
    const summary = document.createElement("div");
    summary.className = "consent-review-summary";
    const statusCounts = allEntries.reduce<Record<ConsentStatus, number>>(
        (counts, entry) => {
            counts[getConsentStatus(entry)] += 1;
            return counts;
        },
        { granted: 0, partial: 0, revoked: 0 },
    );
    summary.textContent =
        context.activeType === "csp"
            ? `${statusCounts.granted} granted · ${statusCounts.partial} partial · ${statusCounts.revoked} revoked`
            : `${statusCounts.granted} granted · ${statusCounts.revoked} revoked`;
    context.listContainer.appendChild(summary);
    if (visibleEntries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "consent-review-empty";
        empty.textContent =
            allEntries.length === 0
                ? context.activeType === "csp"
                    ? "No installed tools request CSP exceptions."
                    : "No tools have requested persistent Dataverse header access."
                : "No tools match the current filters.";
        context.listContainer.appendChild(empty);
        return;
    }
    visibleEntries.forEach((entry) => context.listContainer.appendChild(createEntryRow(entry, context)));
}

async function loadEntries(context: ConsentReviewContext): Promise<void> {
    const [tools, cspConsents, dataverseConsents] = await Promise.all([window.toolboxAPI.getAllTools(), window.toolboxAPI.getCspConsents(), window.toolboxAPI.getDataverseHeaderConsents()]);
    context.entries = {
        csp: buildCspEntries(tools, cspConsents),
        dataverse: buildDataverseEntries(tools, dataverseConsents),
    };
    render(context);
    logInfo("Consent review loaded", { cspCount: context.entries.csp.length, dataverseCount: context.entries.dataverse.length });
}

async function handleCspAction(context: ConsentReviewContext, toolId: string, button: HTMLButtonElement): Promise<void> {
    const entry = context.entries.csp.find((candidate): candidate is CspEntry => candidate.type === "csp" && candidate.toolId === toolId);
    if (!entry) return;
    button.disabled = true;
    try {
        const result = await openCspConsentManagementModal(entry.tool, entry.granted, entry.approvedOptionalDomains);
        if (!result) return;
        if (result.action === "revoke-all") await window.toolboxAPI.revokeCspConsent(toolId);
        else await window.toolboxAPI.grantCspConsent(toolId, entry.requiredDomains, result.action === "grant-all" ? entry.optionalDomains : result.approvedOptionalDomains, entry.optionalDomains);
        await loadEntries(context);
    } finally {
        button.disabled = false;
    }
}

async function handleDataverseRevoke(context: ConsentReviewContext, toolId: string, button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
        await window.toolboxAPI.revokeDataverseHeaderConsent(toolId);
        await window.toolboxAPI.utils.showNotification({
            title: "Dataverse Header Access Revoked",
            body: "The tool will be prompted again the next time it requests additional Dataverse headers.",
            type: "warning",
        });
        await loadEntries(context);
    } finally {
        button.disabled = false;
    }
}

function bindEvents(context: ConsentReviewContext): void {
    const activateTab = (button: HTMLButtonElement, focus = false) => {
        context.activeType = button.dataset.consentType === "dataverse" ? "dataverse" : "csp";
        context.searchInput.value = "";
        context.statusFilter.value = "all";
        render(context);
        if (focus) button.focus();
    };
    context.tabButtons.forEach((button, index) => {
        button.addEventListener("click", () => activateTab(button));
        button.addEventListener("keydown", (event) => {
            let nextIndex: number | null = null;
            if (event.key === "ArrowRight") nextIndex = (index + 1) % context.tabButtons.length;
            if (event.key === "ArrowLeft") nextIndex = (index - 1 + context.tabButtons.length) % context.tabButtons.length;
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = context.tabButtons.length - 1;
            if (nextIndex === null) return;
            event.preventDefault();
            activateTab(context.tabButtons[nextIndex], true);
        });
    });
    context.searchInput.addEventListener("input", () => render(context));
    context.statusFilter.addEventListener("change", () => render(context));
    context.listContainer.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        const details = target.closest(".consent-details-btn") as HTMLButtonElement | null;
        if (details?.dataset.rowKey) {
            if (context.expandedRows.has(details.dataset.rowKey)) context.expandedRows.delete(details.dataset.rowKey);
            else context.expandedRows.add(details.dataset.rowKey);
            render(context);
            return;
        }
        const cspAction = target.closest(".consent-csp-action") as HTMLButtonElement | null;
        if (cspAction?.dataset.toolId) void handleCspAction(context, cspAction.dataset.toolId, cspAction).catch(handleError);
        const revoke = target.closest(".consent-dataverse-revoke") as HTMLButtonElement | null;
        if (revoke?.dataset.toolId) void handleDataverseRevoke(context, revoke.dataset.toolId, revoke).catch(handleError);
    });
}

function handleError(error: unknown): void {
    logError(error instanceof Error ? error : new Error(String(error)));
    void window.toolboxAPI.utils.showNotification({ title: "Consent Update Failed", body: "Unable to update consent settings for this tool.", type: "error" });
}

function renderConsentTabContent(panel: HTMLElement): void {
    panel.className = "settings-tab-container";
    panel.innerHTML = `
        <div class="settings-tab-content" id="consent-review-tab-scroll-area">
            <section class="settings-vscode-section" id="consent-review-section">
                <header class="consent-review-page-header">
                    <h2 class="settings-vscode-section-title">Consent Review</h2>
                    <p class="consent-review-page-description">Review persistent permissions granted to installed tools.</p>
                </header>
                <div class="consent-review-type-tabs" role="tablist" aria-label="Consent type">
                    <button id="consent-csp-tab" class="consent-review-type-tab active" type="button" role="tab" aria-selected="true" aria-controls="consent-tab-list-container" data-consent-type="csp">CSP Exceptions <span class="consent-review-tab-count">0</span></button>
                    <button id="consent-dataverse-tab" class="consent-review-type-tab" type="button" role="tab" aria-selected="false" aria-controls="consent-tab-list-container" data-consent-type="dataverse">Dataverse Headers <span class="consent-review-tab-count">0</span></button>
                </div>
                <div class="consent-review-tab-toolbar">
                    <div class="sidebar-search-input-wrapper"><input type="text" id="consent-tab-search-input" class="search-input" placeholder="Search tools..." aria-label="Search consented tools" /></div>
                    <div class="filter-btn-group">
                        <select id="consent-tab-status-filter" class="filter-dropdown-select" aria-label="Filter consent status"><option value="all">All</option><option value="granted">Granted</option><option value="partial">Partially granted</option><option value="revoked">Revoked</option></select>
                        <button id="consent-tab-refresh-btn" class="fluent-button fluent-button-secondary" type="button">Refresh</button>
                    </div>
                </div>
                <div id="consent-tab-list-container" class="consent-review-list" role="tabpanel" aria-live="polite"></div>
            </section>
        </div>`;

    const searchInput = panel.querySelector("#consent-tab-search-input") as HTMLInputElement;
    const statusFilter = panel.querySelector("#consent-tab-status-filter") as HTMLSelectElement;
    const listContainer = panel.querySelector("#consent-tab-list-container") as HTMLElement;
    const context: ConsentReviewContext = {
        activeType: "csp",
        searchInput,
        statusFilter,
        listContainer,
        tabButtons: panel.querySelectorAll<HTMLButtonElement>(".consent-review-type-tab"),
        expandedRows: new Set(),
        entries: { csp: [], dataverse: [] },
    };
    bindEvents(context);
    panel.querySelector("#consent-tab-refresh-btn")?.addEventListener("click", () => void loadEntries(context).catch(handleError));
    void loadEntries(context).catch(handleError);
}

export async function openConsentReviewTab(): Promise<void> {
    registerCloseGuard("consent-review", async () => true);
    await openLocalPageAsTab("consent-review", "Consent Review", renderConsentTabContent, "");
}
