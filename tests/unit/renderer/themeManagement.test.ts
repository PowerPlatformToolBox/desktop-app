/// <reference types="jest" />

import { updateVerifiedBadgeImageSources } from "../../../src/renderer/modules/themeManagement";

describe("theme management", () => {
    it("updates verified badge icons to match the current theme", () => {
        const firstIcon = { src: "icons/light/verified.svg" };
        const secondIcon = { src: "icons/light/verified.svg" };

        updateVerifiedBadgeImageSources(true, [firstIcon, secondIcon]);

        expect(firstIcon.src).toBe("icons/dark/verified.svg");
        expect(secondIcon.src).toBe("icons/dark/verified.svg");
    });
});
