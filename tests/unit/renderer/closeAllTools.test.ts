/// <reference types="jest" />
/// <reference path="../../../src/renderer/types/renderer.d.ts" />

jest.mock("../../../src/renderer/utils/browserIcons", () => ({
    chromeIconUrl: "chrome-mock-icon",
    edgeIconUrl: "edge-mock-icon",
}));
jest.mock("../../../src/renderer/modules/connectionManagement", () => ({}));
jest.mock("../../../src/renderer/modules/consent/cspExceptionModal", () => ({}));
jest.mock("../../../src/renderer/modules/homepageManagement", () => ({}));

import { closeAllTools } from "../../../src/renderer/modules/toolManagement";

describe("closeAllTools", () => {
    it("asks for confirmation before closing all open tabs and tools", async () => {
        const confirm = jest.fn(() => false);
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: { confirm },
        });

        await closeAllTools();

        expect(confirm).toHaveBeenCalledWith("Are you sure you want to close all open tabs and tools?");
    });
});
