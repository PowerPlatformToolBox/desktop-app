import { EVENT_CHANNELS } from "../../common/ipc/channels";
import type { ModalWindowClosedPayload, ModalWindowMessagePayload, ModalWindowOptions } from "../../common/types";

export type ModalWindowMessageHandler = (payload: ModalWindowMessagePayload) => void;
export type ModalWindowClosedHandler = (payload: ModalWindowClosedPayload) => void;

const messageHandlers = new Set<ModalWindowMessageHandler>();
const closedHandlers = new Set<ModalWindowClosedHandler>();
let listenersInitialized = false;

function initializeIpcListeners(): void {
    if (listenersInitialized) return;

    window.api.on(EVENT_CHANNELS.MODAL_WINDOW_MESSAGE, (_, payload) => {
        messageHandlers.forEach((handler) => handler((payload as ModalWindowMessagePayload) ?? { channel: "" }));
    });

    window.api.on(EVENT_CHANNELS.MODAL_WINDOW_CLOSED, (_, payload) => {
        closedHandlers.forEach((handler) => handler((payload as ModalWindowClosedPayload) ?? { id: null }));
    });

    listenersInitialized = true;
}

export function initializeBrowserWindowModals(): void {
    initializeIpcListeners();
}

export async function showBrowserWindowModal(options: ModalWindowOptions): Promise<void> {
    if (!options?.html) {
        throw new Error("Modal HTML content is required.");
    }

    if (!options.width || !options.height) {
        throw new Error("Modal width and height are required.");
    }

    initializeIpcListeners();
    await window.toolboxAPI.utils.showModalWindow(options);
}

export async function showBrowserWindowModalFromElement(element: HTMLElement, options: Omit<ModalWindowOptions, "html">): Promise<void> {
    if (!element) {
        throw new Error("Modal root element not found.");
    }

    await showBrowserWindowModal({ ...options, html: element.outerHTML });
}

export async function showBrowserWindowModalFromSelector(selector: string, options: Omit<ModalWindowOptions, "html">): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
        throw new Error(`No element matches selector: ${selector}`);
    }
    await showBrowserWindowModalFromElement(element as HTMLElement, options);
}

export async function closeBrowserWindowModal(): Promise<void> {
    await window.toolboxAPI.utils.closeModalWindow();
}

export async function sendBrowserWindowModalMessage(payload: ModalWindowMessagePayload): Promise<void> {
    await window.toolboxAPI.utils.sendModalMessage(payload);
}

export function onBrowserWindowModalMessage(handler: ModalWindowMessageHandler): void {
    initializeIpcListeners();
    messageHandlers.add(handler);
}

export function offBrowserWindowModalMessage(handler: ModalWindowMessageHandler): void {
    messageHandlers.delete(handler);
}

export function onBrowserWindowModalClosed(handler: ModalWindowClosedHandler): void {
    initializeIpcListeners();
    closedHandlers.add(handler);
}

export function offBrowserWindowModalClosed(handler: ModalWindowClosedHandler): void {
    closedHandlers.delete(handler);
}
