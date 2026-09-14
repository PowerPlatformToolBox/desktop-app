/// <reference types="jest" />

import { BrowserWindow } from "electron";
import { APP_CHANNELS } from "../../../../src/common/ipc/channels";
import { RendererReadyGate } from "../../../../src/main/managers/rendererReadyGate";

// electron is replaced by the manual mock at tests/__mocks__/electron.ts

interface FakeIpc {
    on: jest.Mock;
    emitReady: () => void;
}

function makeIpc(): FakeIpc {
    const listeners: Array<(event: { sender: { id: number } }) => void> = [];
    const on = jest.fn((channel: string, listener: (event: { sender: { id: number } }) => void) => {
        if (channel === APP_CHANNELS.RENDERER_READY) {
            listeners.push(listener);
        }
    });

    return {
        on,
        emitReady: () => listeners.forEach((listener) => listener({ sender: { id: 1 } })),
    };
}

describe("RendererReadyGate", () => {
    let gate: RendererReadyGate;
    let ipc: FakeIpc;
    let window: BrowserWindow;

    beforeEach(() => {
        gate = new RendererReadyGate();
        ipc = makeIpc();
        window = new BrowserWindow();
        Object.defineProperty(window.webContents, "id", { value: 1, configurable: true });
        gate.attachWindow(window as unknown as import("electron").BrowserWindow);
    });

    it("buffers tasks until the renderer signals readiness", () => {
        gate.initialize(ipc);
        const task = jest.fn();

        gate.runWhenReady(task);
        expect(gate.isReady()).toBe(false);
        expect(task).not.toHaveBeenCalled();

        ipc.emitReady();

        expect(gate.isReady()).toBe(true);
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("runs a task immediately once ready", () => {
        gate.initialize(ipc);
        ipc.emitReady();

        const task = jest.fn();
        gate.runWhenReady(task);

        expect(task).toHaveBeenCalledTimes(1);
    });

    it("flushes buffered tasks in order and only once", () => {
        gate.initialize(ipc);
        const order: string[] = [];
        gate.runWhenReady(() => {
            order.push("first");
        });
        gate.runWhenReady(() => {
            order.push("second");
        });

        ipc.emitReady();
        ipc.emitReady();

        expect(order).toEqual(["first", "second"]);
    });

    it("keeps only the newest keyed task before readiness", () => {
        gate.initialize(ipc);
        const first = jest.fn();
        const second = jest.fn();
        gate.runLatestWhenReady("debug-tool", first);
        gate.runLatestWhenReady("debug-tool", second);

        ipc.emitReady();

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
    });

    it("resets readiness on did-start-loading so a reload does not strand a later request", () => {
        gate.initialize(ipc);
        ipc.emitReady();
        expect(gate.isReady()).toBe(true);

        const webContentsOn = window.webContents.on as unknown as jest.Mock;
        const didStartLoading = webContentsOn.mock.calls.find((call: unknown[]) => call[0] === "did-start-loading");
        expect(didStartLoading).toBeDefined();
        (didStartLoading![1] as () => void)();

        expect(gate.isReady()).toBe(false);

        const task = jest.fn();
        gate.runWhenReady(task);
        expect(task).not.toHaveBeenCalled();

        ipc.emitReady();
        expect(task).toHaveBeenCalledTimes(1);
    });

    it("does not throw when a task throws", () => {
        gate.initialize(ipc);
        gate.runWhenReady(() => {
            throw new Error("boom");
        });

        expect(() => ipc.emitReady()).not.toThrow();
    });
});
