/// <reference types="@pptb/types" />
/// <reference types="svelte" />
/// <reference types="vite/client" />

declare global {
    interface Window {
        toolboxAPI: typeof import('@pptb/types').toolboxAPI;
        dataverseAPI: typeof import('@pptb/types').dataverseAPI;
    }
}

export {};
