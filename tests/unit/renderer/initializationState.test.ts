/// <reference types="jest" />

import { isRendererInitialized, markRendererInitialized, RendererInitializationTarget } from "../../../src/renderer/utils/initializationState";

describe("renderer initialization state", () => {
    it("marks the renderer as initialized on the provided body element", () => {
        const body: RendererInitializationTarget = { dataset: {} };

        expect(isRendererInitialized(body)).toBe(false);

        markRendererInitialized(body);

        expect(body.dataset.pptbInitialized).toBe("true");
        expect(isRendererInitialized(body)).toBe(true);
    });
});
