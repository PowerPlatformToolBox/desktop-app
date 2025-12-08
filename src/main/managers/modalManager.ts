import { BrowserWindow, app } from "electron";
import { existsSync } from "fs";
import * as path from "path";

/**
 * ModalManager
 *
 * Renders critical modals (starting with the add connection form) inside a transparent,
 * always-on-top BrowserWindow so they remain visible even when BrowserViews are attached
 * to the main window.
 */
export class ModalManager {
    private readonly mainWindow: BrowserWindow;
    private modalWindow: BrowserWindow | null = null;
    private visible = false;

    private readonly assetPaths = this.resolveAssetPaths();

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.setupMainWindowListeners();
    }

    private resolveAssetPaths(): { addConnectionModalHtml: string; addConnectionModalPreload: string } {
        const projectRoot = app.isPackaged ? app.getAppPath() : process.cwd();
        const builtHtml = path.join(__dirname, "windows", "modals", "addConnectionModal.html");
        const distHtml = path.join(projectRoot, "dist", "main", "windows", "modals", "addConnectionModal.html");

        const htmlCandidates = app.isPackaged ? [builtHtml, distHtml] : [distHtml, builtHtml];

        const preloadCandidates = [
            path.join(__dirname, "addConnectionModalPreload.js"),
            path.join(app.getAppPath(), "dist", "main", "addConnectionModalPreload.js"),
        ];

        const pickPath = (candidates: string[], label: string): string => {
            const match = candidates.find((candidate) => existsSync(candidate));
            if (match) {
                return match;
            }
            const fallBack = candidates[0];
            console.warn(`[ModalManager] Could not find ${label} at expected locations`, candidates);
            return fallBack;
        };

        const resolvedPaths = {
            addConnectionModalHtml: pickPath(htmlCandidates, "add-connection modal HTML"),
            addConnectionModalPreload: pickPath(preloadCandidates, "add-connection modal preload"),
        } as const;

        console.log("[ModalManager] Using modal assets", resolvedPaths);
        return resolvedPaths;
    }

    /** Show the add-connection modal */
    public showAddConnectionModal(): void {
        this.ensureWindow();
        this.updateWindowBounds();
        if (!this.modalWindow) {
            return;
        }

        void this.modalWindow
            .loadFile(this.assetPaths.addConnectionModalHtml)
            .then(() => {
                if (!this.modalWindow) return;
                this.modalWindow.show();
                this.modalWindow.focus();
                this.visible = true;
            })
            .catch((error) => {
                console.error("Failed to load modal content", error);
            });
    }

    /** Hide whichever modal is currently active */
    public hideModal(): void {
        if (this.modalWindow) {
            this.modalWindow.hide();
        }
        this.visible = false;
    }

    /** Called when the application is shutting down */
    public destroy(): void {
        if (this.modalWindow) {
            this.modalWindow.destroy();
            this.modalWindow = null;
        }
        this.visible = false;
    }

    private setupMainWindowListeners(): void {
        this.mainWindow.on("move", () => this.updateWindowBounds());
        this.mainWindow.on("resize", () => this.updateWindowBounds());
        this.mainWindow.on("minimize", () => this.hideModal());
        this.mainWindow.on("closed", () => this.destroy());
    }

    private ensureWindow(): void {
        if (this.modalWindow) {
            return;
        }

        this.modalWindow = new BrowserWindow({
            width: 400,
            height: 400,
            frame: false,
            transparent: true,
            show: false,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: true,
            focusable: true,
            backgroundColor: "#00000000",
            hasShadow: false,
            parent: this.mainWindow,
            modal: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: false,
                preload: this.assetPaths.addConnectionModalPreload,
            },
        });

        this.modalWindow.setParentWindow(this.mainWindow);
        this.modalWindow.on("close", (event) => {
            if (this.mainWindow.isDestroyed()) {
                return;
            }
            event.preventDefault();
            this.hideModal();
        });
    }

    private updateWindowBounds(): void {
        if (!this.modalWindow || this.modalWindow.isDestroyed()) return;
        const bounds = this.mainWindow.getBounds();
        this.modalWindow.setBounds({
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
        });
    }
}
