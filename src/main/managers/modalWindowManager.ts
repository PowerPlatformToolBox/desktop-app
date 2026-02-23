import { BrowserWindow } from "electron";
import * as path from "path";
import { EVENT_CHANNELS, MODAL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { captureMessage } from "../../common/sentryHelper";
import { ModalWindowClosedPayload, ModalWindowMessagePayload, ModalWindowOptions } from "../../common/types";

const MIN_MODAL_WIDTH = 280;
const MIN_MODAL_HEIGHT = 180;
const WINDOW_PADDING = 40;

/**
 * ModalWindowManager
 *
 * Provides a BrowserWindow-backed modal surface that floats above BrowserViews
 * so modal content is always visible regardless of z-index stacking in the DOM.
 */
export class ModalWindowManager {
    private modalWindow: BrowserWindow | null = null;
    private readonly mainWindow: BrowserWindow;
    private currentOptions: ModalWindowOptions | null = null;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.setupMainWindowListeners();
    }

    showModal(options: ModalWindowOptions): void {
        if (!options || !options.html) {
            throw new Error("Modal HTML content is required");
        }

        this.currentOptions = {
            ...options,
            width: this.normalizeWidth(options.width),
            height: this.normalizeHeight(options.height),
        };

        const modalWindow = this.ensureModalWindow();
        modalWindow.setResizable(Boolean(this.currentOptions?.resizable));
        this.updateWindowBounds();

        const documentHtml = this.composeDocumentHtml(this.currentOptions.html);
        modalWindow
            .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`)
            .then(() => {
                if (!modalWindow.isDestroyed()) {
                    modalWindow.show();
                    modalWindow.focus();
                    this.mainWindow.webContents.send(EVENT_CHANNELS.MODAL_WINDOW_OPENED, { id: this.currentOptions?.id ?? null });
                }
            })
            .catch((error) => {
                captureMessage("Failed to load modal content", "error", { extra: { error } });
            });
    }

    hideModal(): void {
        if (!this.modalWindow || this.modalWindow.isDestroyed()) {
            this.currentOptions = null;
            return;
        }

        this.modalWindow.hide();
        this.emitModalClosed();
        this.currentOptions = null;
    }

    destroy(): void {
        if (this.modalWindow && !this.modalWindow.isDestroyed()) {
            this.modalWindow.close();
        }
        this.modalWindow = null;
        this.currentOptions = null;
    }

    private ensureModalWindow(): BrowserWindow {
        if (this.modalWindow && !this.modalWindow.isDestroyed()) {
            return this.modalWindow;
        }

        this.modalWindow = new BrowserWindow({
            width: this.currentOptions?.width ?? 400,
            height: this.currentOptions?.height ?? 300,
            parent: this.mainWindow,
            modal: true,
            frame: false,
            transparent: true,
            resizable: this.currentOptions?.resizable ?? false,
            skipTaskbar: true,
            show: false,
            hasShadow: false,
            backgroundColor: "#00000000",
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: path.join(__dirname, "modalPreload.js"),
            },
        });

        this.modalWindow.setMenuBarVisibility(false);
        this.modalWindow.on("closed", () => {
            this.emitModalClosed();
            this.modalWindow = null;
            this.currentOptions = null;
        });

        return this.modalWindow;
    }

    private setupMainWindowListeners(): void {
        this.mainWindow.on("move", () => this.updateWindowBounds());
        this.mainWindow.on("resize", () => this.updateWindowBounds());
        this.mainWindow.on("minimize", () => this.modalWindow?.hide());
        this.mainWindow.on("restore", () => {
            if (this.currentOptions && this.modalWindow && !this.modalWindow.isDestroyed()) {
                this.modalWindow.show();
            }
        });
        this.mainWindow.on("closed", () => this.destroy());
    }

    private updateWindowBounds(): void {
        if (!this.modalWindow || !this.currentOptions) return;

        const bounds = this.mainWindow.getBounds();
        const width = this.currentOptions.width;
        const height = this.currentOptions.height;
        const x = Math.round(bounds.x + (bounds.width - width) / 2);
        const y = Math.round(bounds.y + (bounds.height - height) / 2);

        this.modalWindow.setBounds({ x, y, width, height });
    }

    private composeDocumentHtml(content: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; img-src data: https://*.blob.core.windows.net/ https://github.com/PowerPlatformToolBox/pptb-web/releases/download/ https://release-assets.githubusercontent.com/; font-src data:; connect-src https:;" />
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: transparent;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        }
    </style>
</head>
<body>
${content}
<script>
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            window.modalBridge?.close();
        }
    });
</script>
</body>
</html>`;
    }

    private normalizeWidth(width?: number): number {
        const bounds = this.mainWindow.getBounds();
        const maxWidth = Math.max(bounds.width - WINDOW_PADDING, MIN_MODAL_WIDTH);
        const requestedWidth = typeof width === "number" && !Number.isNaN(width) ? width : MIN_MODAL_WIDTH;
        return Math.min(Math.max(requestedWidth, MIN_MODAL_WIDTH), maxWidth);
    }

    private normalizeHeight(height?: number): number {
        const bounds = this.mainWindow.getBounds();
        const maxHeight = Math.max(bounds.height - WINDOW_PADDING, MIN_MODAL_HEIGHT);
        const requestedHeight = typeof height === "number" && !Number.isNaN(height) ? height : MIN_MODAL_HEIGHT;
        return Math.min(Math.max(requestedHeight, MIN_MODAL_HEIGHT), maxHeight);
    }

    private emitModalClosed(): void {
        if (!this.currentOptions || this.mainWindow.isDestroyed()) {
            return;
        }

        const payload: ModalWindowClosedPayload = { id: this.currentOptions.id ?? null };
        this.mainWindow.webContents.send(EVENT_CHANNELS.MODAL_WINDOW_CLOSED, payload);
    }

    sendMessageToModal(payload: ModalWindowMessagePayload): void {
        if (!this.modalWindow || this.modalWindow.isDestroyed()) {
            return;
        }

        this.modalWindow.webContents.send(MODAL_WINDOW_CHANNELS.RENDERER_MESSAGE, payload);
    }
}
