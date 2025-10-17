/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ToolboxContext {
    toolId?: string | null;
    connectionUrl?: string | null;
    accessToken?: string | null;
}

interface ToolboxAPI {
    getToolContext: () => Promise<ToolboxContext>;
    showNotification: (options: { title: string; body: string; type: string }) => Promise<void>;
    onToolboxEvent: (callback: (event: string, payload: unknown) => void) => void | (() => void);
    getConnections: () => Promise<Array<{ id: string; name: string; url: string }>>;
    getActiveConnection: () => Promise<{ id: string; name: string; url: string } | null>;
}

declare global {
    interface Window {
        toolboxAPI?: ToolboxAPI;
        TOOLBOX_CONTEXT?: ToolboxContext;
    }
}

export {};
