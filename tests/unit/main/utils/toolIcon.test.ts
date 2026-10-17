/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { fetchRemoteToolIconSvg, isAllowedRemoteIconUrl, MAX_TOOL_ICON_BYTES, readToolIconSvg, resolveToolIconFile } from "../../../../src/main/utils/toolIcon";

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

describe("remote tool icons", () => {
    it("only allows https SVGs from the hosts the renderer CSP allows", () => {
        expect(isAllowedRemoteIconUrl("https://pptb.blob.core.windows.net/tools/packages/x-1.0.0/x-1.0.0.svg")).toBe(true);
        expect(isAllowedRemoteIconUrl("https://raw.githubusercontent.com/o/r/main/icon.svg")).toBe(true);
        expect(isAllowedRemoteIconUrl("http://pptb.blob.core.windows.net/x.svg")).toBe(false);
        expect(isAllowedRemoteIconUrl("https://example.com/icon.svg")).toBe(false);
        expect(isAllowedRemoteIconUrl("https://raw.githubusercontent.com/o/r/main/icon.png")).toBe(false);
        expect(isAllowedRemoteIconUrl("not a url")).toBe(false);
    });

    const respond = (body: string, init: ResponseInit = {}) => jest.fn().mockResolvedValue(new Response(body, init)) as unknown as typeof fetch;

    it("downloads an allowed SVG", async () => {
        await expect(fetchRemoteToolIconSvg("https://raw.githubusercontent.com/o/r/main/icon.svg", respond(SVG))).resolves.toBe(SVG);
    });

    it("does not request disallowed URLs", async () => {
        const fetchImpl = respond(SVG);
        await expect(fetchRemoteToolIconSvg("https://example.com/icon.svg", fetchImpl)).resolves.toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("returns null for failed, oversized or non-SVG responses", async () => {
        const url = "https://raw.githubusercontent.com/o/r/main/icon.svg";
        await expect(fetchRemoteToolIconSvg(url, respond("missing", { status: 404 }))).resolves.toBeNull();
        await expect(fetchRemoteToolIconSvg(url, respond(`<svg>${" ".repeat(MAX_TOOL_ICON_BYTES)}</svg>`))).resolves.toBeNull();
        await expect(fetchRemoteToolIconSvg(url, respond("<html></html>"))).resolves.toBeNull();
    });
});
