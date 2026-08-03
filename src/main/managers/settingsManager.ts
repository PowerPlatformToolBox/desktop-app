import { randomBytes } from "crypto";
import Store from "electron-store";
import { CspConsentRecord, LastUsedToolConnectionInfo, LastUsedToolEntry, LastUsedToolUpdate, MarketplaceSource, ToolSettings, UserSettings } from "../../common/types";
import { buildPreviewFeatureFlags } from "../../common/types/settings";
import { AZURE_BLOB_BASE_URL } from "../constants";

/**
 * Generates a random authentication token for MCP server access
 * Returns a 32-character hex string
 */
function generateMcpAccessToken(): string {
    return randomBytes(16).toString("hex");
}

/**
 * Manages user settings using electron-store
 * Note: Connection management has been moved to ConnectionsManager
 */
export class SettingsManager {
    private store: Store<UserSettings>;
    private toolSettingsStore: Store<{ [toolId: string]: ToolSettings }>;

    constructor() {
        this.store = new Store<UserSettings>({
            name: "user-settings",
            defaults: {
                theme: "system",
                language: "en",
                autoUpdate: true,
                terminalFont: "'Consolas', 'Monaco', 'Courier New', monospace",
                notificationDuration: 5000,
                showDebugMenu: false,
                deprecatedToolsVisibility: "hide-all",
                lastUsedTools: [],
                connections: [], // Kept for backwards compatibility, but use ConnectionsManager instead
                installedTools: [],
                favoriteTools: [],
                cspConsents: {}, // Track CSP consent for each tool
                toolConnections: {}, // Map of toolId to connectionId
                toolSecondaryConnections: {}, // Map of toolId to secondary connectionId
                connectionsSort: "last-used",
                restoreSessionOnStartup: true, // Reopen previously open tools on app start
                enablePreviewFeatures: false, // Show preview/experimental features in the UI
                previewFeatures: buildPreviewFeatureFlags(), // Per-feature preview toggles
                marketplaceSources: this.getDefaultMarketplaceSources(),
            },
        });

        this.migratePreviewFeatureSettings();

        this.toolSettingsStore = new Store<{ [toolId: string]: ToolSettings }>({
            name: "tool-settings",
            defaults: {},
        });
    }

    /**
     * Migrate legacy global preview toggle into per-feature flags while preserving
     * existing per-feature settings for users already on newer versions.
     */
    private migratePreviewFeatureSettings(): void {
        const legacyEnablePreviewFeatures = this.store.get("enablePreviewFeatures");
        const currentPreviewFeatures = this.store.get("previewFeatures");
        const normalizedPreviewFeatures = buildPreviewFeatureFlags(currentPreviewFeatures, typeof legacyEnablePreviewFeatures === "boolean" ? legacyEnablePreviewFeatures : undefined);

        this.store.set("previewFeatures", normalizedPreviewFeatures);

        const hasAnyPreviewFeatureEnabled = Object.values(normalizedPreviewFeatures).some((enabled) => enabled === true);
        this.store.set("enablePreviewFeatures", hasAnyPreviewFeatureEnabled);
    }

    private getDefaultMarketplaceSources(): MarketplaceSource[] {
        return [
            {
                id: "builtin-pptb",
                type: "builtin",
                label: "Power Platform ToolBox marketplace",
                url: AZURE_BLOB_BASE_URL ? `${AZURE_BLOB_BASE_URL}/registry.json` : "",
                enabled: true,
                description: "Built-in public marketplace",
            },
        ];
    }

    private normalizeMarketplaceSources(sources?: MarketplaceSource[]): MarketplaceSource[] {
        const normalized = (sources || []).filter((source) => Boolean(source?.id && source?.label && source?.url));
        const builtIn = normalized.find((source) => source.id === "builtin-pptb");
        if (!builtIn) {
            normalized.unshift(this.getDefaultMarketplaceSources()[0]);
        }

        const normalizedSources = normalized.map((source, index) => ({
            ...source,
            id: source.id || `marketplace-${index + 1}`,
            type: source.type || (source.id === "builtin-pptb" ? "builtin" : "private"),
            enabled: typeof source.enabled === "boolean" ? source.enabled : source.type === "builtin" ? true : false,
        }));

        const builtInSource = normalizedSources.find((source) => source.id === "builtin-pptb");
        if (builtInSource) {
            const hasPrivateEnabledSource = normalizedSources.some((source) => source.id !== "builtin-pptb" && source.enabled);
            builtInSource.enabled = hasPrivateEnabledSource ? builtInSource.enabled : true;
        }

        return normalizedSources;
    }

