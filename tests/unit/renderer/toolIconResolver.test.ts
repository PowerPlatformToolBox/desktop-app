/// <reference types="jest" />

import { generateToolIconHtml, isMonochromeSvg, planToolIcon, resolveToolIconUrl, svgToDataUrl } from "../../../src/renderer/utils/toolIconResolver";

const COLOUR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#0E5A9C" d="M0 0h64v64H0z"/><path stroke="#fff" d="M8 8l48 48"/></svg>';
const MONO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" d="M0 0h24v24H0z"/></svg>';

describe("resolveToolIconUrl", () => {
    it("maps bundled SVG paths to the tool's pptb-webview origin", () => {
        expect(resolveToolIconUrl("my-tool", "icons/icon.svg")).toBe("pptb-webview://my-tool/icons/icon.svg");
        expect(resolveToolIconUrl("my-tool", "dist/icons/icon.svg")).toBe("pptb-webview://my-tool/icons/icon.svg");
        expect(resolveToolIconUrl("my-tool", "https://example.blob.core.windows.net/x.svg")).toBe("https://example.blob.core.windows.net/x.svg");
        expect(resolveToolIconUrl("my-tool", "icons/icon.png")).toBeUndefined();
    });
});

describe("planToolIcon", () => {
    it("draws colour SVGs as an image so their colours are kept", () => {
        expect(isMonochromeSvg(COLOUR_SVG)).toBe(false);
        expect(planToolIcon(COLOUR_SVG)).toEqual({ kind: "image", url: svgToDataUrl(COLOUR_SVG) });
    });

    it("draws currentColor SVGs as a theme mask", () => {
        expect(isMonochromeSvg(MONO_SVG)).toBe(true);
        expect(isMonochromeSvg(MONO_SVG.replace("currentColor", "CURRENTCOLOR"))).toBe(true);
        expect(planToolIcon(MONO_SVG)).toEqual({ kind: "mask", url: svgToDataUrl(MONO_SVG) });
    });

    it("encodes the markup as a data: URL that round-trips", () => {
        const url = svgToDataUrl(COLOUR_SVG);
        expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
        expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe(COLOUR_SVG);
    });
});

describe("generateToolIconHtml", () => {
    it("tags SVG placeholders with the tool id and manifest icon path", () => {
        const html = generateToolIconHtml("my-tool", "icons/icon.svg", "My <Tool>", "default.svg");
        expect(html).toContain('data-pptb-icon-url="pptb-webview://my-tool/icons/icon.svg"');
        expect(html).toContain('data-pptb-tool-id="my-tool"');
        expect(html).toContain('data-pptb-icon-path="icons/icon.svg"');
        expect(html).toContain('aria-label="My &lt;Tool&gt; icon"');
        expect(html).toContain('data-pptb-icon-fallback="default.svg"');
    });
});
