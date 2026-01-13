import Store from "electron-store";
import { ToolSettings, UserSettings } from "../../common/types";

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
                showDebugMenu: false,
                deprecatedToolsVisibility: "hide-all",
                lastUsedTools: [],
                connections: [], // Kept for backwards compatibility, but use ConnectionsManager instead
                installedTools: [],
                favoriteTools: [],
                cspConsents: {}, // Track CSP consent for each tool
                toolConnections: {}, // Map of toolId to connectionId
                toolSecondaryConnections: {}, // Map of toolId to secondary connectionId
            },
        });

        this.toolSettingsStore = new Store<{ [toolId: string]: ToolSettings }>({
            name: "tool-settings",
            defaults: {},
        });
    }

    /**
     * Get all user settings
     */
    getUserSettings(): UserSettings {
        return this.store.store;
    }

    /**
     * Update user settings
     */
    updateUserSettings(settings: Partial<UserSettings>): void {
        Object.entries(settings).forEach(([key, value]) => {
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
        return cspConsents[toolId] === true;
    }

    /**
     * Grant CSP consent for a tool
     */
    grantCspConsent(toolId: string): void {
        const cspConsents = this.store.get("cspConsents") || {};
        cspConsents[toolId] = true;
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
     * Get all tools with CSP consent
     */
    getCspConsents(): { [toolId: string]: boolean } {
        return this.store.get("cspConsents") || {};
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
    addLastUsedTool(toolId: string): void {
        const lastUsedTools = this.store.get("lastUsedTools") || [];
        // Remove the tool if it already exists to avoid duplicates
        const filtered = lastUsedTools.filter((t: string) => t !== toolId);
        // Add the tool to the end (most recent)
        filtered.push(toolId);
        // Keep only the last 20 tools
        const trimmed = filtered.slice(-20);
        this.store.set("lastUsedTools", trimmed);
    }

    /**
     * Get all recently used tools (ordered from oldest to newest)
     */
    getLastUsedTools(): string[] {
        return this.store.get("lastUsedTools") || [];
    }

    /**
     * Clear the recently used tools list
     */
    clearLastUsedTools(): void {
        this.store.set("lastUsedTools", []);
    }
}
