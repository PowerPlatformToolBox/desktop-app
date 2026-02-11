import { BrowserWindow } from "electron";

/**
 * LoadingOverlayWindowManager
 *
 * Provides a frameless, transparent, always-on-top window that displays a centered
 * loading spinner and message. This window sits above the tool panel area (not the entire window),
 * allowing users to still interact with the sidebar, toolbar, and close buttons.
 * This solves two issues:
 * 1. An in-DOM loading screen would be obscured by the tool BrowserView
 * 2. A full-window overlay would block all app interaction, preventing users from closing tools or the app
 */
export class LoadingOverlayWindowManager {
    private overlayWindow: BrowserWindow | null = null;
    private mainWindow: BrowserWindow;
    private visible = false;
    private currentMessage = "Loading...";
    private currentBounds: { x: number; y: number; width: number; height: number } | null = null;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.createOverlayWindow();
        this.setupMainWindowListeners();
    }

    /**
     * Create the overlay BrowserWindow.
     */
    private createOverlayWindow(): void {
        this.overlayWindow = new BrowserWindow({
            width: 400, // will be immediately resized to main window bounds
            height: 300,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            skipTaskbar: true,
            resizable: false,
            movable: false,
            minimizable: false,
            maximizable: false,
            closable: false,
            focusable: false,
            show: false,
            hasShadow: false,
            backgroundColor: "#00000000",
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
            },
        });
        this.overlayWindow.setParentWindow(this.mainWindow);
        this.reloadContent();
        this.updateWindowBounds();
    }

    /** Resize & reposition to cover the tool panel area (or entire window as fallback) */
    private updateWindowBounds(): void {
        if (!this.overlayWindow) return;
        
        if (this.currentBounds) {
            // Use tool panel bounds (relative to window) to position overlay
            const windowBounds = this.mainWindow.getBounds();
            this.overlayWindow.setBounds({
                x: windowBounds.x + this.currentBounds.x,
                y: windowBounds.y + this.currentBounds.y,
                width: this.currentBounds.width,
                height: this.currentBounds.height,
            });
        } else {
            // Fallback: cover entire window (legacy behavior)
            const bounds = this.mainWindow.getBounds();
            this.overlayWindow.setBounds({
                x: bounds.x,
                y: bounds.y,
                width: bounds.width,
                height: bounds.height,
            });
        }
    }

    /** Rebuild the HTML with current message */
    private reloadContent(): void {
        if (!this.overlayWindow) return;
        const html = this.generateHTML(this.currentMessage);
        this.overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    }

    /** Generate overlay HTML */
    private generateHTML(message: string): string {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<style>
* { box-sizing: border-box; }
html,body { width:100%; height:100%; margin:0; padding:0; background:rgba(0,0,0,0.4); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; }
body { display:flex; align-items:center; justify-content:center; }
.overlay-container { display:flex; flex-direction:column; align-items:center; gap:16px; padding:32px 48px; background:rgba(30,30,30,0.85); border:1px solid #3d3d3d; border-radius:8px; backdrop-filter: blur(6px); box-shadow:0 8px 24px rgba(0,0,0,0.6); }
.spinner { width:48px; height:48px; border:5px solid #2d2d2d; border-top-color:#0078d4; border-radius:50%; animation:spin 1s linear infinite; }
.message { color:#ffffff; font-size:15px; font-weight:500; text-align:center; max-width:320px; }
@keyframes spin { to { transform:rotate(360deg); } }
.fade-in { animation:fadeIn 150ms ease-out; }
@keyframes fadeIn { from { opacity:0; transform:scale(.96); } to { opacity:1; transform:scale(1); } }
</style></head><body>
<div class="overlay-container fade-in"><div class="spinner"></div><div class="message">${message}</div></div>
</body></html>`;
    }

    /**
     * Show overlay with optional message.
     * If bounds are provided, the overlay will only cover that area (typically the tool panel).
     * If no bounds provided, it will cover the entire window (fallback for legacy compatibility).
     */
    show(message?: string, bounds?: { x: number; y: number; width: number; height: number }): void {
        this.currentMessage = message || this.currentMessage || "Loading...";
        this.currentBounds = bounds || null;
        this.reloadContent();
        this.updateWindowBounds();
        if (this.overlayWindow && !this.visible) {
            this.overlayWindow.showInactive();
            this.visible = true;
        }
    }

    /** Update only the message while visible */
    updateMessage(message: string): void {
        this.currentMessage = message;
        if (this.visible) {
            this.reloadContent();
        }
    }

    /** Hide overlay */
    hide(): void {
        if (this.overlayWindow && this.visible) {
            this.overlayWindow.hide();
            this.visible = false;
        }
    }

    /** Listen for main window movement/resizing */
    private setupMainWindowListeners(): void {
        this.mainWindow.on("move", () => this.updateWindowBounds());
        this.mainWindow.on("resize", () => this.updateWindowBounds());
        this.mainWindow.on("minimize", () => this.hide());
        this.mainWindow.on("restore", () => {
            if (this.visible) this.show();
        });
        this.mainWindow.on("closed", () => this.destroy());
    }

    /** Cleanup */
    destroy(): void {
        this.overlayWindow = null;
        this.visible = false;
    }
}
