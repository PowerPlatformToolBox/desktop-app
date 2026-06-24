/// <reference types="jest" />

import { getToolDetailSourceIconHtml, getToolSourceIconHtml } from "../../../src/renderer/utils/toolSourceIcon";

describe("toolSourceIcon utilities", () => {
    // -----------------------------------------------------------------------
    // getToolSourceIconHtml
    // -----------------------------------------------------------------------
    describe("getToolSourceIconHtml", () => {
        it("returns empty string for a registry tool (no prefix)", () => {
            expect(getToolSourceIconHtml("some-registry-tool-id")).toBe("");
        });

        it("returns HTML for a local- prefixed tool", () => {
            const html = getToolSourceIconHtml("local-my-tool");
            expect(html).toContain("tool-source-icon");
            expect(html).toContain("Locally Developed Tool");
            expect(html).toContain("<svg");
        });

        it("returns HTML for an npm- prefixed tool", () => {
            const html = getToolSourceIconHtml("npm-@pptb/some-tool");
            expect(html).toContain("tool-source-icon");
            expect(html).toContain("NPM Package Tool");
            expect(html).toContain("<svg");
        });
    });

    // -----------------------------------------------------------------------
    // getToolDetailSourceIconHtml
    // -----------------------------------------------------------------------
    describe("getToolDetailSourceIconHtml", () => {
        it("returns empty string for a registry tool", () => {
            expect(getToolDetailSourceIconHtml("registry-tool")).toBe("");
        });

        it("uses tool-detail-source-icon CSS class for local tools", () => {
            const html = getToolDetailSourceIconHtml("local-tool");
            expect(html).toContain("tool-detail-source-icon");
        });

        it("uses tool-detail-source-icon CSS class for npm tools", () => {
            const html = getToolDetailSourceIconHtml("npm-tool");
            expect(html).toContain("tool-detail-source-icon");
        });
    });
});
