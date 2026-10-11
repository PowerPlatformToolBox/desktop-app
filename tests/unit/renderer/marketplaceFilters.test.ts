/// <reference types="jest" />
/// <reference path="../../../src/renderer/types/renderer.d.ts" />

jest.mock("../../../src/common/logger", () => ({
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarn: jest.fn(),
}));
jest.mock("../../../src/renderer/utils/markdown", () => ({}));
jest.mock("../../../src/renderer/modules/rateToolModal", () => ({}));
jest.mock("../../../src/renderer/modules/reportConcernModal", () => ({}));
jest.mock("../../../src/renderer/modules/toolManagement", () => ({}));
jest.mock("../../../src/renderer/modules/toolsSidebarManagement", () => ({}));

import { loadMarketplace } from "../../../src/renderer/modules/marketplaceManagement";

describe("marketplace author filter", () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    let authorFilter: { value: string; innerHTML: string };

    beforeEach(() => {
        authorFilter = { value: "", innerHTML: "" };
        const elements: Record<string, unknown> = {
            "marketplace-tools-list": { innerHTML: "" },
            "marketplace-category-filter": { value: "", innerHTML: "" },
            "marketplace-author-filter": authorFilter,
            // Avoid rendering tool cards while exercising filter population.
            "marketplace-search-input": { value: "no-matching-tools" },
        };
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: { getElementById: jest.fn((id: string) => elements[id] ?? null) },
        });
        Object.defineProperty(globalThis, "window", {
            configurable: true,
            value: {
                toolboxAPI: {
                    fetchRegistryTools: jest.fn().mockResolvedValue([
                        {
                            id: "test-tool",
                            name: "Test Tool",
                            authors: ["VerseBlocks", "nickmeron", "Oliver Flint", "MsCRMTools", "MscrmTools", "Lucas Hahne", "_neronotte", "nickmeron"],
                            categories: [],
                        },
                    ]),
                    getAllTools: jest.fn().mockResolvedValue([]),
                    getSetting: jest.fn().mockResolvedValue(undefined),
                    getUserSettings: jest.fn().mockResolvedValue({}),
                    getVersionCompatibilityInfo: jest.fn().mockResolvedValue(null),
                },
            },
        });
    });

    afterEach(() => {
        if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
        else Reflect.deleteProperty(globalThis, "window");
        if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
        else Reflect.deleteProperty(globalThis, "document");
    });

    it("sorts mixed-case developer names alphabetically without changing their casing", async () => {
        await loadMarketplace();

        const names = Array.from(authorFilter.innerHTML.matchAll(/<option value="([^"]*)">/g), (match) => match[1]);
        expect(names).toEqual(["", "_neronotte", "Lucas Hahne", "MsCRMTools", "MscrmTools", "nickmeron", "Oliver Flint", "VerseBlocks"]);
        expect(authorFilter.innerHTML).toContain('<option value="nickmeron">nickmeron</option>');
    });

    it("preserves the selected author and keeps differently cased author values distinct", async () => {
        authorFilter.value = "MscrmTools";

        await loadMarketplace();

        expect(authorFilter.value).toBe("MscrmTools");
        expect(authorFilter.innerHTML).toContain('<option value="MsCRMTools">MsCRMTools</option>');
        expect(authorFilter.innerHTML).toContain('<option value="MscrmTools">MscrmTools</option>');
        expect(authorFilter.innerHTML.match(/value="nickmeron"/g)).toHaveLength(1);
    });
});
