import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { mapSupabaseToolRow, ToolRegistryManager } from "../../../../src/main/managers/toolRegistryManager";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

const catalogRow = {
    id: "catalog-tool",
    name: "Catalog Tool",
    description: "Current release metadata",
    download: "https://cdn.example/catalog-tool.tgz",
    icon: "https://cdn.example/icon.svg",
    readme_url: "https://example.com/readme",
    version: "2.3.0",
    license: "MIT",
    csp_exceptions: { connectSrc: ["https://api.example"] },
    min_api: "1.2.0",
    multi_connection: "optional",
    connection_requirement: "required",
    enabled_for_power_platform_api: false,
    mcp_enabled: true,
    maturity_status: "verified",
    published_at: "2026-09-20T00:00:00Z",
    tool_categories: [{ categories: { name: "Dataverse" } }],
    tool_contributors: [{ contributors: { name: "Contoso" } }],
};

describe("Supabase tools_catalog mapping", () => {
    it("maps current release metadata and typed feature fields", () => {
        expect(mapSupabaseToolRow(catalogRow)).toMatchObject({
            id: "catalog-tool",
            version: "2.3.0",
            downloadUrl: "https://cdn.example/catalog-tool.tgz",
            icon: "https://cdn.example/icon.svg",
            readmeUrl: "https://example.com/readme",
            publishedAt: "2026-09-20T00:00:00Z",
            license: "MIT",
            cspExceptions: { connectSrc: ["https://api.example"] },
            minAPI: "1.2.0",
            features: {
                multiConnection: "optional",
                connectionRequirement: "required",
                minAPI: "1.2.0",
                enabledForPowerPlatformAPI: false,
            },
            mcpHeadlessEnabled: true,
            maturity: "verified",
        });
    });

    it.each([false, true])("preserves explicit MCP value %s", (mcpEnabled) => {
        expect(mapSupabaseToolRow({ ...catalogRow, mcp_enabled: mcpEnabled }).mcpHeadlessEnabled).toBe(mcpEnabled);
    });

    it("leaves MCP undefined when the rollout field is missing", () => {
        const row = { ...catalogRow, mcp_enabled: undefined };
        delete (row as Partial<typeof catalogRow>).mcp_enabled;
        expect(mapSupabaseToolRow(row).mcpHeadlessEnabled).toBeUndefined();
    });
});

describe("ToolRegistryManager Supabase rollout and install", () => {
    let toolsDirectory: string;

    beforeEach(() => {
        toolsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-registry-test-"));
    });

    afterEach(() => {
        fs.rmSync(toolsDirectory, { recursive: true, force: true });
    });

    it("normalizes a legacy manifest readme key to readmeUrl", async () => {
        fs.writeFileSync(
            path.join(toolsDirectory, "manifest.json"),
            JSON.stringify({
                tools: [
                    {
                        id: "legacy-tool",
                        name: "Legacy Tool",
                        version: "1.0.0",
                        description: "Old manifest format",
                        installPath: path.join(toolsDirectory, "legacy-tool"),
                        installedAt: "2026-01-01T00:00:00.000Z",
                        source: "registry",
                        readme: "https://example.com/old-readme",
                    },
                ],
            }),
        );

        const manager = new ToolRegistryManager(toolsDirectory);
        const [manifest] = await manager.getInstalledTools();

        expect(manifest.readmeUrl).toBe("https://example.com/old-readme");
        expect(manifest).not.toHaveProperty("readme");
    });

    it("queries tools_catalog using only normalized release fields", async () => {
        const catalogSelect = jest.fn().mockReturnThis();
        const catalogQuery = {
            select: catalogSelect,
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockResolvedValue({ data: [catalogRow], error: null }),
        };
        const manager = new ToolRegistryManager(toolsDirectory, "https://supabase.example", "anon-key");
        const from = jest.fn().mockReturnValue(catalogQuery);
        (manager as unknown as { supabase: unknown }).supabase = { from };

        const result = await (manager as any).fetchRegistryFromSupabase();

        const catalogColumns = catalogSelect.mock.calls[0][0] as string;
        expect(catalogColumns).toContain("mcp_enabled");
        expect(catalogColumns).toContain("readme_url");
        expect(catalogColumns).toContain("maturity_status");
        expect(catalogColumns).not.toMatch(/downloadurl|iconurl|readmeurl|features|tool_maturity|max_api/);
        expect(result[0]).toMatchObject({ maturity: "verified", downloadUrl: catalogRow.download });
    });

    it("persists release metadata on install and uses registry install for updates", async () => {
        const extractedPath = path.join(toolsDirectory, "extracted");
        fs.mkdirSync(extractedPath, { recursive: true });
        fs.writeFileSync(path.join(extractedPath, "package.json"), JSON.stringify({ name: "@contoso/catalog-tool", version: "2.3.0" }));

        const release = mapSupabaseToolRow(catalogRow);
        const manager = new ToolRegistryManager(toolsDirectory, "https://supabase.example", "anon-key");
        jest.spyOn(manager, "fetchRegistry").mockResolvedValue([release]);
        jest.spyOn(manager, "downloadTool").mockResolvedValue(extractedPath);
        jest.spyOn(manager, "trackToolDownload").mockResolvedValue();

        const manifest = await manager.installTool("catalog-tool");
        expect(manifest).toMatchObject({
            version: "2.3.0",
            sourceUrl: catalogRow.download,
            readmeUrl: catalogRow.readme_url,
            features: release.features,
            minAPI: "1.2.0",
            mcpHeadlessEnabled: true,
            maturity: "verified",
        });
        const persistedManifest = JSON.parse(fs.readFileSync(path.join(toolsDirectory, "manifest.json"), "utf-8")).tools[0];
        expect(persistedManifest.readmeUrl).toBe(catalogRow.readme_url);
        expect(persistedManifest).not.toHaveProperty("readme");

        const appManager = new ToolManager(toolsDirectory);
        const installTool = jest.fn().mockResolvedValue(manifest);
        (appManager as unknown as { registryManager: { installTool: typeof installTool } }).registryManager = { installTool };
        jest.spyOn(appManager, "isToolLoaded").mockReturnValue(false);
        jest.spyOn(appManager, "loadTool").mockResolvedValue({ id: manifest.id } as any);

        await appManager.updateTool("catalog-tool");
        expect(installTool).toHaveBeenCalledWith("catalog-tool");
    });
});
