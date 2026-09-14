import { BrowserWindow } from "electron";
import { APP_CHANNELS } from "../../common/ipc/channels";
import { logError, logInfo } from "../../common/logger";

/**
 * RendererReadyGate
 *
 * The renderer registers its IPC listeners at the *end* of `initializeApplication()`.
 * Anything pushed on `did-finish-load` therefore lands on a channel with no listener
 * and is silently dropped. This gate buffers work until the renderer explicitly
 * signals `app:renderer-ready`, and resets on `did-start-loading` so a manual reload
 * (Ctrl+R) does not strand a later request.
 */
export class RendererReadyGate {
    private ready = false;
    private pendingTasks: Array<() => void | Promise<void>> = [];
    private pendingLatestTasks = new Map<string, () => void | Promise<void>>();
    private listenerAttached = false;
    private webContentsId: number | null = null;

    /**
     * Register the renderer→main readiness listener. Safe to call once, before
     * the main window exists.
     */
    initialize(ipc: { on: (channel: string, listener: (event: { sender: { id: number } }) => void) => void }): void {
        if (this.listenerAttached) {
            return;
        }

        ipc.on(APP_CHANNELS.RENDERER_READY, (event) => {
            if (event.sender.id === this.webContentsId) {
                this.markReady();
            }
        });
        this.listenerAttached = true;
    }

    /**
     * Track a window's load lifecycle so a reload invalidates readiness.
     */
    attachWindow(window: BrowserWindow): void {
        this.webContentsId = window.webContents.id;
        window.webContents.on("did-start-loading", () => {
            this.ready = false;
        });
    }

    isReady(): boolean {
        return this.ready;
    }

    /**
     * Run a task now when the renderer is ready, otherwise buffer it until it is.
     */
    runWhenReady(task: () => void | Promise<void>): void {
        if (this.ready) {
            this.runTask(task);
            return;
        }

        this.pendingTasks.push(task);
    }

    runLatestWhenReady(key: string, task: () => void | Promise<void>): void {
        if (this.ready) {
            this.runTask(task);
            return;
        }

        this.pendingLatestTasks.set(key, task);
    }

    private markReady(): void {
        this.ready = true;
        const buffered = this.pendingTasks.splice(0);
        const latestBuffered = Array.from(this.pendingLatestTasks.values());
        this.pendingLatestTasks.clear();
        if (buffered.length + latestBuffered.length > 0) {
            logInfo(`[RendererReadyGate] Flushing ${buffered.length + latestBuffered.length} buffered task(s)`);
        }

        for (const task of [...buffered, ...latestBuffered]) {
            this.runTask(task);
        }
    }

    private runTask(task: () => void | Promise<void>): void {
        try {
            const outcome = task();
            if (outcome instanceof Promise) {
                outcome.catch((error) => {
                    logError(error instanceof Error ? error : new Error(String(error)));
                });
            }
        } catch (error) {
            logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
