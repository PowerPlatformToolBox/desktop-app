import { BrowserWindow } from "electron";
import * as path from "path";
import { EVENT_CHANNELS, MODAL_WINDOW_CHANNELS } from "../../common/ipc/channels";
import { scrubPii } from "../../common/sentry";
import { addBreadcrumb, captureException, captureMessage, hasSentryTelemetryConsent, logWarn } from "../../common/sentryHelper";
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
    private modalLoadSequence = 0;
    private reportedModalLoadSequence = -1;
    private closingModalWindow: BrowserWindow | null = null;

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
        const loadSequence = ++this.modalLoadSequence;
        modalWindow
            .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(documentHtml)}`)
            .then(() => {
                if (!modalWindow.isDestroyed()) {
                    modalWindow.show();
                    if (this.currentOptions?.alwaysOnTop) {
                        modalWindow.setAlwaysOnTop(true, "modal-panel");
                    }
                    modalWindow.moveTop();
                    modalWindow.focus();
                    if (!this.mainWindow.isDestroyed() && !this.mainWindow.webContents.isDestroyed()) {
                        this.mainWindow.webContents.send(EVENT_CHANNELS.MODAL_WINDOW_OPENED, { id: this.currentOptions?.id ?? null });
                    }
                }
            })
            .catch((error) => {
                const errorCode = typeof error?.errno === "number" ? error.errno : undefined;
                if (errorCode === -3 || error?.code === "ERR_ABORTED" || (typeof error?.message === "string" && error.message.startsWith("ERR_ABORTED"))) {
                    return;
                }
                this.reportLoadFailure(modalWindow, loadSequence, errorCode);
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
            this.closingModalWindow = this.modalWindow;
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
        const modalWindow = this.modalWindow;
        modalWindow.on("close", () => {
            this.closingModalWindow = modalWindow;
        });
        modalWindow.webContents.on("console-message", (details, level, message) => {
            if (!this.canReportTelemetry(modalWindow)) return;
            const severity = details.level ?? (level === 3 ? "error" : level === 2 ? "warning" : "info");
            if (severity !== "error" && severity !== "warning") return;

            const safeMessage = this.sanitizeModalMessage(details.message ?? message);
            const text = `Modal renderer ${severity}: ${safeMessage}`;
            if (severity === "error") {
                captureMessage(text, "error", { tags: { component: "modal-window", event_type: "console-error" } });
            } else {
                logWarn(text, { component: "modal-window", event_type: "console-warning" });
            }
            addBreadcrumb(text, "modal.console", severity);
        });
        modalWindow.webContents.on("render-process-gone", (_event, details) => {
            if (!this.canReportTelemetry(modalWindow) || details.reason === "clean-exit") return;
            captureException(new Error("Modal renderer process terminated unexpectedly"), {
                tags: { component: "modal-window", event_type: "render-process-gone" },
                extra: { reason: details.reason, exit_code: details.exitCode },
            });
        });
        modalWindow.webContents.on("did-fail-load", (_event, errorCode, _description, _url, isMainFrame) => {
            if (isMainFrame) this.reportLoadFailure(modalWindow, this.modalLoadSequence, errorCode);
        });
        this.modalWindow.on("closed", () => {
            this.emitModalClosed();
            this.modalWindow = null;
            this.currentOptions = null;
            if (this.closingModalWindow === modalWindow) this.closingModalWindow = null;
        });

        return this.modalWindow;
    }

    private canReportTelemetry(modalWindow: BrowserWindow): boolean {
        return (
            hasSentryTelemetryConsent() &&
            this.modalWindow === modalWindow &&
            this.closingModalWindow !== modalWindow &&
            this.currentOptions !== null &&
            !modalWindow.isDestroyed() &&
            !this.mainWindow.isDestroyed()
        );
    }

    private reportLoadFailure(modalWindow: BrowserWindow, loadSequence: number, errorCode?: number): void {
        if (!this.canReportTelemetry(modalWindow) || errorCode === -3 || loadSequence !== this.modalLoadSequence || this.reportedModalLoadSequence === loadSequence) {
            return;
        }
        this.reportedModalLoadSequence = loadSequence;
        captureException(new Error("Failed to load modal content"), {
            tags: { component: "modal-window", event_type: "did-fail-load" },
            extra: { error_code: errorCode },
        });
    }

    private sanitizeModalMessage(message: string): string {
        if (/<[!/?a-z][^>]*>|%3c(?:!|%2f|[a-z])|data:text\/html/i.test(message)) return "[modal document redacted]";
        return scrubPii(
            message
                .replace(/data:[^\s]+/gi, "[data URL redacted]")
                .replace(/\b(?:Bearer|Basic)\s+[^\s"']+/gi, "[authorization redacted]")
                .replace(/((?:password|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|authorization)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, "$1[redacted]"),
        ).slice(0, 1000);
    }

    private setupMainWindowListeners(): void {
        this.mainWindow.on("move", () => this.updateWindowBounds());
        this.mainWindow.on("resize", () => this.updateWindowBounds());
        this.mainWindow.on("minimize", () => this.modalWindow?.hide());
        this.mainWindow.on("restore", () => {
            if (this.currentOptions && this.modalWindow && !this.modalWindow.isDestroyed()) {
                this.modalWindow.show();
                if (this.currentOptions.alwaysOnTop) {
                    this.modalWindow.setAlwaysOnTop(true, "modal-panel");
                    this.modalWindow.moveTop();
                }
                this.modalWindow.focus();
            }
        });
        this.mainWindow.on("closed", () => this.destroy());

        // Some Linux window managers ignore the parent/modal relationship, so clicking the
        // main window raises it above the modal. Bring the modal back to the front instead.
        if (process.platform === "linux") {
            this.mainWindow.on("focus", () => this.bringModalToFront());
        }
    }

    private bringModalToFront(): void {
        if (!this.currentOptions || !this.modalWindow || this.modalWindow.isDestroyed() || !this.modalWindow.isVisible()) {
            return;
        }

        this.modalWindow.moveTop();
        this.modalWindow.focus();
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
        if (!this.currentOptions || this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) {
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
