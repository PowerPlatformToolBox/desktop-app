import Store from 'electron-store';
import { ToolSettings, UserSettings } from '../../types';

/**
 * Manages user settings using electron-store
 * Note: Connection management has been moved to ConnectionsManager
 */
export class SettingsManager {
  private store: Store<UserSettings>;
  private toolSettingsStore: Store<{ [toolId: string]: ToolSettings }>;

  constructor() {
    this.store = new Store<UserSettings>({
      name: 'user-settings',
      defaults: {
        theme: 'system',
        language: 'en',
        autoUpdate: true,
        terminalFont: "'Consolas', 'Monaco', 'Courier New', monospace",
        showDebugMenu: false,
        lastUsedTools: [],
        connections: [], // Kept for backwards compatibility, but use ConnectionsManager instead
        installedTools: [],
      },
    });

    this.toolSettingsStore = new Store<{ [toolId: string]: ToolSettings }>({
      name: 'tool-settings',
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
    const installedTools = this.store.get('installedTools') || [];
    if (!installedTools.includes(packageName)) {
      installedTools.push(packageName);
      this.store.set('installedTools', installedTools);
    }
  }

  /**
   * Remove an installed tool from the list
   */
  removeInstalledTool(packageName: string): void {
    const installedTools = this.store.get('installedTools') || [];
    const filtered = installedTools.filter(t => t !== packageName);
    this.store.set('installedTools', filtered);
  }

  /**
   * Get all installed tools
   */
  getInstalledTools(): string[] {
    return this.store.get('installedTools') || [];
  }
}
