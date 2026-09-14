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
        expect(target?.id).toMatch(/^local-contoso-local-caller-target-[a-f0-9]{12}$/);
    });

    it("assigns different IDs to local folders with the same package name", async () => {
        const firstPath = path.join(toolsDirectory, "first-local-source");
        const secondPath = path.join(toolsDirectory, "second-local-source");
        writeToolPackage(firstPath, "shared-package-name");
        writeToolPackage(secondPath, "shared-package-name");
        const manager = new ToolManager(toolsDirectory);

        const firstTool = await manager.loadLocalTool(firstPath);
        const secondTool = await manager.loadLocalTool(secondPath);

        expect(firstTool.id).not.toBe(secondTool.id);
        expect(manager.getAllTools()).toEqual(expect.arrayContaining([firstTool, secondTool]));
    });

    it("changes the local ID when exact package identity changes", () => {
        const localPath = path.join(toolsDirectory, "local-source");
        writeToolPackage(localPath, "@scope/tool");
        const manager = new ToolManager(toolsDirectory);
        const scopedIdentity = manager.readLocalToolIdentity(localPath);

        fs.writeFileSync(path.join(localPath, "package.json"), JSON.stringify({ name: "scope-tool", version: "1.0.0" }));
        const unscopedIdentity = manager.readLocalToolIdentity(localPath);

        expect(scopedIdentity?.id).not.toBe(unscopedIdentity?.id);
    });

    it("rejects a local tool whose dist junction escapes the tool directory", async () => {
        const localPath = path.join(toolsDirectory, "local-source");
        const externalDistPath = path.join(toolsDirectory, "external-dist");
        fs.mkdirSync(localPath, { recursive: true });
        fs.mkdirSync(externalDistPath, { recursive: true });
        fs.writeFileSync(path.join(localPath, "package.json"), JSON.stringify({ name: "junction-tool", version: "1.0.0" }));
        fs.writeFileSync(path.join(externalDistPath, "index.html"), "<!doctype html><html></html>");
        fs.symlinkSync(externalDistPath, path.join(localPath, "dist"), "junction");

        const manager = new ToolManager(toolsDirectory);
        const identity = manager.readLocalToolIdentity(localPath);

        expect(identity).toBeNull();
        await expect(manager.loadLocalTool(localPath)).rejects.toThrow("inside its canonical directory");
    });

    it("removes a provisional local registration only for its exact identity", async () => {
        const localPath = path.join(toolsDirectory, "local-source");
        writeToolPackage(localPath, "provisional-tool");
        const manager = new ToolManager(toolsDirectory);
        const identity = manager.readLocalToolIdentity(localPath);
        expect(identity).not.toBeNull();
        const tool = await manager.loadLocalTool(localPath, identity!);

        expect(manager.removeLocalTool(tool.id, { ...identity!, name: "other-tool" })).toBe(false);
        expect(manager.getAllTools()).toContain(tool);
        expect(manager.removeLocalTool(tool.id, identity!)).toBe(true);
        expect(manager.getAllTools()).not.toContain(tool);
    });

    it("keeps a staged local tool private until exact-identity commit", async () => {
        const localPath = path.join(toolsDirectory, "local-source");
        writeToolPackage(localPath, "staged-tool");
        const manager = new ToolManager(toolsDirectory);
        const identity = manager.readLocalToolIdentity(localPath);
        expect(identity).not.toBeNull();
        const loadedListener = jest.fn();
        manager.on("tool:loaded", loadedListener);

        const tool = await manager.loadLocalTool(localPath, identity!, true);

        expect(manager.getAllTools()).not.toContain(tool);
        expect(manager.getTool(tool.id)).toBeUndefined();
        expect(manager.getToolForWebview(tool.id)).toBe(tool);
        expect(loadedListener).not.toHaveBeenCalled();
        expect(manager.commitLocalTool(tool.id, { ...identity!, name: "other-tool" })).toBe(false);
        expect(manager.commitLocalTool(tool.id, identity!)).toBe(true);
        expect(manager.getAllTools()).toContain(tool);
        expect(loadedListener).toHaveBeenCalledWith(tool);
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
