import { contextBridge, ipcRenderer } from "electron";
import { MODAL_WINDOW_CHANNELS } from "../common/ipc/channels";

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
