/// <reference types="jest" />

import {
    applyToolIconMasks,
    clearToolIconCache,
    generateToolIconHtml,
    getFallbackIconUrl,
    isMonochromeSvg,
    planToolIcon,
    resolveToolIconUrl,
    svgToDataUrl,
} from "../../../src/renderer/utils/toolIconResolver";

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

describe("isMonochromeSvg", () => {
    const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${body}</svg>`;

    it("treats currentColor and single-colour icons as monochrome, as they were always drawn", () => {
        expect(isMonochromeSvg(MONO_SVG)).toBe(true);
        expect(isMonochromeSvg(MONO_SVG.replace("currentColor", "CURRENTCOLOR"))).toBe(true);
        // Unpainted shapes default to black.
        expect(isMonochromeSvg(svg('<path d="M0 0h24v24H0z"/>'))).toBe(true);
        expect(isMonochromeSvg(svg('<path fill="#000" d="M0 0h24v24H0z"/><path fill="black" fill-opacity="0.5" d="M1 1h2v2H1z"/>'))).toBe(true);
        expect(isMonochromeSvg(svg('<path style="fill: #FFF; stroke: none" d="M0 0h24v24H0z"/><path fill="#ffffff" d="M1 1h2v2H1z"/>'))).toBe(true);
    });

    it("treats icons with two or more colours, gradients or images as colour icons", () => {
        expect(isMonochromeSvg(COLOUR_SVG)).toBe(false);
        expect(isMonochromeSvg(svg('<path fill="#0E5A9C" d="M0 0h24v24H0z"/><path fill="#2B8FD9" d="M1 1h2v2H1z"/>'))).toBe(false);
        expect(isMonochromeSvg(svg('<defs><linearGradient id="g"/></defs><path fill="url(#g)" d="M0 0h24v24H0z"/>'))).toBe(false);
        expect(isMonochromeSvg(svg('<image href="data:image/png;base64,AAAA" width="24" height="24"/>'))).toBe(false);
    });

    it("ignores colours and keywords mentioned in comments", () => {
        expect(isMonochromeSvg(svg('<!-- fill="#FFB900" accent --><path fill="#000" d="M0 0h24v24H0z"/>'))).toBe(true);
        expect(isMonochromeSvg(svg('<!-- was currentColor --><path fill="#0E5A9C" d="M0 0h24v24H0z"/><path fill="#fff" d="M1 1h2v2H1z"/>'))).toBe(false);
        expect(isMonochromeSvg(svg('<!-- <image> removed --><path fill="#000" d="M0 0h24v24H0z"/>'))).toBe(true);
        // An unclosed comment runs to the end of the markup.
        expect(isMonochromeSvg(svg('<path fill="#000" d="M0 0h24v24H0z"/><!-- fill="#f00"'))).toBe(true);
    });
});

describe("planToolIcon", () => {
    it("draws colour SVGs as an image and monochrome SVGs as a theme mask", () => {
        expect(planToolIcon(COLOUR_SVG)).toEqual({ kind: "image", url: svgToDataUrl(COLOUR_SVG) });
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

        // The fallback URL stays out of the markup; the placeholder only carries an index.
        expect(html).not.toContain("default.svg");
        const index = /data-pptb-icon-fallback="(\d+)"/.exec(html)?.[1] ?? null;
        expect(getFallbackIconUrl(index)).toBe("default.svg");
        expect(generateToolIconHtml("other-tool", "icon.svg", "Other", "default.svg")).toContain(`data-pptb-icon-fallback="${index}"`);
    });

    it("ignores fallback indexes that weren't registered", () => {
        expect(getFallbackIconUrl(null)).toBeUndefined();
        expect(getFallbackIconUrl("999")).toBeUndefined();
        expect(getFallbackIconUrl("javascript:alert(1)")).toBeUndefined();
    });

    it("omits the fallback when the default icon is unsafe", () => {
        expect(generateToolIconHtml("my-tool", "icons/icon.svg", "My Tool", "javascript:alert(1)")).not.toContain("data-pptb-icon-fallback");
    });
});

/** Just enough DOM for applyToolIconMasks: placeholders, attributes, style and replaceWith. */
class FakeIcon {
    readonly attributes = new Map<string, string>();
    readonly styles = new Map<string, string>();
    replacedWith: { className: string; src: string; alt: string } | null = null;
    readonly style = { setProperty: (name: string, value: string) => void this.styles.set(name, value) };

    constructor(toolId: string, iconPath: string) {
        this.attributes.set("data-pptb-icon-url", `pptb-webview://${toolId}/${iconPath}`);
        this.attributes.set("data-pptb-tool-id", toolId);
        this.attributes.set("data-pptb-icon-path", iconPath);
        this.attributes.set("aria-label", `${toolId} icon`);
    }

    getAttribute(name: string): string | null {
        return this.attributes.get(name) ?? null;
    }

    setAttribute(name: string, value: string): void {
        this.attributes.set(name, value);
    }

    replaceWith(node: { className: string; src: string; alt: string }): void {
        this.replacedWith = node;
    }
}

