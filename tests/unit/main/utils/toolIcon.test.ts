/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { MAX_TOOL_ICON_BYTES, readToolIconSvg, resolveToolIconFile } from "../../../../src/main/utils/toolIcon";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="#0E5A9C" d="M0 0h64v64H0z"/></svg>';

describe("resolveToolIconFile", () => {
    const base = path.resolve("/tools/sample");
    const dist = path.join(base, "dist");

    it("resolves the manifest icon path relative to dist/", () => {
        expect(resolveToolIconFile(base, "icons/icon.svg")).toBe(path.join(dist, "icons", "icon.svg"));
        expect(resolveToolIconFile(base, "./icons/icon.svg")).toBe(path.join(dist, "icons", "icon.svg"));
        expect(resolveToolIconFile(base, "dist/icons/icon.svg")).toBe(path.join(dist, "icons", "icon.svg"));
        expect(resolveToolIconFile(base, "icons\\icon.svg")).toBe(path.join(dist, "icons", "icon.svg"));
    });

    it("rejects paths outside dist/ and non-SVG files", () => {
        expect(resolveToolIconFile(base, "../package.json")).toBeNull();
        expect(resolveToolIconFile(base, "../../secret.svg")).toBeNull();
        expect(resolveToolIconFile(base, "icons/icon.png")).toBeNull();
    });

    it("rejects URLs and drive or network paths, which aren't bundled icons", () => {
        // Marketplace icons are loaded by the renderer from their blob URL, never by the host.
        expect(resolveToolIconFile(base, "https://pptb.blob.core.windows.net/tools/packages/x-1.0.0/x-1.0.0.svg")).toBeNull();
        expect(resolveToolIconFile(base, "pptb-webview://other-tool/icon.svg")).toBeNull();
        expect(resolveToolIconFile(base, "file:///etc/icon.svg")).toBeNull();
        expect(resolveToolIconFile(base, "C:\\icons\\icon.svg")).toBeNull();
        expect(resolveToolIconFile(base, "\\\\server\\share\\icon.svg")).toBeNull();
    });

    it("treats a leading slash as the dist root, like the renderer's pptb-webview URL", () => {
        expect(resolveToolIconFile(base, "/icons/icon.svg")).toBe(path.join(dist, "icons", "icon.svg"));
    });
});

describe("readToolIconSvg", () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-tool-icon-"));
        fs.mkdirSync(path.join(root, "dist", "icons"), { recursive: true });
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it("returns the bundled SVG markup", () => {
        fs.writeFileSync(path.join(root, "dist", "icons", "icon.svg"), SVG);
        expect(readToolIconSvg(root, "icons/icon.svg")).toBe(SVG);
    });

    it("returns null for missing, oversized or non-SVG files", () => {
        expect(readToolIconSvg(root, "icons/missing.svg")).toBeNull();

        fs.writeFileSync(path.join(root, "dist", "icons", "big.svg"), `<svg>${" ".repeat(MAX_TOOL_ICON_BYTES)}</svg>`);
        expect(readToolIconSvg(root, "icons/big.svg")).toBeNull();

        fs.writeFileSync(path.join(root, "dist", "icons", "fake.svg"), "not an svg");
        expect(readToolIconSvg(root, "icons/fake.svg")).toBeNull();
    });
});
