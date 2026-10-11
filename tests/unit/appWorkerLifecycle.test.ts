import { ToolInstallationCoordinator } from "../../src/main/utilities/appWorkerLifecycle";

describe("ToolInstallationCoordinator", () => {
    function setup() {
        const sender = { isDestroyed: jest.fn(() => false) };
        const dependencies = {
            mainSender: jest.fn(() => sender),
            installed: jest.fn((): { id: string; npmPackageName?: string }[] => []),
            registry: jest.fn(async (): Promise<{ id: string; npmPackageName?: string }[]> => []),
            mutate: jest.fn(async (_toolId: string, action: () => Promise<unknown>): Promise<unknown> => action()),
        };
        const coordinator = new ToolInstallationCoordinator({
            ...dependencies,
            mutate: <Result>(toolId: string, action: () => Promise<Result>): Promise<Result> => dependencies.mutate(toolId, action) as Promise<Result>,
        });
        return { sender, dependencies, coordinator };
    }

    it.each(["registry", "npm"] as const)("rejects foreign or destroyed senders before %s lookup or writes", async (source) => {
        const { coordinator, sender, dependencies } = setup();
        const write = jest.fn(async () => undefined);
        await expect(coordinator.install({ isDestroyed: () => false }, "tool", source, write)).rejects.toThrow("trusted main window");
        sender.isDestroyed.mockReturnValue(true);
        await expect(coordinator.install(sender, "tool", source, write)).rejects.toThrow("trusted main window");
        expect(dependencies.registry).not.toHaveBeenCalled();
        expect(dependencies.mutate).not.toHaveBeenCalled();
        expect(write).not.toHaveBeenCalled();
    });

    it.each([
        ["registry", "registry-id", "registry-id"],
        ["npm", "@scope/ui@beta", "@scope/ui"],
        ["npm", "@scope/ui@1.2.3", "@scope/ui"],
    ] as const)("gates installed %s replacement before any package write", async (source, input, canonical) => {
        const { coordinator, sender, dependencies } = setup();
        dependencies.installed.mockReturnValue([{ id: "registry-id", npmPackageName: "@scope/ui" }]);
        let stopped!: () => void;
        let firstMutation = true;
        dependencies.mutate.mockImplementation(async (_toolId, action) => {
            if (firstMutation) {
                firstMutation = false;
                await new Promise<void>((resolve) => {
                    stopped = resolve;
                });
            }
            return action();
        });
        const write = jest.fn(async () => "loaded");
        const installing = coordinator.install(sender, input, source, write);
        expect(dependencies.mutate).toHaveBeenCalledWith(source === "registry" ? "registry-id" : "npm-scope-ui", expect.any(Function));
        expect(write).not.toHaveBeenCalled();
        stopped();
        await expect(installing).resolves.toBe("loaded");
        expect(dependencies.mutate).toHaveBeenCalledWith("registry-id", expect.any(Function));
        expect(write).toHaveBeenCalledWith(canonical);
        expect(dependencies.registry).not.toHaveBeenCalled();
    });

    it.each(["registry", "npm"] as const)("resolves new %s identities using the owning source's canonical ID", async (source) => {
        const { coordinator, sender, dependencies } = setup();
        dependencies.registry.mockResolvedValue([{ id: "registry-id", npmPackageName: "@scope/ui" }]);
        const write = jest.fn(async () => undefined);
        await coordinator.install(sender, source === "registry" ? "registry-id" : "@scope/ui", source, write);
        expect(dependencies.mutate).toHaveBeenCalledWith(source === "registry" ? "registry-id" : "npm-scope-ui", expect.any(Function));
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("uses the canonical package identity for a new debug-only npm install", async () => {
        const { coordinator, sender, dependencies } = setup();
        await coordinator.install(sender, "@scope/new@1.0.0", "npm", async () => undefined);
        expect(dependencies.mutate).toHaveBeenCalledWith("npm-scope-new", expect.any(Function));
        expect(dependencies.registry).not.toHaveBeenCalled();
    });

    it("aborts writes when stop fails", async () => {
        const { coordinator, sender, dependencies } = setup();
        dependencies.installed.mockReturnValue([{ id: "actual", npmPackageName: "ui" }]);
        dependencies.mutate.mockRejectedValue(new Error("worker still alive"));
        const write = jest.fn(async () => undefined);
        await expect(coordinator.install(sender, "ui", "npm", write)).rejects.toThrow("worker still alive");
        expect(write).not.toHaveBeenCalled();
    });

    it("rechecks sender authority after async resolution and before a queued write", async () => {
        const { coordinator, sender, dependencies } = setup();
        const write = jest.fn(async () => undefined);
        dependencies.registry.mockImplementation(async () => {
            sender.isDestroyed.mockReturnValue(true);
            return [{ id: "tool" }];
        });
        await expect(coordinator.install(sender, "tool", "registry", write)).rejects.toThrow("trusted main window");
        expect(dependencies.mutate).not.toHaveBeenCalled();
        sender.isDestroyed.mockReturnValue(false);
        dependencies.installed.mockReturnValue([{ id: "tool" }]);
        dependencies.mutate.mockImplementation(async (_toolId, action) => {
            sender.isDestroyed.mockReturnValue(true);
            return action();
        });
        await expect(coordinator.install(sender, "tool", "registry", write)).rejects.toThrow("trusted main window");
        expect(write).not.toHaveBeenCalled();
    });

    it("gates all registry/prerelease package matches and the actual npm loaded target before writes", async () => {
        const { coordinator, sender, dependencies } = setup();
        dependencies.installed.mockReturnValue([
            { id: "registry-id", npmPackageName: "ui" },
            { id: "npm-ui", npmPackageName: "ui" },
        ]);
        const write = jest.fn(async () => {
            expect(dependencies.mutate.mock.calls.map(([toolId]) => toolId)).toEqual(["npm-ui", "registry-id"]);
        });
        await coordinator.install(sender, "ui@beta", "npm", write);
        expect(write).toHaveBeenCalledTimes(1);
    });

    it("rejects ambiguous registry targets and arbitrary npm source specs", async () => {
        const { coordinator, sender, dependencies } = setup();
        const write = jest.fn(async () => undefined);
        dependencies.installed.mockReturnValue([{ id: "ui" }, { id: "ui" }]);
        await expect(coordinator.install(sender, "ui", "registry", write)).rejects.toThrow("ambiguous");
        for (const input of ["../tool", "file:./tool", "https://example.test/tool.tgz", "alias@npm:other", "--ignore-scripts"]) {
            await expect(coordinator.install(sender, input, "npm", write)).rejects.toThrow("named npm package");
        }
        expect(write).not.toHaveBeenCalled();
    });
});
