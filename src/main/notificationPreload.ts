import { contextBridge, ipcRenderer } from "electron";

// Expose a minimal API for the notification window to send IPC messages
contextBridge.exposeInMainWorld("electron", {
    dismissNotification: (index: number) => ipcRenderer.send("notification:dismiss", index),
    actionClicked: (index: number, actionIndex: number) => ipcRenderer.send("notification:action", index, actionIndex),
    clearHistory: () => ipcRenderer.send("notification-history:clear"),
    closeHistoryPanel: () => ipcRenderer.send("notification-history:close"),
});
