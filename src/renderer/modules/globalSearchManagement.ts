/**
 * Global Search management module
 * Implements a Command Palette-style global search over installed tools,
 * marketplace tools, connections, and settings.
 */

import { captureException, logInfo } from "../../common/sentryHelper";
import type { DataverseConnection } from "../../common/types/connection";
import type { Tool } from "../../common/types/tool";
import type { ToolDetail } from "../types/index";
import { escapeHtml } from "../utils/toolIconResolver";
import { getToolLibrary } from "./marketplaceManagement";
import { switchSidebar } from "./sidebarManagement";

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultCategory = "installed" | "marketplace" | "connection" | "settings";

interface SearchResult {
    id: string;
    name: string;
    description: string;
    category: ResultCategory;
    iconUrl?: string;
    action: () => void;
}

// ── Module state ──────────────────────────────────────────────────────────────

let isOpen = false;
let selectedIndex = -1;
let currentResults: SearchResult[] = [];

// ── Static settings entries ───────────────────────────────────────────────────

const SETTINGS_ENTRIES: Array<{ name: string; description: string; action: () => void }> = [
    { name: "Theme", description: "Change the application theme (light / dark / system)", action: () => switchSidebar("settings") },
    { name: "Auto Update", description: "Configure automatic updates", action: () => switchSidebar("settings") },
    { name: "Debug Menu", description: "Show or hide the debug / install panel", action: () => switchSidebar("settings") },
    { name: "Terminal Font", description: "Customize the integrated terminal font", action: () => switchSidebar("settings") },
    { name: "Connections", description: "Manage Dataverse connections", action: () => switchSidebar("connections") },
    { name: "Installed Tools", description: "Browse installed tools", action: () => switchSidebar("tools") },
    { name: "Marketplace", description: "Browse and install tools from the marketplace", action: () => switchSidebar("marketplace") },
];

// ── DOM helpers ───────────────────────────────────────────────────────────────

function getOverlay(): HTMLElement | null {
    return document.getElementById("global-search-overlay");
}

function getInput(): HTMLInputElement | null {
    return document.getElementById("global-search-input") as HTMLInputElement | null;
}

function getResultsContainer(): HTMLElement | null {
    return document.getElementById("global-search-results");
}

// ── Open / close ──────────────────────────────────────────────────────────────

/**
 * Open the global search command palette.
 */
export function openGlobalSearch(): void {
    const overlay = getOverlay();
    const input = getInput();
    if (!overlay || !input) return;

    isOpen = true;
    selectedIndex = -1;
    currentResults = [];

    overlay.style.display = "flex";
    input.value = "";

    // Sync input icon to current theme
    syncInputIconTheme();

    // Show empty / default state
    renderResults([]);

    // Focus the input after the layout pass
    requestAnimationFrame(() => {
        input.focus();
    });

    logInfo("Global search opened", {});
}

/**
 * Close the global search command palette.
 */
export function closeGlobalSearch(): void {
    const overlay = getOverlay();
    if (!overlay) return;

    isOpen = false;
    selectedIndex = -1;
    currentResults = [];
    overlay.style.display = "none";
}

// ── Theme helpers ─────────────────────────────────────────────────────────────

function syncInputIconTheme(): void {
    const isDark = document.body.classList.contains("dark-theme");
    const icon = document.getElementById("global-search-input-icon") as HTMLImageElement | null;
    if (icon) {
        icon.src = isDark ? "icons/dark/search.svg" : "icons/light/search.svg";
    }
}

// ── Search ────────────────────────────────────────────────────────────────────

