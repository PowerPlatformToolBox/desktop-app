/// <reference types="jest" />

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

describe("ToolManager invocation target resolution", () => {
    let toolsDirectory: string;

    beforeEach(() => {
        toolsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-tools-manager-"));
    });

    afterEach(() => {
        fs.rmSync(toolsDirectory, { recursive: true, force: true });
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
