import childProcess from "child_process";
import spawn from "cross-spawn";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PassThrough } from "stream";
import { ToolManager } from "../../../../src/main/managers/toolsManager";

jest.mock("cross-spawn", () => jest.fn());
jest.mock("../../../../src/common/logger");

describe("ToolManager package installation", () => {
    let toolsDirectory: string;
    const originalPlatform = process.platform;
    const spawnMock = jest.mocked(spawn);

    function child(code = 0, error?: NodeJS.ErrnoException, stderr?: string): childProcess.ChildProcess {
        const process = new childProcess.ChildProcess();
        process.stdout = new PassThrough();
        process.stderr = new PassThrough();
        setImmediate(() => {
            if (error) {
                process.emit("error", error);
            } else {
                if (stderr) process.stderr?.emit("data", Buffer.from(stderr));
                process.emit("close", code);
            }
        });
        return process;
    }

    beforeEach(() => {
        toolsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pptb-install with spaces & (parentheses)-"));
        spawnMock.mockReset();
        spawnMock.mockImplementation(() => child());
        jest.spyOn(childProcess, "spawn").mockImplementation(() => {
            throw new Error("Package managers must use cross-spawn to support Windows command shims");
        });
    });

    afterEach(() => {
        Object.defineProperty(process, "platform", { value: originalPlatform });
        jest.restoreAllMocks();
        fs.rmSync(toolsDirectory, { recursive: true, force: true });
    });

    it.each(["win32", "linux", "darwin"])("detects pnpm and installs a scoped package on %s", async (platform) => {
        Object.defineProperty(process, "platform", { value: platform });
        const packageName = "@victorsolaya/pptb-contact-center-map@beta";

        await new ToolManager(toolsDirectory).installToolForDebug(packageName);

        expect(spawnMock).toHaveBeenCalledTimes(2);
        expect(spawnMock).toHaveBeenNthCalledWith(1, "pnpm", ["--version"], { env: expect.objectContaining({ PATH: expect.any(String) }) });
        expect(spawnMock).toHaveBeenNthCalledWith(2, "pnpm", ["add", packageName, "--dir", toolsDirectory, "--no-optional", "--prod"], {
            env: expect.objectContaining({ PATH: expect.any(String) }),
        });
    });

    it.each(["nonzero exit", "missing command"])("falls back to npm on Windows when pnpm reports %s", async (failure) => {
        Object.defineProperty(process, "platform", { value: "win32" });
        spawnMock.mockImplementationOnce(() => (failure === "nonzero exit" ? child(1) : child(0, Object.assign(new Error("spawn pnpm ENOENT"), { code: "ENOENT" }))));

        await new ToolManager(toolsDirectory).installToolForDebug("example-tool");

        expect(spawnMock).toHaveBeenCalledTimes(3);
        expect(spawnMock).toHaveBeenNthCalledWith(2, "npm", ["--version"], { env: expect.any(Object) });
        expect(spawnMock).toHaveBeenNthCalledWith(3, "npm", ["install", "example-tool", "--prefix", toolsDirectory, "--no-optional", "--production"], { env: expect.any(Object) });
    });

    it.each(['example-tool@">=1.0.0 <2.0.0"', "example-tool&echo injected", "example-tool%PATH%!PATH!"])("passes %s as one argument without enabling an unescaped shell", async (packageName) => {
        Object.defineProperty(process, "platform", { value: "win32" });

        await new ToolManager(toolsDirectory).installToolForDebug(packageName);

        const [, args, options] = spawnMock.mock.calls[1];
        expect(args).toEqual(["add", packageName, "--dir", toolsDirectory, "--no-optional", "--prod"]);
        expect(options?.shell).not.toBe(true);
    });

    it("preserves the environment used for package-manager detection and installation", async () => {
        const manager = new ToolManager(toolsDirectory, undefined, undefined, undefined, undefined, undefined, {
            getProxyEnvironmentVariables: () => ({ HTTPS_PROXY: "http://proxy.example:8080" }),
        } as unknown as ConstructorParameters<typeof ToolManager>[6]);

        await manager.installToolForDebug("example-tool");

        for (const [, , options] of spawnMock.mock.calls) {
            expect(options?.env?.HTTPS_PROXY).toBe("http://proxy.example:8080");
        }
    });

    it("reports installation instructions if neither package manager is available", async () => {
        spawnMock.mockImplementation(() => child(1));

        await expect(new ToolManager(toolsDirectory).installToolForDebug("example-tool")).rejects.toThrow("No package manager found");
        expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it("reports installation exit codes and stderr", async () => {
        spawnMock.mockImplementationOnce(() => child()).mockImplementationOnce(() => child(1, undefined, "Registry unavailable"));

        await expect(new ToolManager(toolsDirectory).installToolForDebug("example-tool")).rejects.toThrow("Tool installation failed with code 1\nRegistry unavailable");
    });

    it("propagates installation process errors", async () => {
        const error = new Error("Installation process failed");
        spawnMock.mockImplementationOnce(() => child()).mockImplementationOnce(() => child(0, error));

        await expect(new ToolManager(toolsDirectory).installToolForDebug("example-tool")).rejects.toBe(error);
    });
});
