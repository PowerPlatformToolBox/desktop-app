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
    connections: null,
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

    it.each([
        ["1.0.0", false],
        ["1.1.3", false],
        ["1.2.0", true],
        ["1.7.0", true],
    ])("only reports a strictly newer registry version (%s) as an update", async (registryVersion, expectedHasUpdate) => {
        const manager = new ToolRegistryManager(toolsDirectory);
        jest.spyOn(manager, "getInstalledManifest").mockResolvedValue({ version: "1.1.3" } as any);
        jest.spyOn(manager, "fetchRegistry").mockResolvedValue([{ id: "versioned-tool", version: registryVersion } as any]);

        await expect(manager.checkForUpdates("versioned-tool")).resolves.toEqual({ hasUpdate: expectedHasUpdate, latestVersion: registryVersion });
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

        const catalogColumns = catalogSelect.mock.calls[catalogSelect.mock.calls.length - 1][0] as string;
        expect(catalogColumns).toContain("mcp_enabled");
        expect(catalogColumns).toContain("readme_url");
        expect(catalogColumns).toContain("maturity_status");
        expect(catalogColumns).toContain("connections");
        expect(catalogColumns).not.toContain("tool_release_features(");
        expect(catalogColumns).not.toMatch(/downloadurl|iconurl|readmeurl|tool_maturity|max_api/);
        expect(result[0]).toMatchObject({ maturity: "verified", downloadUrl: catalogRow.download, version: catalogRow.version });
    });

    it("retries the catalog view without embedded relations when the relation query fails", async () => {
        const catalogSelect = jest.fn().mockReturnThis();
        const order = jest
            .fn()
            .mockResolvedValueOnce({ data: null, error: { message: "Could not find a relationship" } })
            .mockResolvedValueOnce({
                data: [
                    {
                        ...catalogRow,
                        connections: '{"max":3,"min":0}',
                    },
                ],
                error: null,
            });
        const catalogQuery = {
            select: catalogSelect,
            in: jest.fn().mockReturnThis(),
            order,
        };
        const manager = new ToolRegistryManager(toolsDirectory, "https://supabase.example", "anon-key");
        const from = jest.fn().mockReturnValue(catalogQuery);
        (manager as unknown as { supabase: unknown }).supabase = { from };

        const [tool] = await (manager as any).fetchRegistryFromSupabase();

        const selectedColumns = catalogSelect.mock.calls.map(([columns]) => columns as string);
        expect(selectedColumns[0]).toContain("tool_categories(");
        expect(selectedColumns[1]).toBe("*");
        expect(tool.version).toBe(catalogRow.version);
        expect(tool.features.connections).toEqual({ min: 0, max: 3 });
    });

    it("maps the normalized view's serialized connections value and preserves the release version", () => {
        const mapped = mapSupabaseToolRow({
            ...catalogRow,
            connections: '{"max":3,"min":0}',
        });

        expect(mapped.version).toBe("2.3.0");
        expect(mapped.features).toMatchObject({ connections: { min: 0, max: 3 } });
        expect(mapped.features).not.toHaveProperty("multiConnection");
        expect(mapped.features).not.toHaveProperty("connectionRequirement");
    });

    it("parses a double-encoded connections feature value from the normalized view", () => {
        const mapped = mapSupabaseToolRow({
            ...catalogRow,
            connections: JSON.stringify('{"max":3,"min":0}'),
        });

        expect(mapped.features?.connections).toEqual({ min: 0, max: 3 });
    });

    it("falls back to legacy connection fields when the serialized connections value is malformed", () => {
        const mapped = mapSupabaseToolRow({
            ...catalogRow,
            connections: '{"min":5,"max":2}',
        });

        expect(mapped.features).toMatchObject({ multiConnection: "optional", connectionRequirement: "required" });
        expect(mapped.features).not.toHaveProperty("connections");
    });

    it("fetches, submits, and upvotes tool ideas using the install identity", async () => {
        const installIdManager = { getInstallId: () => "install-123" };
        const manager = new ToolRegistryManager(toolsDirectory, "https://supabase.example", "anon-key", installIdManager as any);
        const rpc = jest.fn().mockResolvedValueOnce({
            data: [{ id: "idea-1", title: "Tool idea", description: "Details", upvotes: 4, created_at: "2026-10-01", has_upvoted: false }],
            error: null,
        });
        const insert = jest.fn().mockResolvedValue({ error: null });
        const from = jest.fn().mockReturnValue({ insert });
        (manager as unknown as { supabase: unknown }).supabase = { rpc, from };

        await expect(manager.fetchToolIdeas()).resolves.toEqual([{ id: "idea-1", title: "Tool idea", description: "Details", upvotes: 4, createdAt: "2026-10-01", hasUpvoted: false }]);
        expect(rpc).toHaveBeenCalledWith("get_tool_ideas", { p_install_id: "install-123" });

        await manager.submitToolIdea({ title: "  Idea  ", description: "  Details  ", email: "  user@example.com  " });
        expect(insert).toHaveBeenCalledWith({
            title: "Idea",
            description: "Details",
            email: "user@example.com",
            install_id: "install-123",
            app_version: expect.any(String),
        });

        rpc.mockResolvedValueOnce({ data: { upvotes: 5, has_upvoted: true }, error: null });
        await expect(manager.upvoteToolIdea("idea-1")).resolves.toEqual({ upvotes: 5, hasUpvoted: true });
        expect(rpc).toHaveBeenLastCalledWith("upvote_tool_idea", { p_idea_id: "idea-1", p_install_id: "install-123" });
    });

    it("persists release metadata on install and uses registry install for updates", async () => {
        const extractedPath = path.join(toolsDirectory, "extracted");
        fs.mkdirSync(extractedPath, { recursive: true });
        fs.writeFileSync(path.join(extractedPath, "package.json"), JSON.stringify({ name: "@contoso/catalog-tool", version: "2.3.0" }));

        const release = mapSupabaseToolRow({ ...catalogRow, connections: '{"max":3,"min":0}' });
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
        expect(persistedManifest.features.connections).toEqual({ min: 0, max: 3 });
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
