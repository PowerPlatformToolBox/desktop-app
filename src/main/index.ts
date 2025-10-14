import { app, BrowserWindow, ipcMain, Menu, shell } from 'electron';
import * as path from 'path';
import { ToolBoxAPI } from '../api/toolboxAPI';
import { ToolBoxEvent } from '../types';
import { AutoUpdateManager } from './managers/autoUpdateManager';
import { SettingsManager } from './managers/settingsManager';
import { ToolManager } from './managers/toolsManager';

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

    // Forward ALL ToolBox events to renderer process
    const eventTypes = [
      ToolBoxEvent.TOOL_LOADED,
      ToolBoxEvent.TOOL_UNLOADED,
      ToolBoxEvent.CONNECTION_CREATED,
      ToolBoxEvent.CONNECTION_UPDATED,
      ToolBoxEvent.CONNECTION_DELETED,
      ToolBoxEvent.SETTINGS_UPDATED,
      ToolBoxEvent.NOTIFICATION_SHOWN
    ];

    eventTypes.forEach(eventType => {
      this.api.on(eventType, (payload) => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send('toolbox-event', payload);
        }
      });
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

    ipcMain.handle('set-active-connection', (_, id) => {
      this.settingsManager.setActiveConnection(id);
      this.api.emitEvent(ToolBoxEvent.CONNECTION_UPDATED, { id, isActive: true });
    });

    ipcMain.handle('get-active-connection', () => {
      return this.settingsManager.getActiveConnection();
    });

    ipcMain.handle('disconnect-connection', () => {
      this.settingsManager.disconnectActiveConnection();
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

    // Clipboard handler
    ipcMain.handle('copy-to-clipboard', (_, text) => {
      this.api.copyToClipboard(text);
    });

    // Save file handler
    ipcMain.handle('save-file', async (_, defaultPath, content) => {
      return await this.api.saveFile(defaultPath, content);
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
   * Create application menu
   */
  private createMenu(): void {
    const isMac = process.platform === 'darwin';

    const template: any[] = [
      // App menu (macOS only)
      ...(isMac ? [{
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      }] : []),

      // File menu
      {
        label: 'File',
        submenu: [
          isMac ? { role: 'close' } : { role: 'quit' }
        ]
      },

      // Edit menu
      {
        label: 'Edit',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          ...(isMac ? [
            { role: 'pasteAndMatchStyle' },
            { role: 'delete' },
            { role: 'selectAll' },
            { type: 'separator' },
            {
              label: 'Speech',
              submenu: [
                { role: 'startSpeaking' },
                { role: 'stopSpeaking' }
              ]
            }
          ] : [
            { role: 'delete' },
            { type: 'separator' },
            { role: 'selectAll' }
          ])
        ]
      },

      // View menu
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { 
            label: 'Toggle Developer Tools',
            accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.webContents.toggleDevTools();
              }
            }
          },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },

      // Window menu
      {
        label: 'Window',
        submenu: [
          { role: 'minimize' },
          { role: 'zoom' },
          ...(isMac ? [
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' }
          ] : [
            { role: 'close' }
          ])
        ]
      },

      // Help menu
      {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              await shell.openExternal('https://github.com/PowerPlatform-ToolBox/desktop-app');
            }
          },
          {
            label: 'Documentation',
            click: async () => {
              await shell.openExternal('https://github.com/PowerPlatform-ToolBox/desktop-app#readme');
            }
          },
          { type: 'separator' },
          {
            label: 'Toggle Developer Tools',
            accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I',
            click: () => {
              if (this.mainWindow) {
                this.mainWindow.webContents.toggleDevTools();
              }
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
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
        webviewTag: true, // Enable webview tag
      },
      title: 'PowerPlatform ToolBox',
      icon: path.join(__dirname, '../../assets/icon.png'),
    });

    // Set the main window for auto-updater
    this.autoUpdateManager.setMainWindow(this.mainWindow);

    // Create the application menu
    this.createMenu();

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
