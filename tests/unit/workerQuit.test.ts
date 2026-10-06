/// <reference types="jest" />
import { WorkerQuitCoordinator } from "../../src/main/utilities/workerQuit";

describe("WorkerQuitCoordinator", () => {
    const tick = async () => {
        for (let index = 0; index < 10; index++) await Promise.resolve();
    };
    const setup = () => {
        const dependencies = {
            confirm: jest.fn(() => true),
            stopWorkers: jest.fn(async (): Promise<void> => undefined),
            cleanup: jest.fn(async (): Promise<void> => undefined),
            quit: jest.fn(),
            cancelled: jest.fn(),
            failed: jest.fn(),
        };
        return { dependencies, coordinator: new WorkerQuitCoordinator(dependencies), event: { preventDefault: jest.fn() } };
    };

    it("canceled quit preserves workers and every other subsystem", async () => {
        const { dependencies, coordinator, event } = setup();
        dependencies.confirm.mockReturnValue(false);
        coordinator.handle(event);
        await tick();
        expect(event.preventDefault).toHaveBeenCalled();
        expect(dependencies.stopWorkers).not.toHaveBeenCalled();
        expect(dependencies.cleanup).not.toHaveBeenCalled();
        expect(dependencies.quit).not.toHaveBeenCalled();
    });

    it("delays cleanup and quit until workers stop and guards reentrant requests", async () => {
        const { dependencies, coordinator, event } = setup();
        let stopped!: () => void;
        dependencies.stopWorkers.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    stopped = resolve;
                }),
        );
        coordinator.handle(event);
        coordinator.handle(event);
        await tick();
        expect(dependencies.confirm).toHaveBeenCalledTimes(1);
        expect(dependencies.stopWorkers).toHaveBeenCalledTimes(1);
        expect(dependencies.cleanup).not.toHaveBeenCalled();
        stopped();
        await tick();
        expect(dependencies.cleanup).toHaveBeenCalledTimes(1);
        expect(dependencies.quit).toHaveBeenCalledTimes(1);
        event.preventDefault.mockClear();
        coordinator.handle(event);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it("failed stop commits no unrelated cleanup and requires fresh confirmation on retry", async () => {
        const { dependencies, coordinator, event } = setup();
        dependencies.stopWorkers.mockRejectedValueOnce(new Error("active process"));
        coordinator.handle(event);
        await tick();
        expect(dependencies.cleanup).not.toHaveBeenCalled();
        expect(dependencies.failed).toHaveBeenCalledTimes(1);
        dependencies.confirm.mockReturnValue(false);
        coordinator.handle(event);
        await tick();
        expect(dependencies.confirm).toHaveBeenCalledTimes(2);
        expect(dependencies.stopWorkers).toHaveBeenCalledTimes(1);
    });

    it.each(["relaunch", "quitAndInstall"])("runs %s only after confirmation, worker stop and cleanup", async () => {
        const { dependencies, coordinator, event } = setup();
        const calls: string[] = [];
        let stopped!: () => void;
        dependencies.confirm.mockImplementation(() => {
            calls.push("confirm");
            return true;
        });
        dependencies.stopWorkers.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    calls.push("stop");
                    stopped = resolve;
                }),
        );
        dependencies.cleanup.mockImplementation(async () => {
            calls.push("cleanup");
        });
        const action = jest.fn(() => {
            calls.push("action");
            coordinator.handle(event);
        });
        coordinator.request(action);
        coordinator.request(action);
        expect(calls).toEqual(["confirm", "stop"]);
        expect(action).not.toHaveBeenCalled();
        stopped();
        await tick();
        expect(calls).toEqual(["confirm", "stop", "cleanup", "action"]);
        expect(action).toHaveBeenCalledTimes(1);
        expect(dependencies.cancelled).not.toHaveBeenCalled();
    });

    it.each(["relaunch", "quitAndInstall"])("declined %s never queues its side effect on a later ordinary quit", async () => {
        const { dependencies, coordinator, event } = setup();
        const action = jest.fn();
        dependencies.confirm.mockReturnValueOnce(false);
        coordinator.request(action);
        await tick();
        expect(action).not.toHaveBeenCalled();
        expect(dependencies.stopWorkers).not.toHaveBeenCalled();
        coordinator.handle(event);
        await tick();
        expect(action).not.toHaveBeenCalled();
        expect(dependencies.quit).toHaveBeenCalledTimes(1);
    });

    it("cancels restart on failed worker stop and restores fresh confirmation", async () => {
        const { dependencies, coordinator, event } = setup();
        const action = jest.fn();
        dependencies.stopWorkers.mockRejectedValueOnce(new Error("still alive"));
        coordinator.request(action);
        await tick();
        expect(action).not.toHaveBeenCalled();
        expect(dependencies.cancelled).toHaveBeenCalledTimes(1);
        coordinator.handle(event);
        await tick();
        expect(dependencies.confirm).toHaveBeenCalledTimes(2);
        expect(action).not.toHaveBeenCalled();
        expect(dependencies.quit).toHaveBeenCalledTimes(1);
    });

    it.each([false, true])("cleanup failure after committed stop still completes shutdown (action=%s)", async (withAction) => {
        const { dependencies, coordinator, event } = setup();
        const error = new Error("cleanup failed");
        dependencies.cleanup.mockRejectedValueOnce(error);
        const action = jest.fn();
        if (withAction) coordinator.request(action);
        else coordinator.handle(event);
        await tick();
        expect(dependencies.failed).toHaveBeenCalledWith(error);
        expect(dependencies.cancelled).not.toHaveBeenCalled();
        expect(withAction ? action : dependencies.quit).toHaveBeenCalledTimes(1);
        event.preventDefault.mockClear();
        coordinator.handle(event);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it("falls back to committed quit when a shutdown action throws", async () => {
        const { dependencies, coordinator } = setup();
        coordinator.request(() => {
            throw new Error("updater failed");
        });
        await tick();
        expect(dependencies.quit).toHaveBeenCalledTimes(1);
        expect(dependencies.failed).toHaveBeenCalledTimes(1);
        expect(dependencies.cancelled).not.toHaveBeenCalled();
    });

    it("continues blocking before-quit while committed cleanup is still pending", async () => {
        const { dependencies, coordinator, event } = setup();
        let finishCleanup!: () => void;
        dependencies.cleanup.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    finishCleanup = resolve;
                }),
        );
        coordinator.handle(event);
        await tick();
        event.preventDefault.mockClear();
        coordinator.handle(event);
        expect(event.preventDefault).toHaveBeenCalledTimes(1);
        expect(dependencies.quit).not.toHaveBeenCalled();
        expect(dependencies.confirm).toHaveBeenCalledTimes(1);
        finishCleanup();
        await tick();
        expect(dependencies.quit).toHaveBeenCalledTimes(1);
        event.preventDefault.mockClear();
        coordinator.handle(event);
        expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it.each(["restart", "installUpdate"] as const)("%s helper defers its real side effect until shutdown and quits after a no-op action", async (method) => {
        const { dependencies, coordinator } = setup();
        let stopped!: () => void;
        dependencies.stopWorkers.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    stopped = resolve;
                }),
        );
        const calls: string[] = [];
        dependencies.cleanup.mockImplementation(async () => {
            calls.push("cleanup");
        });
        dependencies.quit.mockImplementation(() => {
            calls.push("quit");
        });
        const sideEffect = jest.fn(() => {
            calls.push(method);
        });
        coordinator[method](sideEffect);
        expect(sideEffect).not.toHaveBeenCalled();
        stopped();
        await tick();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(calls).toEqual(["cleanup", method, "quit"]);
    });

    it.each(["restart", "installUpdate"] as const)("%s helper performs neither side effect nor fallback quit when declined", async (method) => {
        const { dependencies, coordinator } = setup();
        dependencies.confirm.mockReturnValue(false);
        const sideEffect = jest.fn();
        coordinator[method](sideEffect);
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(sideEffect).not.toHaveBeenCalled();
        expect(dependencies.quit).not.toHaveBeenCalled();
        expect(dependencies.stopWorkers).not.toHaveBeenCalled();
    });

    it("lets updater schedule installation before fallback quit", async () => {
        const { dependencies, coordinator } = setup();
        const calls: string[] = [];
        dependencies.quit.mockImplementation(() => {
            calls.push("quit");
        });
        coordinator.installUpdate(() => {
            setImmediate(() => {
                calls.push("install");
            });
        });
        await tick();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(calls).toEqual(["install", "quit"]);
    });
});
