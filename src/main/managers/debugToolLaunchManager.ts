import { logInfo, logWarn } from "../../common/logger";
import type { DebugToolLaunchRequest } from "../../common/types";
import { describePath, LaunchArgs } from "../launchArgs";

type DebugToolLaunchHandler = (request: DebugToolLaunchRequest) => void | Promise<void>;

/**
 * DebugToolLaunchManager
 *
 * Buffers `--debug-tool` requests captured before the renderer handler exists
 * (cold launch) and forwards later requests arriving via `second-instance`.
 *
 * Buffer depth is 1: a newer request supersedes a queued one, since mounting the
 * same or a different local tool twice in a row has no useful intermediate state.
 * This class never throws — a malformed launch must not take the app down.
 */
export class DebugToolLaunchManager {
    private static readonly RATE_LIMIT_WINDOW_MS = 5000;
    private static readonly MAX_REQUESTS_PER_WINDOW = 3;

    private handler: DebugToolLaunchHandler | null = null;
    private pendingRequest: DebugToolLaunchRequest | null = null;
    private recentRequests: number[] = [];

    /**
     * Capture a cold-launch request. Must be called before `app.whenReady()` so
     * argv is never missed.
     */
    initialize(args: LaunchArgs): void {
        const request = this.toRequest(args);
        if (!request) {
            return;
        }

        logInfo(`[DebugToolLaunch] Buffering debug tool request from startup args: ${describePath(request.localPath)}`);
        this.pendingRequest = request;
    }

    /**
     * Handle a request forwarded by a second instance. Rate limited so a loop of
     * invocations cannot repeatedly tear down and rebuild a BrowserView.
     */
    handleRequest(args: LaunchArgs): void {
        const request = this.toRequest(args);
        if (!request) {
            return;
        }

        if (!this.checkRateLimit()) {
            logWarn("[DebugToolLaunch] Request blocked due to rate limiting");
            return;
        }

        if (!this.handler) {
            this.pendingRequest = request;
            return;
        }

        this.dispatch(request);
    }

    /**
     * Register the renderer-facing handler and flush a buffered request.
     * Must be called after the main window exists.
     */
    setupHandler(handler: DebugToolLaunchHandler): void {
        this.handler = handler;

        const buffered = this.pendingRequest;
        this.pendingRequest = null;
        if (buffered) {
            this.dispatch(buffered);
        }
    }

    private dispatch(request: DebugToolLaunchRequest): void {
        if (!this.handler) {
            return;
        }

        try {
            const outcome = this.handler(request);
            if (outcome instanceof Promise) {
                outcome.catch((error) => {
                    logWarn(`[DebugToolLaunch] Handler rejected for ${describePath(request.localPath)}`, { error: error instanceof Error ? error.name : "unknown" });
                });
            }
        } catch (error) {
            logWarn(`[DebugToolLaunch] Handler threw for ${describePath(request.localPath)}`, { error: error instanceof Error ? error.name : "unknown" });
        }
    }

    private toRequest(args: LaunchArgs): DebugToolLaunchRequest | null {
        if (!args || typeof args.debugToolPath !== "string" || args.debugToolPath.length === 0) {
            return null;
        }

        return {
            localPath: args.debugToolPath,
            connection: args.debugToolConnection,
            openDevTools: args.openDevTools === true,
        };
    }

    private checkRateLimit(): boolean {
        const now = Date.now();
        this.recentRequests = this.recentRequests.filter((timestamp) => now - timestamp < DebugToolLaunchManager.RATE_LIMIT_WINDOW_MS);

        if (this.recentRequests.length >= DebugToolLaunchManager.MAX_REQUESTS_PER_WINDOW) {
            return false;
        }

        this.recentRequests.push(now);
        return true;
    }
}
