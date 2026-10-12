/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ToolRegistryManager } from "../../../../src/main/managers/toolRegistryManager";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

describe("ToolManager invocation target resolution", () => {
    let toolsDirectory: string;

    beforeEach(() => {
        toolsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-tools-manager-"));
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(toolsDirectory, { recursive: true, force: true });
    });

    it.each(["local-power-maverick-tool-erd-generator", "npm-power-maverick-tool-erd-generator"])("does not send usage for %s to the registry", async (toolId) => {
        const trackUsage = jest.spyOn(ToolRegistryManager.prototype, "trackToolUsage").mockResolvedValue(undefined);

        await new ToolManager(toolsDirectory).trackToolUsage(toolId);

        expect(trackUsage).not.toHaveBeenCalled();
    });

    it("continues tracking usage for registry-installed tools", async () => {
        const toolId = "9ce03edb-9529-4f17-9b20-61d8aa3f6503";
        const trackUsage = jest.spyOn(ToolRegistryManager.prototype, "trackToolUsage").mockResolvedValue(undefined);

        await new ToolManager(toolsDirectory).trackToolUsage(toolId);

        expect(trackUsage).toHaveBeenCalledWith(toolId);
    });

    function writeManifest(tool: { id: string; packageName?: string; installPath: string }): void {
        fs.writeFileSync(
            path.join(toolsDirectory, "manifest.json"),
            JSON.stringify({
                tools: [
                    {
                        ...tool,
                        name: "FetchXML Studio",
                        version: "1.0.0",
                        description: "FetchXML tool",
                        installedAt: new Date().toISOString(),
                        source: "registry",
                    },
                ],
            }),
        );
    }

    function writeToolPackage(toolPath: string, packageName: string): void {
        fs.mkdirSync(path.join(toolPath, "dist"), { recursive: true });
        fs.writeFileSync(path.join(toolPath, "package.json"), JSON.stringify({ name: packageName, version: "1.0.0" }));
        fs.writeFileSync(path.join(toolPath, "dist", "index.html"), "<!doctype html><html></html>");
    }

    it("preserves exact internal ID lookup", () => {
        const installPath = path.join(toolsDirectory, "fetchxml-studio");
        writeToolPackage(installPath, "@mohsinonxrm/pptb-fetchxml-studio");
        writeManifest({ id: "fetchxml-studio", packageName: "@mohsinonxrm/pptb-fetchxml-studio", installPath });

        const target = new ToolManager(toolsDirectory).resolveInvocationTarget("fetchxml-studio");

        expect(target).toMatchObject({ id: "fetchxml-studio" });
        expect(target?.npmPackageName).toBeUndefined();
    });

    it("resolves a registry tool by scoped package name", () => {
        const installPath = path.join(toolsDirectory, "fetchxml-studio");
        writeToolPackage(installPath, "@mohsinonxrm/pptb-fetchxml-studio");
        writeManifest({ id: "fetchxml-studio", packageName: "@mohsinonxrm/pptb-fetchxml-studio", installPath });

        const target = new ToolManager(toolsDirectory).resolveInvocationTarget("@mohsinonxrm/pptb-fetchxml-studio");

        expect(target).toMatchObject({ id: "fetchxml-studio" });
        expect(target?.npmPackageName).toBeUndefined();
    });

    it("recovers the package name for a legacy installed manifest", () => {
        const installPath = path.join(toolsDirectory, "fetchxml-studio");
        writeToolPackage(installPath, "@mohsinonxrm/pptb-fetchxml-studio");
        writeManifest({ id: "fetchxml-studio", installPath });

        const target = new ToolManager(toolsDirectory).resolveInvocationTarget("@mohsinonxrm/pptb-fetchxml-studio");

        expect(target).toMatchObject({ id: "fetchxml-studio" });
    });

    it("restores shared release metadata from an installed manifest into runtime tools", () => {
        const installPath = path.join(toolsDirectory, "fetchxml-studio");
        writeToolPackage(installPath, "@mohsinonxrm/pptb-fetchxml-studio");
        fs.writeFileSync(
            path.join(toolsDirectory, "manifest.json"),
            JSON.stringify({
                tools: [
                    {
                        id: "fetchxml-studio",
                        packageName: "@mohsinonxrm/pptb-fetchxml-studio",
                        name: "FetchXML Studio",
                        version: "2.1.0",
                        description: "FetchXML tool",
                        installPath,
                        installedAt: new Date().toISOString(),
                        source: "registry",
                        authors: ["Contoso"],
                        readmeUrl: "https://example.com/readme",
                        features: { multiConnection: "optional", connectionRequirement: "required" },
                        maturity: "verified",
                    },
                ],
            }),
        );

        const [tool] = new ToolManager(toolsDirectory).getAllTools();

        expect(tool).toMatchObject({
            id: "fetchxml-studio",
            version: "2.1.0",
            authors: ["Contoso"],
            readmeUrl: "https://example.com/readme",
            features: { multiConnection: "optional", connectionRequirement: "required" },
            maturity: "verified",
        });
    });

    it("resolves a local tool by its canonical package name", async () => {
        const localPath = path.join(toolsDirectory, "local-source");
        writeToolPackage(localPath, "@contoso/local-caller-target");
        const manager = new ToolManager(toolsDirectory);
        const localTool = await manager.loadLocalTool(localPath);

        const target = manager.resolveInvocationTarget("@contoso/local-caller-target");

        expect(target).toBe(localTool);
        expect(target?.id).toBe("local-contoso-local-caller-target");
    });

    it("rejects ambiguous package-name matches", async () => {
        const installPath = path.join(toolsDirectory, "fetchxml-studio");
        writeToolPackage(installPath, "@mohsinonxrm/pptb-fetchxml-studio");
        writeManifest({ id: "fetchxml-studio", packageName: "@mohsinonxrm/pptb-fetchxml-studio", installPath });

        const localPath = path.join(toolsDirectory, "local-source");
        writeToolPackage(localPath, "@mohsinonxrm/pptb-fetchxml-studio");
        const manager = new ToolManager(toolsDirectory);
        await manager.loadLocalTool(localPath);

        expect(() => manager.resolveInvocationTarget("@mohsinonxrm/pptb-fetchxml-studio")).toThrow("Multiple installed tools match package name");
    });
});
