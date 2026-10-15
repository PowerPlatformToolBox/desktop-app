export interface RendererInitializationTarget {
    dataset: {
        pptbInitialized?: string;
    };
}

function getDefaultInitializationTarget(): RendererInitializationTarget {
    const runtime = globalThis as typeof globalThis & { document?: { body?: RendererInitializationTarget } };
    const body = runtime.document?.body;
    if (!body) {
        throw new Error("Renderer body is not available.");
    }

    return body;
}

export function markRendererInitialized(body: RendererInitializationTarget = getDefaultInitializationTarget()): void {
    body.dataset.pptbInitialized = "true";
}

export function isRendererInitialized(body: RendererInitializationTarget = getDefaultInitializationTarget()): boolean {
    return body.dataset.pptbInitialized === "true";
}