/** A root whose querySelectorAll honours the `:not([data-pptb-icon-state])` part of the selector. */
function rootOf(...icons: FakeIcon[]): ParentNode {
    return { querySelectorAll: () => icons.filter((icon) => !icon.attributes.has("data-pptb-icon-state")) } as unknown as ParentNode;
}

describe("applyToolIconMasks", () => {
    beforeEach(() => {
        clearToolIconCache();
        (globalThis as unknown as { document: unknown }).document = { createElement: () => ({ className: "", src: "", alt: "" }) };
    });

    afterEach(() => {
        delete (globalThis as unknown as { document?: unknown }).document;
        jest.useRealTimers();
    });

    it("replaces colour icons with an <img> and keeps monochrome icons as a theme mask", async () => {
        const colour = new FakeIcon("colour-tool", "icons/icon.svg");
        const mono = new FakeIcon("mono-tool", "icons/icon.svg");
        const svgs: Record<string, string> = { "colour-tool": COLOUR_SVG, "mono-tool": MONO_SVG };

        await applyToolIconMasks(rootOf(colour, mono), async (toolId) => svgs[toolId]);

        expect(colour.replacedWith).toEqual({ className: "tool-item-icon-img", src: svgToDataUrl(COLOUR_SVG), alt: "colour-tool icon" });
        expect(mono.replacedWith).toBeNull();
        expect(mono.getAttribute("data-pptb-icon-state")).toBe("mask");
        expect(mono.styles.get("--pptb-icon-url")).toBe(`url(${JSON.stringify(svgToDataUrl(MONO_SVG))})`);
    });

    it("falls back to a mask on the original URL when the loader throws or rejects", async () => {
        const throwing = new FakeIcon("throws", "icons/icon.svg");
        const rejecting = new FakeIcon("rejects", "icons/icon.svg");

        await applyToolIconMasks(rootOf(throwing, rejecting), (toolId) => {
            if (toolId === "throws") throw new Error("toolboxAPI unavailable");
            return Promise.reject(new Error("IPC failed"));
        });

        for (const icon of [throwing, rejecting]) {
            expect(icon.getAttribute("data-pptb-icon-state")).toBe("url");
            expect(icon.styles.get("--pptb-icon-url")).toBe(`url(${JSON.stringify(icon.getAttribute("data-pptb-icon-url"))})`);
        }
    });

    it("draws a cached icon on re-render without loading it again", async () => {
        const loader = jest.fn(async () => COLOUR_SVG);
        await applyToolIconMasks(rootOf(new FakeIcon("cached-tool", "icons/icon.svg")), loader);

        const rerendered = new FakeIcon("cached-tool", "icons/icon.svg");
        void applyToolIconMasks(rootOf(rerendered), loader);

        // Drawn synchronously, so the icon never blanks.
        expect(rerendered.replacedWith?.src).toBe(svgToDataUrl(COLOUR_SVG));
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it("loads an icon once when several placeholders ask for it together", async () => {
        const loader = jest.fn(async () => MONO_SVG);
        await applyToolIconMasks(rootOf(new FakeIcon("shared-tool", "icons/icon.svg"), new FakeIcon("shared-tool", "icons/icon.svg")), loader);
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it("retries an icon that couldn't be loaded after a minute", async () => {
        jest.useFakeTimers({ now: 0 });
        const loader = jest.fn(async () => null as string | null);

        await applyToolIconMasks(rootOf(new FakeIcon("flaky-tool", "icons/icon.svg")), loader);
        await applyToolIconMasks(rootOf(new FakeIcon("flaky-tool", "icons/icon.svg")), loader);
        expect(loader).toHaveBeenCalledTimes(1);

        jest.setSystemTime(61_000);
        loader.mockResolvedValueOnce(COLOUR_SVG);
        const retried = new FakeIcon("flaky-tool", "icons/icon.svg");
        await applyToolIconMasks(rootOf(retried), loader);

        expect(loader).toHaveBeenCalledTimes(2);
        expect(retried.replacedWith?.src).toBe(svgToDataUrl(COLOUR_SVG));
    });
});
