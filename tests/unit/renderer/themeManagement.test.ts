/// <reference types="jest" />

import { updateVerifiedBadgeIconsForTheme, type VerifiedBadgeThemeDocument } from "../../../src/renderer/modules/themeManagement";

describe("theme management", () => {
    it("updates verified badge icons to match the current theme", () => {
        const firstIcon = { src: "icons/light/verified.svg" };
        const secondIcon = { src: "icons/light/verified.svg" };
        const querySelectorAll: VerifiedBadgeThemeDocument["querySelectorAll"] = jest.fn((selectors: string) => [firstIcon, secondIcon]);
        const mockDocument: VerifiedBadgeThemeDocument = {
            body: {
                classList: {
                    contains: jest.fn((className: string) => className === "dark-theme"),
                },
            },
            querySelectorAll,
        };

        updateVerifiedBadgeIconsForTheme(mockDocument);

        expect(firstIcon.src).toBe("icons/dark/verified.svg");
        expect(secondIcon.src).toBe("icons/dark/verified.svg");
        expect(querySelectorAll).toHaveBeenCalledWith(".tool-verified-badge-icon");
    });
});
