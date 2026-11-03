import { BrowserWindow } from "electron";
import { ConnectionProviderPromptManager } from "../../../../src/main/managers/connectionProviderPromptManager";
import type { SettingsManager } from "../../../../src/main/managers/settingsManager";
import type { ProviderPromptRequest } from "../../../../src/common/types";

type MockWindow = InstanceType<typeof BrowserWindow> & {
    webContents: InstanceType<typeof BrowserWindow>["webContents"] & { on: jest.Mock };
};

// The manual electron mock (tests/__mocks__/electron.ts) tracks every `new BrowserWindow()` call
// via a static registry so tests can inspect dynamically created windows, e.g. the prompt window.
const BrowserWindowMock = BrowserWindow as unknown as { instances: MockWindow[]; resetInstances(): void };

function fakeSettingsManager(theme: "light" | "dark" | "system" = "light"): SettingsManager {
    return { getSetting: () => theme } as unknown as SettingsManager;
}

/** Finds the `will-navigate` listener registered on the most recently created mock window's webContents. */
function getWillNavigateHandler(window: MockWindow): (event: { preventDefault: jest.Mock }, url: string) => void {
    const call = window.webContents.on.mock.calls.find(([event]) => event === "will-navigate");
    if (!call) throw new Error("will-navigate listener was not registered");
    return call[1];
}

describe("ConnectionProviderPromptManager", () => {
    let parentWindow: MockWindow;
    let manager: ConnectionProviderPromptManager;

    beforeEach(() => {
        BrowserWindowMock.resetInstances();
        parentWindow = new BrowserWindow() as MockWindow;
        manager = new ConnectionProviderPromptManager(() => parentWindow, fakeSettingsManager());
    });

    function latestPromptWindow(): MockWindow {
        const instances = BrowserWindowMock.instances;
        return instances[instances.length - 1];
    }

    function submit(window: MockWindow, payload: unknown): void {
        const handler = getWillNavigateHandler(window);
        const event = { preventDefault: jest.fn() };
        handler(event, `pptb-provider-prompt://submit/${encodeURIComponent(JSON.stringify(payload))}`);
    }

    function cancel(window: MockWindow): void {
        const handler = getWillNavigateHandler(window);
        const event = { preventDefault: jest.fn() };
        handler(event, "pptb-provider-prompt://cancel/");
    }

    it("resolves with values keyed by field id", async () => {
        const request: ProviderPromptRequest = {
            title: "Why?",
            fields: [{ id: "justification", type: "multiline", required: true }],
        };

        const resultPromise = manager.prompt("Data8", request);
        const window = latestPromptWindow();
        submit(window, { justification: "Investigating ticket #123" });

        await expect(resultPromise).resolves.toEqual({ justification: "Investigating ticket #123" });
    });

    it("resolves with null when the user cancels", async () => {
        const resultPromise = manager.prompt("Data8", { title: "Why?", fields: [{ id: "justification", type: "text" }] });
        cancel(latestPromptWindow());

        await expect(resultPromise).resolves.toBeNull();
    });

    it("ignores a submission missing a required field instead of resolving", async () => {
        const resultPromise = manager.prompt("Data8", { title: "Why?", fields: [{ id: "justification", type: "text", required: true }] });
        const window = latestPromptWindow();

        submit(window, { justification: "" });
        cancel(window);

        await expect(resultPromise).resolves.toBeNull();
    });

    it("rejects a select value that was not one of the offered options", async () => {
        const request: ProviderPromptRequest = {
            title: "Pick one",
            fields: [
                {
                    id: "reason",
                    type: "select",
                    options: [
                        { value: "a", label: "A" },
                        { value: "b", label: "B" },
                    ],
                },
            ],
        };
        const resultPromise = manager.prompt("Data8", request);
        const window = latestPromptWindow();

        submit(window, { reason: "tampered-value" });
        cancel(window);

        await expect(resultPromise).resolves.toBeNull();
    });

    it("returns boolean values for checkbox fields", async () => {
        const resultPromise = manager.prompt("Data8", { title: "Confirm", fields: [{ id: "confirmed", type: "checkbox" }] });
        const window = latestPromptWindow();

        submit(window, { confirmed: true });

        await expect(resultPromise).resolves.toEqual({ confirmed: true });
    });

    it("ignores values for fields the provider did not declare", async () => {
        const resultPromise = manager.prompt("Data8", { title: "Why?", fields: [{ id: "justification", type: "text" }] });
        const window = latestPromptWindow();

        submit(window, { justification: "ok", extra: "should not leak through" });

        await expect(resultPromise).resolves.toEqual({ justification: "ok" });
    });

    it("resolves null immediately for a request with no fields", async () => {
        await expect(manager.prompt("Data8", { title: "Empty", fields: [] })).resolves.toBeNull();
    });

    it("de-duplicates field ids rather than letting one overwrite another in the result", async () => {
        const request: ProviderPromptRequest = {
            title: "Dup",
            fields: [
                { id: "same", type: "text" },
                { id: "same", type: "text" },
            ],
        };
        const resultPromise = manager.prompt("Data8", request);
        const window = latestPromptWindow();

        submit(window, { same: "first", "same-1": "second" });

        await expect(resultPromise).resolves.toEqual({ same: "first", "same-1": "second" });
    });

    it("shows prompts one at a time, in order", async () => {
        const windowsBefore = BrowserWindowMock.instances.length;
        const first = manager.prompt("Data8", { title: "First", fields: [{ id: "a", type: "text" }] });
        const second = manager.prompt("Data8", { title: "Second", fields: [{ id: "b", type: "text" }] });

        // Only the first prompt's window is created; the second stays queued until it resolves.
        expect(BrowserWindowMock.instances.length).toBe(windowsBefore + 1);

        submit(latestPromptWindow(), { a: "1" });
        await first;

        expect(BrowserWindowMock.instances.length).toBe(windowsBefore + 2);
        submit(latestPromptWindow(), { b: "2" });
        await expect(second).resolves.toEqual({ b: "2" });
    });

    it("resolves all queued and the active prompt with null on dispose", async () => {
        const first = manager.prompt("Data8", { title: "First", fields: [{ id: "a", type: "text" }] });
        const second = manager.prompt("Data8", { title: "Second", fields: [{ id: "b", type: "text" }] });

        manager.dispose();

        await expect(first).resolves.toBeNull();
        await expect(second).resolves.toBeNull();
    });
});
