/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { InstallIdManager } from "../../../../src/main/managers/installIdManager";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";
import { ToolRegistryManager } from "../../../../src/main/managers/toolRegistryManager";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

describe("tool review installation gate and version capture", () => {
    let toolsDirectory: string;
    const manifestPath = () => path.join(toolsDirectory, "manifest.json");

    function writeManifest(tools: Array<{ id: string; version?: string; repository?: string }>): void {
        fs.writeFileSync(
            manifestPath(),
            JSON.stringify({
                tools: tools.map((tool) => ({ name: tool.id, description: "d", installPath: path.join(toolsDirectory, tool.id), source: "registry", installedAt: new Date().toISOString(), ...tool })),
            }),
        );
    }

    beforeEach(() => {
        toolsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-review-"));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(toolsDirectory, { recursive: true, force: true });
    });

    it("reports installed state and version from local metadata for the specific tool", () => {
        writeManifest([{ id: "installed-tool", version: "1.4.0", repository: "https://github.com/o/r" }]);
        const manager = new ToolManager(toolsDirectory);

        expect(manager.getToolReviewContext("installed-tool")).toEqual({ toolId: "installed-tool", installed: true, version: "1.4.0", repository: "https://github.com/o/r" });
        expect(manager.getToolReviewContext("catalog-only")).toEqual({ toolId: "catalog-only", installed: false });
    });

    it("throws when installation state cannot be read instead of assuming installed", () => {
        fs.writeFileSync(manifestPath(), "{ not json");
        expect(() => new ToolManager(toolsDirectory).getToolReviewContext("any")).toThrow();
    });

    it("blocks submission for uninstalled tools and for tools only other tools make eligible", async () => {
        writeManifest([{ id: "other-tool", version: "1.0.0" }]);
        const submit = jest.spyOn(ToolRegistryManager.prototype, "submitToolRating").mockResolvedValue({ rating: 4 });

        await expect(new ToolManager(toolsDirectory).submitToolRating("catalog-only", 5, "hi", "1.0.0")).rejects.toThrow("must be installed");
        expect(submit).not.toHaveBeenCalled();
    });

    it("blocks submission after the tool is uninstalled while the dialog was open", async () => {
        writeManifest([{ id: "tool-a", version: "1.0.0" }]);
        const manager = new ToolManager(toolsDirectory);
        const submit = jest.spyOn(ToolRegistryManager.prototype, "submitToolRating").mockResolvedValue({ rating: 4 });
        expect(manager.getToolReviewContext("tool-a").installed).toBe(true);

        writeManifest([]);
        await expect(manager.submitToolRating("tool-a", 5, undefined, "1.0.0")).rejects.toThrow("must be installed");
        expect(submit).not.toHaveBeenCalled();
    });

    it("persists the installed version, not the catalog or a stale version, and rejects mismatches", async () => {
        writeManifest([{ id: "tool-a", version: "1.0.0" }]);
        const manager = new ToolManager(toolsDirectory);
        const submit = jest.spyOn(ToolRegistryManager.prototype, "submitToolRating").mockResolvedValue({ rating: 4 });

        await manager.submitToolRating("tool-a", 5, "great", " 1.0.0 ");
        expect(submit).toHaveBeenCalledWith("tool-a", 5, "great", "1.0.0");

        await expect(manager.submitToolRating("tool-a", 5, "great", "2.0.0")).rejects.toThrow(/now 1\.0\.0/);
        expect(submit).toHaveBeenCalledTimes(1);
    });

    it("requires, trims, and bounds an explicit version when metadata has none", async () => {
        writeManifest([{ id: "tool-a" }]);
        const manager = new ToolManager(toolsDirectory);
        const submit = jest.spyOn(ToolRegistryManager.prototype, "submitToolRating").mockResolvedValue({});

        await expect(manager.submitToolRating("tool-a", 5, undefined, undefined)).rejects.toThrow(/Enter the tool version/);
        await expect(manager.submitToolRating("tool-a", 5, undefined, "  ")).rejects.toThrow(/Enter the tool version/);
        await expect(manager.submitToolRating("tool-a", 5, undefined, "x".repeat(101))).rejects.toThrow(/Enter the tool version/);
        await manager.submitToolRating("tool-a", 5, undefined, " 0.9 ");
        expect(submit).toHaveBeenCalledWith("tool-a", 5, undefined, "0.9");
    });

    describe("RPC payload", () => {
        function createRegistry(rpc: jest.Mock): ToolRegistryManager {
            const installIdManager = new InstallIdManager(new SettingsManager());
            jest.spyOn(installIdManager, "getInstallId").mockReturnValue("install-123");
            const registry = new ToolRegistryManager(toolsDirectory, "https://supabase.example", "anon-key", installIdManager);
            (registry as unknown as { supabase: unknown }).supabase = { rpc };
            return registry;
        }

        it("sends tool_version with the existing identity fields", async () => {
            const rpc = jest.fn().mockResolvedValue({ data: [{ rating: 4.5, rating_count: 3 }], error: null });

            const result = await createRegistry(rpc).submitToolRating("tool-a", 4, "nice", "1.2.3");

            expect(rpc).toHaveBeenCalledWith("submit_tool_rating", { p_tool_id: "tool-a", p_install_id: "install-123", p_rating: 4, p_comment: "nice", p_tool_version: "1.2.3" });
            expect(result).toEqual({ rating: 4.5, ratingCount: 3 });
        });

        it("keeps the legacy payload when no version is supplied", async () => {
            const rpc = jest.fn().mockResolvedValue({ data: { rating: 5, rating_count: 1 }, error: null });

            await createRegistry(rpc).submitToolRating("tool-a", 5);

            expect(rpc).toHaveBeenCalledWith("submit_tool_rating", { p_tool_id: "tool-a", p_install_id: "install-123", p_rating: 5, p_comment: null });
        });

        it("surfaces database errors without reporting success", async () => {
            const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: "Tool version must contain 1 to 100 characters when supplied" } });

            await expect(createRegistry(rpc).submitToolRating("tool-a", 5, undefined, "1.0")).rejects.toThrow("Tool version must contain");
        });
    });
});
