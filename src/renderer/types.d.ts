/**
 * Type definitions for the renderer process
 * Re-exports shared types and extends with renderer-specific definitions
 */

import { ToolBoxAPI, ToolContext } from "../common/types";

// Re-export for convenience
export type { ToolBoxAPI, ToolContext };

// Extend ToolContext for renderer (includes accessToken for internal use)
export interface RendererToolContext extends ToolContext {
    accessToken: string | null;
}

// Global window declarations
declare global {
    interface Window {
        toolboxAPI: ToolBoxAPI;
        TOOLBOX_CONTEXT?: ToolContext;
        api: {
            on: (channel: string, callback: (...args: unknown[]) => void) => void;
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
            send: (channel: string, ...args: unknown[]) => void;
        };
    }
}
