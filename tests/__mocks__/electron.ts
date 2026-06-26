/**
 * Manual mock for the `electron` module.
 *
 * Used by Jest unit tests running in Node.js where the real Electron runtime is
 * not available. Each API surface is implemented with the minimum behaviour
 * required by the managers under test.
 */

// ---------------------------------------------------------------------------
// safeStorage mock
// ---------------------------------------------------------------------------
const _encryptionAvailable = true;

export const safeStorage = {
    isEncryptionAvailable: jest.fn(() => _encryptionAvailable),

    // Encode as base64 to simulate opaque encrypted bytes
    encryptString: jest.fn((plaintext: string): Buffer => Buffer.from(plaintext, "utf8")),

    // Decode base64-encoded "encrypted" data (mirrors encryptString above)
    decryptString: jest.fn((buffer: Buffer): string => buffer.toString("utf8")),
};

// ---------------------------------------------------------------------------
// app mock
// ---------------------------------------------------------------------------
export const app = {
    getPath: jest.fn((name: string) => `/tmp/electron-mock/${name}`),
    getVersion: jest.fn(() => "0.0.0-test"),
    getName: jest.fn(() => "PowerPlatformToolbox-test"),
    isReady: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
    quit: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
};

// ---------------------------------------------------------------------------
// BrowserWindow mock
// ---------------------------------------------------------------------------
export class BrowserWindow {
    webContents = {
        send: jest.fn(),
        on: jest.fn(),
        executeJavaScript: jest.fn(() => Promise.resolve()),
    };
    on = jest.fn();
    once = jest.fn();
    loadURL = jest.fn(() => Promise.resolve());
    loadFile = jest.fn(() => Promise.resolve());
    show = jest.fn();
    hide = jest.fn();
    close = jest.fn();
    isDestroyed = jest.fn(() => false);
    addBrowserView = jest.fn();
    removeBrowserView = jest.fn();
    getBrowserViews = jest.fn(() => [] as BrowserView[]);
    static getAllWindows = jest.fn(() => []);
    static fromWebContents = jest.fn(() => null);
}

// ---------------------------------------------------------------------------
// ipcMain mock
// ---------------------------------------------------------------------------
export const ipcMain = {
    handle: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
};

// ---------------------------------------------------------------------------
// shell mock
// ---------------------------------------------------------------------------
export const shell = {
    openExternal: jest.fn(() => Promise.resolve()),
    openPath: jest.fn(() => Promise.resolve("")),
};

// ---------------------------------------------------------------------------
// clipboard mock
// ---------------------------------------------------------------------------
export const clipboard = {
    writeText: jest.fn(),
    readText: jest.fn(() => ""),
};

// ---------------------------------------------------------------------------
// dialog mock
// ---------------------------------------------------------------------------
export const dialog = {
    showOpenDialog: jest.fn(() => Promise.resolve({ canceled: true, filePaths: [] })),
    showSaveDialog: jest.fn(() => Promise.resolve({ canceled: true })),
    showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
};

// ---------------------------------------------------------------------------
// protocol mock
// ---------------------------------------------------------------------------
export const protocol = {
    registerFileProtocol: jest.fn(),
    registerHttpProtocol: jest.fn(),
    interceptFileProtocol: jest.fn(),
    unregisterProtocol: jest.fn(),
    handle: jest.fn(),
};

// ---------------------------------------------------------------------------
// nativeImage mock
// ---------------------------------------------------------------------------
export const nativeImage = {
    createFromPath: jest.fn(() => ({ isEmpty: () => true })),
    createEmpty: jest.fn(() => ({ isEmpty: () => true })),
};

// ---------------------------------------------------------------------------
// Tray mock
// ---------------------------------------------------------------------------
export class Tray {
    setToolTip = jest.fn();
    setContextMenu = jest.fn();
    on = jest.fn();
    destroy = jest.fn();
}

// ---------------------------------------------------------------------------
// Menu mock
// ---------------------------------------------------------------------------
export const Menu = {
    buildFromTemplate: jest.fn(() => ({})),
    setApplicationMenu: jest.fn(),
};

// ---------------------------------------------------------------------------
// BrowserView mock
// ---------------------------------------------------------------------------
export class BrowserView {
    webContents = {
        send: jest.fn(),
        on: jest.fn(),
        loadURL: jest.fn(() => Promise.resolve()),
        executeJavaScript: jest.fn(() => Promise.resolve()),
        setWindowOpenHandler: jest.fn(),
        isDestroyed: jest.fn(() => false),
    };
    setBounds = jest.fn();
    setAutoResize = jest.fn();
}
