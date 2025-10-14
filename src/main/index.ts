import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import { SettingsManager } from './settings-manager';
import { ToolManager } from './tool-manager';
import { ToolBoxAPI } from '../api/toolbox-api';
import { AutoUpdateManager } from './auto-update-manager';
import { ToolBoxEvent } from '../types';

class ToolBoxApp {
  private mainWindow: BrowserWindow | null = null;
  private settingsManager: SettingsManager;
  private toolManager: ToolManager;
  private api: ToolBoxAPI;
  private autoUpdateManager: AutoUpdateManager;

  constructor() {
    this.settingsManager = new SettingsManager();
    this.toolManager = new ToolManager(path.join(app.getPath('userData'), 'tools'));
    this.api = new ToolBoxAPI();
    this.autoUpdateManager = new AutoUpdateManager();

    this.setupEventListeners();
    this.setupIpcHandlers();
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    // Listen to tool manager events
    this.toolManager.on('tool:loaded', (tool) => {
      this.api.emitEvent(ToolBoxEvent.TOOL_LOADED, tool);
    });

    this.toolManager.on('tool:unloaded', (tool) => {
      this.api.emitEvent(ToolBoxEvent.TOOL_UNLOADED, tool);
    });

    // Listen to API events and forward to renderer
    this.api.on(ToolBoxEvent.NOTIFICATION_SHOWN, (payload) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send('toolbox-event', payload);
      }
    });

    // Listen to auto-update events
    this.autoUpdateManager.on('update-available', (info) => {
      this.api.showNotification({
        title: 'Update Available',
        body: `Version ${info.version} is available for download.`,
        type: 'info',
      });
    });

    this.autoUpdateManager.on('update-downloaded', (info) => {
      this.api.showNotification({
        title: 'Update Ready',
        body: `Version ${info.version} has been downloaded and will be installed on restart.`,
        type: 'success',
      });
    });

    this.autoUpdateManager.on('update-error', (error) => {
      this.api.showNotification({
        title: 'Update Error',
        body: `Failed to check for updates: ${error.message}`,
        type: 'error',
      });
    });
  }

  /**
   * Set up IPC handlers for communication with renderer
   */
  private setupIpcHandlers(): void {
    // Settings handlers
    ipcMain.handle('get-user-settings', () => {
      return this.settingsManager.getUserSettings();
    });

    ipcMain.handle('update-user-settings', (_, settings) => {
      this.settingsManager.updateUserSettings(settings);
      this.api.emitEvent(ToolBoxEvent.SETTINGS_UPDATED, settings);
    });

    ipcMain.handle('get-setting', (_, key) => {
      return this.settingsManager.getSetting(key);
    });

    ipcMain.handle('set-setting', (_, key, value) => {
      this.settingsManager.setSetting(key, value);
    });

    // Connection handlers
    ipcMain.handle('add-connection', (_, connection) => {
      this.settingsManager.addConnection(connection);
      this.api.emitEvent(ToolBoxEvent.CONNECTION_CREATED, connection);
    });

    ipcMain.handle('update-connection', (_, id, updates) => {
      this.settingsManager.updateConnection(id, updates);
      this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, updates });
    });

    ipcMain.handle('delete-connection', (_, id) => {
      this.settingsManager.deleteConnection(id);
      this.api.emitEvent(ToolBoxEvent.CONNECTION_DELETED, { id });
    });

    ipcMain.handle('get-connections', () => {
      return this.settingsManager.getConnections();
    });

    // Tool handlers
    ipcMain.handle('get-all-tools', () => {
      return this.toolManager.getAllTools();
    });

    ipcMain.handle('get-tool', (_, toolId) => {
      return this.toolManager.getTool(toolId);
    });

    ipcMain.handle('load-tool', async (_, packageName) => {
      return await this.toolManager.loadTool(packageName);
    });

    ipcMain.handle('unload-tool', (_, toolId) => {
      this.toolManager.unloadTool(toolId);
    });

    ipcMain.handle('install-tool', async (_, packageName) => {
      await this.toolManager.installTool(packageName);
      return await this.toolManager.loadTool(packageName);
    });

    ipcMain.handle('uninstall-tool', async (_, packageName, toolId) => {
      this.toolManager.unloadTool(toolId);
      await this.toolManager.uninstallTool(packageName);
    });

    // Tool settings handlers
    ipcMain.handle('get-tool-settings', (_, toolId) => {
      return this.settingsManager.getToolSettings(toolId);
    });

    ipcMain.handle('update-tool-settings', (_, toolId, settings) => {
      this.settingsManager.updateToolSettings(toolId, settings);
    });

    // Notification handler
    ipcMain.handle('show-notification', (_, options) => {
      this.api.showNotification(options);
    });

    // Event history handler
    ipcMain.handle('get-event-history', (_, limit) => {
      return this.api.getEventHistory(limit);
    });

    // Auto-update handlers
    ipcMain.handle('check-for-updates', async () => {
      await this.autoUpdateManager.checkForUpdates();
    });

    ipcMain.handle('download-update', async () => {
      await this.autoUpdateManager.downloadUpdate();
    });

    ipcMain.handle('quit-and-install', () => {
      this.autoUpdateManager.quitAndInstall();
    });

    ipcMain.handle('get-app-version', () => {
      return this.autoUpdateManager.getCurrentVersion();
    });
  }

  /**
   * Create the main application window
   */
  private createWindow(): void {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
      },
      title: 'PowerPlatform ToolBox',
      icon: path.join(__dirname, '../../assets/icon.png'),
    });

    // Set the main window for auto-updater
    this.autoUpdateManager.setMainWindow(this.mainWindow);

    // Load the index.html
    this.mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

    // Open DevTools in development
    if (process.env.NODE_ENV === 'development') {
      this.mainWindow.webContents.openDevTools();
    }

    this.mainWindow.on('closed', () => {
      this.mainWindow = null;
    });
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<void> {
    await app.whenReady();
    this.createWindow();

    // Check if auto-update is enabled
    const autoUpdate = this.settingsManager.getSetting('autoUpdate');
    if (autoUpdate) {
      // Enable automatic update checks every 6 hours
      this.autoUpdateManager.enableAutoUpdateChecks(6);
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('before-quit', () => {
      // Clean up update checks
      this.autoUpdateManager.disableAutoUpdateChecks();
    });
  }
}

// Create and initialize the application
const toolboxApp = new ToolBoxApp();
toolboxApp.initialize().catch(console.error);