async function runSearch(query: string): Promise<void> {
    const q = query.trim().toLowerCase();
    const results: SearchResult[] = [];

    try {
        // 1. Installed tools
        const installedRaw = await window.toolboxAPI.getAllTools();
        const installedTools = installedRaw as Tool[];
        for (const tool of installedTools) {
            if (matches(q, tool.name, tool.description)) {
                results.push({
                    id: `installed:${tool.id}`,
                    name: tool.name,
                    description: tool.description ?? "",
                    category: "installed",
                    iconUrl: undefined, // resolved below
                    action: () => {
                        closeGlobalSearch();
                        switchSidebar("tools");
                    },
                });
            }
        }

        // 2. Marketplace tools (already cached in memory)
        const libraryTools: ToolDetail[] = getToolLibrary();
        const installedIds = new Set(installedTools.map((t) => t.id));
        for (const tool of libraryTools) {
            // Skip tools already shown in installed list
            if (installedIds.has(tool.id)) continue;
            if (matches(q, tool.name, tool.description)) {
                results.push({
                    id: `marketplace:${tool.id}`,
                    name: tool.name,
                    description: tool.description ?? "",
                    category: "marketplace",
                    action: () => {
                        closeGlobalSearch();
                        switchSidebar("marketplace");
                    },
                });
            }
        }

        // 3. Connections
        const connectionsRaw = await window.toolboxAPI.connections.getAll();
        const connections = connectionsRaw as DataverseConnection[];
        for (const conn of connections) {
            if (matches(q, conn.name, conn.url, conn.environment)) {
                results.push({
                    id: `connection:${conn.id}`,
                    name: conn.name,
                    description: `${conn.environment} · ${conn.url}`,
                    category: "connection",
                    action: () => {
                        closeGlobalSearch();
                        switchSidebar("connections");
                    },
                });
            }
        }

        // 4. Settings entries
        for (const entry of SETTINGS_ENTRIES) {
            if (matches(q, entry.name, entry.description)) {
                results.push({
                    id: `settings:${entry.name}`,
                    name: entry.name,
                    description: entry.description,
                    category: "settings",
                    action: entry.action,
                });
            }
        }
    } catch (err) {
        captureException(err instanceof Error ? err : new Error(String(err)), {
            tags: { context: "global_search", action: "run_search" },
            level: "warning",
        });
    }

    currentResults = results;
    selectedIndex = results.length > 0 ? 0 : -1;
    renderResults(results);
}

