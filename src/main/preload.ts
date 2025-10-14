import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload script that exposes safe APIs to the renderer process
 */
contextBridge.exposeInMainWorld('toolboxAPI', {
  // Settings
  getUserSettings: () => ipcRenderer.invoke('get-user-settings'),
  updateUserSettings: (settings: unknown) => ipcRenderer.invoke('update-user-settings', settings),
  getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key: string, value: unknown) => ipcRenderer.invoke('set-setting', key, value),

  // Connections
  addConnection: (connection: unknown) => ipcRenderer.invoke('add-connection', connection),
  updateConnection: (id: string, updates: unknown) => ipcRenderer.invoke('update-connection', id, updates),
  deleteConnection: (id: string) => ipcRenderer.invoke('delete-connection', id),
  getConnections: () => ipcRenderer.invoke('get-connections'),

  // Tools
  getAllTools: () => ipcRenderer.invoke('get-all-tools'),
  getTool: (toolId: string) => ipcRenderer.invoke('get-tool', toolId),
  loadTool: (packageName: string) => ipcRenderer.invoke('load-tool', packageName),
  unloadTool: (toolId: string) => ipcRenderer.invoke('unload-tool', toolId),
  installTool: (packageName: string) => ipcRenderer.invoke('install-tool', packageName),
  uninstallTool: (packageName: string, toolId: string) => ipcRenderer.invoke('uninstall-tool', packageName, toolId),

  // Tool Settings
  getToolSettings: (toolId: string) => ipcRenderer.invoke('get-tool-settings', toolId),
  updateToolSettings: (toolId: string, settings: unknown) => ipcRenderer.invoke('update-tool-settings', toolId, settings),

  // Notifications
  showNotification: (options: unknown) => ipcRenderer.invoke('show-notification', options),

  // Events
  getEventHistory: (limit?: number) => ipcRenderer.invoke('get-event-history', limit),
  onToolboxEvent: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.on('toolbox-event', callback);
  },
  removeToolboxEventListener: (callback: (event: unknown, payload: unknown) => void) => {
    ipcRenderer.removeListener('toolbox-event', callback);
  },
});
