import { contextBridge, ipcRenderer } from "electron";
import { CONNECTION_CHANNELS, MODAL_WINDOW_CHANNELS, TOOL_REPORT_CHANNELS, UTIL_CHANNELS } from "../common/ipc/channels";

type ModalMessageHandler = (payload: unknown) => void;
const messageHandlers = new Set<ModalMessageHandler>();

ipcRenderer.on(MODAL_WINDOW_CHANNELS.RENDERER_MESSAGE, (_, payload) => {
    messageHandlers.forEach((handler) => handler(payload));
});

contextBridge.exposeInMainWorld("modalBridge", {
    close: () => ipcRenderer.invoke(MODAL_WINDOW_CHANNELS.CLOSE),
    send: (channel: string, data?: unknown) => ipcRenderer.send(MODAL_WINDOW_CHANNELS.MESSAGE, { channel, data }),
    onMessage: (handler: ModalMessageHandler) => {
        messageHandlers.add(handler);
    },
    offMessage: (handler: ModalMessageHandler) => {
        messageHandlers.delete(handler);
    },
});

// Expose browser detection and category lookup APIs for connection modals
contextBridge.exposeInMainWorld("toolboxAPI", {
    connections: {
        checkBrowserInstalled: (browserType: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.CHECK_BROWSER_INSTALLED, browserType),
        getBrowserProfiles: (browserType: string) => ipcRenderer.invoke(CONNECTION_CHANNELS.GET_BROWSER_PROFILES, browserType),
        getCategories: () => ipcRenderer.invoke(CONNECTION_CHANNELS.GET_CATEGORIES),
        configureAppRegistration: (clientId: string, includePowerPlatformPermissions?: boolean, generateOnly?: boolean) =>
            ipcRenderer.invoke(CONNECTION_CHANNELS.CONFIGURE_APP_REGISTRATION, { clientId, includePowerPlatformPermissions, generateOnly }),
    },
    reportTool: {
        submitConcern: (report: unknown) => ipcRenderer.invoke(TOOL_REPORT_CHANNELS.SUBMIT_CONCERN, report),
        hasReportedConcern: (toolId: string) => ipcRenderer.invoke(TOOL_REPORT_CHANNELS.HAS_REPORTED_CONCERN, toolId),
    },
    utils: {
        copyToClipboard: (text: string) => ipcRenderer.invoke(UTIL_CHANNELS.COPY_TO_CLIPBOARD, text),
        showNotification: (options: unknown) => ipcRenderer.invoke(UTIL_CHANNELS.SHOW_NOTIFICATION, options),
    },
});