    private getMarketplaceSourcesFromStore(): MarketplaceSource[] {
        const storedSources = this.store.get("marketplaceSources");
        return this.normalizeMarketplaceSources(storedSources as MarketplaceSource[] | undefined);
    }

    private persistMarketplaceSources(sources: MarketplaceSource[]): void {
        this.store.set("marketplaceSources", this.normalizeMarketplaceSources(sources));
    }

    getMarketplaceSources(): MarketplaceSource[] {
        return this.getMarketplaceSourcesFromStore();
    }

    addMarketplaceSource(source: MarketplaceSource): MarketplaceSource[] {
        const sources = this.getMarketplaceSourcesFromStore();
        const nextSources = [...sources, source];
        this.persistMarketplaceSources(nextSources);
        return this.getMarketplaceSources();
    }

    setBuiltinMarketplaceEnabled(enabled: boolean): void {
        const sources = this.getMarketplaceSourcesFromStore();
        const builtInIndex = sources.findIndex((source) => source.id === "builtin-pptb");
        if (builtInIndex === -1) {
            return;
        }

        const hasPrivateSource = sources.some((source) => source.id !== "builtin-pptb" && source.enabled);
        const nextEnabled = hasPrivateSource ? enabled : true;
        sources[builtInIndex] = {
            ...sources[builtInIndex],
            enabled: nextEnabled,
        };

        this.persistMarketplaceSources(sources);
    }

    /**
     * Get all user settings
     */
    getUserSettings(): UserSettings {
        const settings = this.store.store;
        return {
            ...settings,
            marketplaceSources: this.getMarketplaceSourcesFromStore(),
        };
    }

    /**
     * Update user settings
     */
    updateUserSettings(settings: Partial<UserSettings>): void {
        Object.entries(settings).forEach(([key, value]) => {
            if (key === "marketplaceSources" && Array.isArray(value)) {
                this.store.set(key as keyof UserSettings, this.normalizeMarketplaceSources(value as MarketplaceSource[]));
                return;
            }

            this.store.set(key as keyof UserSettings, value);
        });
    }

