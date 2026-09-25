/// <reference types="jest" />

import { updateVerifiedBadgeIconsForTheme } from "../../../src/renderer/modules/themeManagement";

describe("theme management", () => {
    const globalWithDocument = global as typeof globalThis & { document?: any };
    const originalDocument = globalWithDocument.document;

    afterEach(() => {
        globalWithDocument.document = originalDocument;
    });

    it("updates verified badge icons to match the current theme", () => {
        const firstIcon = { src: "icons/light/verified.svg" };
        const secondIcon = { src: "icons/light/verified.svg" };

        globalWithDocument.document = {
            body: {
                classList: {
                    contains: jest.fn((className: string) => className === "dark-theme"),
                },
            },
            querySelectorAll: jest.fn(() => [firstIcon, secondIcon]),
        } as never;

        updateVerifiedBadgeIconsForTheme();

        expect(firstIcon.src).toBe("icons/dark/verified.svg");
        expect(secondIcon.src).toBe("icons/dark/verified.svg");
        expect(globalWithDocument.document.querySelectorAll).toHaveBeenCalledWith(".tool-verified-badge img");
    });
});