function matches(query: string, ...fields: (string | undefined)[]): boolean {
    if (!query) return true;
    return fields.some((f) => f && f.toLowerCase().includes(query));
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderResults(results: SearchResult[]): void {
    const container = getResultsContainer();
    if (!container) return;

    if (results.length === 0) {
        const input = getInput();
        const query = input?.value.trim() ?? "";
        if (!query) {
            container.innerHTML = `
                <div class="global-search-empty">
                    <img src="icons/dark/search.svg" alt="" class="global-search-empty-icon" id="global-search-empty-icon" />
                    <span>Start typing to search tools, connections, and settings…</span>
                </div>`;
            syncEmptyIconTheme();
        } else {
            container.innerHTML = `
                <div class="global-search-empty">
                    <img src="icons/dark/search.svg" alt="" class="global-search-empty-icon" id="global-search-empty-icon" />
                    <span>No results for "<strong>${escapeHtml(query)}</strong>"</span>
                </div>`;
            syncEmptyIconTheme();
        }
        return;
    }

    // Group results by category
    const grouped: Record<ResultCategory, SearchResult[]> = {
        installed: [],
        marketplace: [],
        connection: [],
        settings: [],
    };
    for (const r of results) {
        grouped[r.category].push(r);
    }

    const sectionOrder: ResultCategory[] = ["installed", "marketplace", "connection", "settings"];
    const sectionLabels: Record<ResultCategory, string> = {
        installed: "Installed Tools",
        marketplace: "Marketplace",
        connection: "Connections",
        settings: "Settings",
    };
    const badgeClasses: Record<ResultCategory, string> = {
        installed: "badge-installed",
        marketplace: "badge-marketplace",
        connection: "badge-connection",
        settings: "badge-settings",
    };

    let html = "";
    let globalIdx = 0;

    for (const category of sectionOrder) {
        const group = grouped[category];
        if (group.length === 0) continue;

        html += `<div class="global-search-section-label">${escapeHtml(sectionLabels[category])}</div>`;
        for (const result of group) {
            const isSelected = globalIdx === selectedIndex;
            const badgeClass = badgeClasses[result.category];
            html += `
                <div class="global-search-item${isSelected ? " selected" : ""}" data-index="${globalIdx}" role="option" aria-selected="${isSelected}" tabindex="-1">
                    <div class="global-search-item-icon">
                        <img src="${getDefaultIconForCategory(result.category)}" alt="" />
                    </div>
                    <div class="global-search-item-text">
                        <div class="global-search-item-name">${escapeHtml(result.name)}</div>
                        <div class="global-search-item-desc">${escapeHtml(result.description)}</div>
                    </div>
                    <span class="global-search-item-badge ${badgeClass}">${escapeHtml(sectionLabels[result.category])}</span>
                </div>`;
            globalIdx++;
        }
        html += `<div class="global-search-divider"></div>`;
    }

    container.innerHTML = html;
    syncEmptyIconTheme();

    // Attach click listeners
    container.querySelectorAll<HTMLElement>(".global-search-item").forEach((item) => {
        item.addEventListener("click", () => {
            const idx = parseInt(item.dataset["index"] ?? "-1", 10);
            if (idx >= 0 && idx < currentResults.length) {
                currentResults[idx]?.action();
            }
        });
    });
}

function getDefaultIconForCategory(category: ResultCategory): string {
    const isDark = document.body.classList.contains("dark-theme");
    const theme = isDark ? "dark" : "light";
    switch (category) {
        case "installed":
            return `icons/${theme}/tools.svg`;
        case "marketplace":
            return `icons/${theme}/marketplace.svg`;
        case "connection":
            return `icons/${theme}/connections.svg`;
        case "settings":
            return `icons/${theme}/settings.svg`;
    }
}

function syncEmptyIconTheme(): void {
    const isDark = document.body.classList.contains("dark-theme");
    const emptyIcon = document.getElementById("global-search-empty-icon") as HTMLImageElement | null;
    if (emptyIcon) {
        emptyIcon.src = isDark ? "icons/dark/search.svg" : "icons/light/search.svg";
    }
}

// ── Keyboard navigation ───────────────────────────────────────────────────────

function moveSelection(delta: number): void {
    if (currentResults.length === 0) return;

    if (selectedIndex === -1) {
        selectedIndex = delta > 0 ? 0 : currentResults.length - 1;
    } else {
        selectedIndex = (selectedIndex + delta + currentResults.length) % currentResults.length;
    }

    updateSelectionUI();
}

function updateSelectionUI(): void {
    const container = getResultsContainer();
    if (!container) return;

    container.querySelectorAll<HTMLElement>(".global-search-item").forEach((item) => {
        const idx = parseInt(item.dataset["index"] ?? "-1", 10);
        item.classList.toggle("selected", idx === selectedIndex);
        item.setAttribute("aria-selected", String(idx === selectedIndex));
    });

    // Scroll selected item into view
    const selectedEl = container.querySelector<HTMLElement>(".global-search-item.selected");
    selectedEl?.scrollIntoView({ block: "nearest" });
}

function activateSelected(): void {
    if (selectedIndex >= 0 && selectedIndex < currentResults.length) {
        currentResults[selectedIndex]?.action();
    }
}

// ── Event binding ─────────────────────────────────────────────────────────────

/**
 * Initialize the global search feature.
 * Should be called once during application initialization.
 */
export function initializeGlobalSearch(): void {
    // Activity bar search button
    const searchBtn = document.getElementById("global-search-btn");
    if (searchBtn && !(searchBtn as HTMLElement & { _pptbBound?: boolean })._pptbBound) {
        (searchBtn as HTMLElement & { _pptbBound?: boolean })._pptbBound = true;
        searchBtn.addEventListener("click", () => openGlobalSearch());
    }

    // Overlay backdrop click → close
    const overlay = getOverlay();
    if (overlay && !(overlay as HTMLElement & { _pptbBound?: boolean })._pptbBound) {
        (overlay as HTMLElement & { _pptbBound?: boolean })._pptbBound = true;
        overlay.addEventListener("click", (e) => {
            if (e.target === overlay) closeGlobalSearch();
        });
    }

    // Search input
    const input = getInput();
    if (input && !(input as HTMLElement & { _pptbBound?: boolean })._pptbBound) {
        (input as HTMLElement & { _pptbBound?: boolean })._pptbBound = true;

        input.addEventListener("input", () => {
            runSearch(input.value).catch((err) => {
                captureException(err instanceof Error ? err : new Error(String(err)), {
                    tags: { context: "global_search", action: "input_search" },
                    level: "warning",
                });
            });
        });

        input.addEventListener("keydown", (e: KeyboardEvent) => {
            switch (e.key) {
                case "ArrowDown":
                    e.preventDefault();
                    moveSelection(1);
                    break;
                case "ArrowUp":
                    e.preventDefault();
                    moveSelection(-1);
                    break;
                case "Enter":
                    e.preventDefault();
                    activateSelected();
                    break;
                case "Escape":
                    e.preventDefault();
                    closeGlobalSearch();
                    break;
            }
        });
    }

    // Global keyboard shortcut: Ctrl+Shift+P
    document.addEventListener("keydown", (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "P") {
            e.preventDefault();
            if (isOpen) {
                closeGlobalSearch();
            } else {
                openGlobalSearch();
            }
        }
    });

    logInfo("Global search initialized", {});
}