    /**
     * Get a specific setting value
     */
    getSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
        return this.store.get(key);
    }

    /**
     * Set a specific setting value
     */
    setSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
        this.store.set(key, value);
    }

    /**
     * Get tool-specific settings
     */
    getToolSettings(toolId: string): ToolSettings | undefined {
        return this.toolSettingsStore.get(toolId);
    }

    /**
     * Update tool-specific settings
     */
    updateToolSettings(toolId: string, settings: ToolSettings): void {
        this.toolSettingsStore.set(toolId, settings);
    }

    /**
     * Delete tool-specific settings
     */
    deleteToolSettings(toolId: string): void {
        this.toolSettingsStore.delete(toolId);
    }

    /**
     * Add an installed tool to the list
     */
    addInstalledTool(packageName: string): void {
        const installedTools = this.store.get("installedTools") || [];
        if (!installedTools.includes(packageName)) {
            installedTools.push(packageName);
            this.store.set("installedTools", installedTools);
        }
    }

    /**
     * Remove an installed tool from the list
     */
    removeInstalledTool(packageName: string): void {
        const installedTools = this.store.get("installedTools") || [];
        const filtered = installedTools.filter((t: string) => t !== packageName);
        this.store.set("installedTools", filtered);
    }

    /**
     * Get all installed tools
     */
    getInstalledTools(): string[] {
        return this.store.get("installedTools") || [];
    }

    /**
     * Add a tool to favorites
     */
    addFavoriteTool(toolId: string): void {
        const favoriteTools = this.store.get("favoriteTools") || [];
        if (!favoriteTools.includes(toolId)) {
            favoriteTools.push(toolId);
            this.store.set("favoriteTools", favoriteTools);
        }
    }

    /**
     * Remove a tool from favorites
     */
    removeFavoriteTool(toolId: string): void {
        const favoriteTools = this.store.get("favoriteTools") || [];
        const filtered = favoriteTools.filter((t: string) => t !== toolId);
        this.store.set("favoriteTools", filtered);
    }

    /**
     * Get all favorite tools
     */
    getFavoriteTools(): string[] {
        return this.store.get("favoriteTools") || [];
    }

    /**
     * Check if a tool is favorited
     */
    isFavoriteTool(toolId: string): boolean {
        const favoriteTools = this.store.get("favoriteTools") || [];
        return favoriteTools.includes(toolId);
    }

    /**
     * Toggle favorite status for a tool
     */
    toggleFavoriteTool(toolId: string): boolean {
        if (this.isFavoriteTool(toolId)) {
            this.removeFavoriteTool(toolId);
            return false;
        } else {
            this.addFavoriteTool(toolId);
            return true;
        }
    }

    /**
     * Check if CSP consent has been granted for a tool
     */
    hasCspConsent(toolId: string): boolean {
        const cspConsents = this.store.get("cspConsents") || {};
        return cspConsents[toolId]?.allowed === true;
    }

    /**
     * Grant CSP consent for a tool
     * @param toolId - The tool ID
     * @param requiredDomains - The required (non-optional) domains at the time of consent
     * @param approvedOptionalDomains - Optional domains approved by the user (empty means none approved)
     * @param seenOptionalDomains - All optional domains presented to the user (approved or declined), used for re-consent detection
     */
    grantCspConsent(toolId: string, requiredDomains: string[] = [], approvedOptionalDomains: string[] = [], seenOptionalDomains: string[] = []): void {
        const cspConsents = this.store.get("cspConsents") || {};
        cspConsents[toolId] = { allowed: true, required: requiredDomains, optional: approvedOptionalDomains, seenOptional: seenOptionalDomains };
        this.store.set("cspConsents", cspConsents);
    }

    /**
     * Revoke CSP consent for a tool
     */
    revokeCspConsent(toolId: string): void {
        const cspConsents = this.store.get("cspConsents") || {};
        delete cspConsents[toolId];
        this.store.set("cspConsents", cspConsents);
    }

    /**
     * Get all tools with CSP consent (keyed by tool ID)
     */
    getCspConsents(): { [toolId: string]: CspConsentRecord } {
        return this.store.get("cspConsents") || {};
    }

    /**
     * Get the list of required domains that were consented to for a tool
     */
    getApprovedRequiredDomains(toolId: string): string[] {
        const cspConsents = this.store.get("cspConsents") || {};
        return cspConsents[toolId]?.required ?? [];
    }

    /**
     * Get the list of approved optional domains for a tool
     */
    getApprovedOptionalDomains(toolId: string): string[] {
        const cspConsents = this.store.get("cspConsents") || {};
        return cspConsents[toolId]?.optional ?? [];
    }

    /**
     * Set connection for a specific tool
     */
    setToolConnection(toolId: string, connectionId: string): void {
        const toolConnections = this.store.get("toolConnections") || {};
        toolConnections[toolId] = connectionId;
        this.store.set("toolConnections", toolConnections);
    }

    /**
     * Get connection for a specific tool
     */
    getToolConnection(toolId: string): string | null {
        const toolConnections = this.store.get("toolConnections") || {};
        return toolConnections[toolId] || null;
    }

    /**
     * Remove connection association for a specific tool
     */
    removeToolConnection(toolId: string): void {
        const toolConnections = this.store.get("toolConnections") || {};
        delete toolConnections[toolId];
        this.store.set("toolConnections", toolConnections);
    }

    /**
     * Get all tool-connection mappings
     */
    getAllToolConnections(): { [toolId: string]: string } {
        return this.store.get("toolConnections") || {};
    }

    /**
     * Set a tool's secondary connection (for multi-connection tools)
     */
    setToolSecondaryConnection(toolId: string, connectionId: string): void {
        const secondaryConnections = this.store.get("toolSecondaryConnections") || {};
        secondaryConnections[toolId] = connectionId;
        this.store.set("toolSecondaryConnections", secondaryConnections);
    }

    /**
     * Get a tool's secondary connection ID (for multi-connection tools)
     */
    getToolSecondaryConnection(toolId: string): string | null {
        const secondaryConnections = this.store.get("toolSecondaryConnections") || {};
        return secondaryConnections[toolId] || null;
    }

    /**
     * Remove a tool's secondary connection (for multi-connection tools)
     */
    removeToolSecondaryConnection(toolId: string): void {
        const secondaryConnections = this.store.get("toolSecondaryConnections") || {};
        delete secondaryConnections[toolId];
        this.store.set("toolSecondaryConnections", secondaryConnections);
    }

    /**
     * Get all tool secondary connections
     */
    getAllToolSecondaryConnections(): { [toolId: string]: string } {
        return this.store.get("toolSecondaryConnections") || {};
    }

    /**
     * Add a tool to the recently used list
     * Keeps track of tool usage order with most recent at the end
     */
    addLastUsedTool(entry: LastUsedToolUpdate): void {
        if (!entry?.toolId) {
            return;
        }

        const normalizedEntry: LastUsedToolEntry = {
            toolId: entry.toolId,
            primaryConnection: this.normalizeConnectionInfo(entry.primaryConnection) ?? undefined,
            secondaryConnection: this.normalizeConnectionInfo(entry.secondaryConnection) ?? undefined,
            lastUsedAt: entry.lastUsedAt || new Date().toISOString(),
        };

        const lastUsedTools = this.getLastUsedTools();
        const filtered = lastUsedTools.filter((existing) => !this.isSameUsage(existing, normalizedEntry));
        filtered.push(normalizedEntry);
        const trimmed = filtered.slice(-20);
        this.store.set("lastUsedTools", trimmed);
    }

    /**
     * Get all recently used tools (ordered from oldest to newest)
     */
    getLastUsedTools(): LastUsedToolEntry[] {
        const stored = this.store.get("lastUsedTools") || [];
        if (!Array.isArray(stored)) {
            return [];
        }

        return stored.map((entry) => this.normalizeLastUsedToolEntry(entry)).filter((entry): entry is LastUsedToolEntry => entry !== null);
    }

    /**
     * Get the MCP access token, generating one if it doesn't exist
     */
    getMcpAccessToken(): string {
        let token = this.store.get("mcpAccessToken");
        if (!token) {
            token = generateMcpAccessToken();
            this.store.set("mcpAccessToken", token);
        }
        return token;
    }

    /**
     * Clear the recently used tools list
     */
    clearLastUsedTools(): void {
        this.store.set("lastUsedTools", []);
    }

    private normalizeLastUsedToolEntry(entry: unknown): LastUsedToolEntry | null {
        if (!entry) {
            return null;
        }

        if (typeof entry === "string") {
            return {
                toolId: entry,
                lastUsedAt: new Date().toISOString(),
            };
        }

        if (typeof entry === "object" && "toolId" in entry) {
            const typedEntry = entry as Partial<LastUsedToolEntry> & { toolId: string };
            return {
                toolId: typedEntry.toolId,
                lastUsedAt: typedEntry.lastUsedAt || new Date().toISOString(),
                primaryConnection: this.normalizeConnectionInfo(typedEntry.primaryConnection) ?? undefined,
                secondaryConnection: this.normalizeConnectionInfo(typedEntry.secondaryConnection) ?? undefined,
            };
        }

        return null;
    }

    private normalizeConnectionInfo(info?: LastUsedToolConnectionInfo | null): LastUsedToolConnectionInfo | undefined {
        if (!info) {
            return undefined;
        }

        return {
            id: info.id ?? null,
            name: info.name ?? undefined,
            environment: info.environment,
            url: info.url,
        };
    }

    private isSameUsage(a: LastUsedToolEntry, b: LastUsedToolEntry): boolean {
        const primaryMatch = (a.primaryConnection?.id ?? null) === (b.primaryConnection?.id ?? null);
        const secondaryMatch = (a.secondaryConnection?.id ?? null) === (b.secondaryConnection?.id ?? null);
        return a.toolId === b.toolId && primaryMatch && secondaryMatch;
    }
}
