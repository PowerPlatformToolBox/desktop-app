import Store from 'electron-store';
import { UserSettings, DataverseConnection, ToolSettings } from '../types';

/**
 * Manages user settings using electron-store
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
        lastUsedTools: [],
        connections: [],
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
   * Add a Dataverse connection
   */
  addConnection(connection: DataverseConnection): void {
    const connections = this.store.get('connections');
    connections.push(connection);
    this.store.set('connections', connections);
  }

  /**
   * Update a Dataverse connection
   */
  updateConnection(id: string, updates: Partial<DataverseConnection>): void {
    const connections = this.store.get('connections');
    const index = connections.findIndex(c => c.id === id);
    if (index !== -1) {
      connections[index] = { ...connections[index], ...updates };
      this.store.set('connections', connections);
    }
  }

  /**
   * Delete a Dataverse connection
   */
  deleteConnection(id: string): void {
    const connections = this.store.get('connections');
    const filtered = connections.filter(c => c.id !== id);
    this.store.set('connections', filtered);
  }

  /**
   * Get all connections
   */
  getConnections(): DataverseConnection[] {
    return this.store.get('connections');
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
}
