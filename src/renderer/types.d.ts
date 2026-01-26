/**
 * Type definitions for the renderer process
 * Re-exports shared types and extends with renderer-specific definitions
 */

import type { ToolboxAPI, ToolContext } from "../common/types";

// Re-export for convenience
export type { ToolboxAPI, ToolContext };

// Extend ToolContext for renderer (includes accessToken for internal use)
export interface RendererToolContext extends ToolContext {
    accessToken: string | null;
}

// Global window declarations
declare global {
    interface Window {
        /** Main Toolbox API surface injected by preload */
        toolboxAPI: ToolboxAPI;
        /** Optional tool context reference (legacy usage) */
        TOOLBOX_CONTEXT?: ToolContext;
        /** Backward compatibility shim for old window.api usage */
        api: {
            on: (channel: string, callback: (...args: unknown[]) => void) => void;
            invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
            send: (channel: string, ...args: unknown[]) => void;
        };
        /** Modal bridge API for modal windows */
        modalBridge?: {
            close: () => Promise<void>;
            send: (channel: string, data?: unknown) => void;
            onMessage: (handler: (payload: unknown) => void) => void;
            offMessage: (handler: (payload: unknown) => void) => void;
        };
    }
}

declare module "*.svg?raw" {
    const content: string;
    export default content;
}

// Make this file a module so the global augmentation is applied
export {};
