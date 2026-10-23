import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { BUNDLED_CAPABILITY_CATALOG, type CapabilityCatalog } from "../../../packages/validation/src/capabilities";
import { readCatalogUrl, resolveCapabilityCatalog } from "../../../packages/validation/src/catalog-node";

describe("capability catalog resolution", () => {
    let root: string;
    let fetchMock: jest.SpyInstance;
    const url = "https://catalog.example.test/api/capabilities";
    const catalog: CapabilityCatalog = { ...BUNDLED_CAPABILITY_CATALOG, revision: "live-revision", capabilities: [{ tag: "new-tag", description: "New capability" }] };
    const response = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

    beforeEach(async () => {
        root = await fs.mkdtemp(path.join(os.tmpdir(), "pptb-capability-test-"));
        fetchMock = jest.spyOn(globalThis, "fetch");
    });
    afterEach(async () => {
        jest.restoreAllMocks();
        await fs.rm(root, { recursive: true, force: true });
    });

    it("returns live data and persists a last-known-good catalog", async () => {
        fetchMock.mockResolvedValue(response(catalog));
        const live = await resolveCapabilityCatalog({ url, cacheDirectory: root });
        expect(live).toMatchObject({ source: "live", catalog, fetchedAt: expect.any(String), warnings: [] });
        expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }));
        const cached = await resolveCapabilityCatalog({ url, cacheDirectory: root, offline: true });
        expect(cached).toMatchObject({ source: "cache", catalog, fetchedAt: live.fetchedAt, warnings: [expect.stringContaining("not verified")] });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("retains a previous catalog on malformed responses and reports the failure", async () => {
        fetchMock.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(response({ schemaVersion: 2 }));
        await resolveCapabilityCatalog({ url, cacheDirectory: root });
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: root })).toMatchObject({
            source: "cache",
            catalog,
            warnings: expect.arrayContaining([expect.stringContaining("Invalid capability catalog")]),
        });
    });

    it("does not revive bundled tags when the live active catalog is empty", async () => {
        fetchMock.mockResolvedValue(response({ ...catalog, capabilities: [] }));
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: root })).toMatchObject({ source: "live", catalog: { capabilities: [] } });
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: root, offline: true })).toMatchObject({ source: "cache", catalog: { capabilities: [] } });
    });

    it("does not reuse a cache from a different endpoint", async () => {
        fetchMock.mockResolvedValue(response(catalog));
        await resolveCapabilityCatalog({ url, cacheDirectory: root });
        expect(await resolveCapabilityCatalog({ url: `${url}/other`, cacheDirectory: root, offline: true })).toMatchObject({ source: "bundled" });
    });

    it("reports corrupt caches instead of silently treating them as approved", async () => {
        fetchMock.mockResolvedValue(response(catalog));
        await resolveCapabilityCatalog({ url, cacheDirectory: root });
        const [file] = await fs.readdir(root);
        await fs.writeFile(path.join(root, file), "{");
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: root, offline: true })).toMatchObject({
            source: "bundled",
            warnings: expect.arrayContaining([expect.stringContaining("Could not read capability catalog cache")]),
        });
    });

    it("does not hide failed cache writes behind a network fallback", async () => {
        fetchMock.mockResolvedValue(response(catalog));
        const file = path.join(root, "not-a-directory");
        await fs.writeFile(file, "");
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: file })).toMatchObject({
            source: "live",
            warnings: [expect.stringContaining("Could not persist")],
        });
    });

    it.each([new Error("network unavailable"), new Error("operation timed out")])("reports network failures and falls back explicitly", async (error) => {
        fetchMock.mockRejectedValue(error);
        expect(await resolveCapabilityCatalog({ url, cacheDirectory: root })).toMatchObject({
            source: "bundled",
            warnings: expect.arrayContaining([expect.stringContaining(error.message), expect.stringContaining("not verified")]),
        });
    });

    it("does not make a network request without an endpoint", async () => {
        expect(await resolveCapabilityCatalog()).toMatchObject({ source: "bundled", warnings: [expect.stringContaining("not configured")] });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never falls back in live-required mode, even if a cached catalog exists", async () => {
        fetchMock.mockResolvedValueOnce(response(catalog)).mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
        await resolveCapabilityCatalog({ url, cacheDirectory: root });
        await expect(resolveCapabilityCatalog({ url, cacheDirectory: root, requireLive: true })).rejects.toThrow("HTTP 503");
        await expect(resolveCapabilityCatalog({ requireLive: true })).rejects.toThrow("requires PPTB_CAPABILITY_CATALOG_URL");
        await expect(resolveCapabilityCatalog({ offline: true, requireLive: true })).rejects.toThrow("cannot be combined");
    });

    it.each(["http://catalog.example.test", "https://user:password@catalog.example.test", "https://catalog.example.test/#fragment", "not-a-url"])(
        "rejects invalid endpoint configuration: %s",
        async (value) => {
            await expect(resolveCapabilityCatalog({ url: value, cacheDirectory: root })).rejects.toThrow();
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it("reads quoted .env settings and gives the process environment precedence", async () => {
        await fs.writeFile(path.join(root, ".env"), `OTHER_SETTING=ignored\nexport PPTB_CAPABILITY_CATALOG_URL="${url}?test=1" # public URL\n`);
        expect(await readCatalogUrl(root, {})).toBe(`${url}?test=1`);
        expect(await readCatalogUrl(root, { PPTB_CAPABILITY_CATALOG_URL: `${url}/override` })).toBe(`${url}/override`);
        expect(await readCatalogUrl(root, { PPTB_CAPABILITY_CATALOG_URL: "" })).toBeUndefined();
    });

    it("handles unquoted values, comments, missing files, and malformed quotes explicitly", async () => {
        expect(await readCatalogUrl(root, {})).toBeUndefined();
        await fs.writeFile(path.join(root, ".env"), `PPTB_CAPABILITY_CATALOG_URL=${url} # comment\n`);
        expect(await readCatalogUrl(root, {})).toBe(url);
        await fs.writeFile(path.join(root, ".env"), `PPTB_CAPABILITY_CATALOG_URL="${url}\n`);
        await expect(readCatalogUrl(root, {})).rejects.toThrow("Invalid quoted");
    });
});
