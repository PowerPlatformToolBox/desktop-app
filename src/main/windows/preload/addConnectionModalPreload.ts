import { contextBridge, ipcRenderer } from "electron";
import { CONNECTION_CHANNELS, MODAL_CHANNELS, UTIL_CHANNELS } from "../../../common/ipc/channels";
import type { DataverseConnection } from "../../../common/types/connection";
import type { NotificationOptions } from "../../../common/types/common";

const modalApi = {
    addConnection: async (connection: DataverseConnection) => {
        await ipcRenderer.invoke(CONNECTION_CHANNELS.ADD_CONNECTION, connection);
    },
    testConnection: async (connection: DataverseConnection) => {
        return await ipcRenderer.invoke(CONNECTION_CHANNELS.TEST_CONNECTION, connection);
    },
    showNotification: async (options: NotificationOptions) => {
        await ipcRenderer.invoke(UTIL_CHANNELS.SHOW_NOTIFICATION, options);
    },
    closeModal: async (reason?: string) => {
        console.log("[modal-preload] closeModal called", reason);
        try {
            await ipcRenderer.invoke(MODAL_CHANNELS.CLOSE_ACTIVE, reason);
        } catch (error) {
            console.warn("modal: failed to invoke close handler", error);
        }
    },
};

contextBridge.exposeInMainWorld("modalApi", modalApi);

declare global {
    interface Window {
        modalApi: typeof modalApi;
    }
}
