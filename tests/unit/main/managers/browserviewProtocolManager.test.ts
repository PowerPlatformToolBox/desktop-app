import { app } from "electron";
import * as path from "path";
import { BrowserviewProtocolManager } from "../../../../src/main/managers/browserviewProtocolManager";
import { SettingsManager } from "../../../../src/main/managers/settingsManager";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

describe("BrowserviewProtocolManager tool directories", () => {
    const manager = new BrowserviewProtocolManager({} as ToolManager, {} as SettingsManager) as unknown as {
        getToolBaseDirectory(tool: { id?: string; localPath?: string; npmPackageName?: string }): string | null;
    };

    it.each([
        ["power-maverick-tool-erd-generator", "power-maverick-tool-erd-generator"],
        ["power-maverick-tool-erd-generator@1.0.0", "power-maverick-tool-erd-generator"],
        ["power-maverick-tool-erd-generator@beta", "power-maverick-tool-erd-generator"],
        ["@power-maverick/tool-erd-generator", "@power-maverick/tool-erd-generator"],
        ["@power-maverick/tool-erd-generator@1.0.0-beta.1", "@power-maverick/tool-erd-generator"],
        ["@power-maverick/tool-erd-generator@beta", "@power-maverick/tool-erd-generator"],
    ])("resolves npm package %s to its package directory", (npmPackageName, packageDirectory) => {
        expect(manager.getToolBaseDirectory({ npmPackageName })).toBe(path.join(app.getPath("userData"), "tools", "node_modules", packageDirectory));
    });

    it("prefers the local path over the canonical npm package name", () => {
        const localPath = path.join(app.getPath("userData"), "local-tool");
        expect(manager.getToolBaseDirectory({ localPath, npmPackageName: "@power-maverick/tool-erd-generator" })).toBe(localPath);
    });

    it("resolves registry tools by ID", () => {
        expect(manager.getToolBaseDirectory({ id: "registry-tool" })).toBe(path.join(app.getPath("userData"), "tools", "registry-tool"));
    });
});
