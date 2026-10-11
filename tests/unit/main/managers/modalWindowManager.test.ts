/// <reference types="jest" />

import { BrowserWindow } from "electron";
import { addBreadcrumb, captureException, captureMessage, hasSentryTelemetryConsent, logWarn } from "../../../../src/common/sentryHelper";
import { ModalWindowManager } from "../../../../src/main/managers/modalWindowManager";

jest.mock("../../../../src/common/sentryHelper", () => ({
    addBreadcrumb: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    hasSentryTelemetryConsent: jest.fn(() => true),
    logWarn: jest.fn(),
}));

// electron is replaced by the manual mock in tests/__mocks__/

type MockWindow = InstanceType<typeof BrowserWindow> & {
    on: jest.Mock;
    isVisible: jest.Mock;
    moveTop: jest.Mock;
    focus: jest.Mock;
    loadURL: jest.Mock;
    webContents: BrowserWindow["webContents"] & { on: jest.Mock };
};

const originalPlatform = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
    Object.defineProperty(process, "platform", { value: platform });
}

function getListener(window: MockWindow, event: string): (() => void) | undefined {
    const call = window.on.mock.calls.find(([name]) => name === event);
    return call?.[1];
}

function openModal(manager: ModalWindowManager): MockWindow {
    manager.showModal({ html: "<div>Test</div>", width: 400, height: 300 });
    return (manager as unknown as { modalWindow: MockWindow }).modalWindow;
}

describe("ModalWindowManager", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.mocked(hasSentryTelemetryConsent).mockReturnValue(true);
    });
    afterEach(() => {
        setPlatform(originalPlatform);
    });

    describe("on Linux", () => {
        beforeEach(() => setPlatform("linux"));

        it("brings a visible modal back to the front when the main window gains focus", () => {
            const mainWindow = new BrowserWindow() as MockWindow;
            const manager = new ModalWindowManager(mainWindow);
            const modalWindow = openModal(manager);
            modalWindow.moveTop.mockClear();
            modalWindow.focus.mockClear();

            const onFocus = getListener(mainWindow, "focus");
            expect(onFocus).toBeDefined();
            onFocus!();

            expect(modalWindow.moveTop).toHaveBeenCalledTimes(1);
            expect(modalWindow.focus).toHaveBeenCalledTimes(1);
        });

        it("does nothing when the modal is hidden", () => {
            const mainWindow = new BrowserWindow() as MockWindow;
            const manager = new ModalWindowManager(mainWindow);
            const modalWindow = openModal(manager);
            manager.hideModal();
            modalWindow.moveTop.mockClear();
            modalWindow.focus.mockClear();

            getListener(mainWindow, "focus")!();

            expect(modalWindow.moveTop).not.toHaveBeenCalled();
            expect(modalWindow.focus).not.toHaveBeenCalled();
        });

        it("does nothing when the modal window is not visible (e.g. main window minimized)", () => {
            const mainWindow = new BrowserWindow() as MockWindow;
            const manager = new ModalWindowManager(mainWindow);
            const modalWindow = openModal(manager);
            modalWindow.isVisible.mockReturnValue(false);
            modalWindow.moveTop.mockClear();
            modalWindow.focus.mockClear();

            getListener(mainWindow, "focus")!();

            expect(modalWindow.moveTop).not.toHaveBeenCalled();
            expect(modalWindow.focus).not.toHaveBeenCalled();
        });

        it("does nothing when no modal has been opened", () => {
            const mainWindow = new BrowserWindow() as MockWindow;
            new ModalWindowManager(mainWindow);

            expect(() => getListener(mainWindow, "focus")!()).not.toThrow();
        });
    });

    it.each(["darwin", "win32"] as NodeJS.Platform[])("does not register a main window focus listener on %s", (platform) => {
        setPlatform(platform);
        const mainWindow = new BrowserWindow() as MockWindow;
        new ModalWindowManager(mainWindow);

        expect(getListener(mainWindow, "focus")).toBeUndefined();
    });

    describe("modal telemetry", () => {
        let manager: ModalWindowManager;
        let modalWindow: MockWindow;

        function emit(event: string, ...args: unknown[]): void {
            const listener = modalWindow.webContents.on.mock.calls.find(([name]) => name === event)?.[1];
            expect(listener).toBeDefined();
            listener(...args);
        }

        beforeEach(() => {
            manager = new ModalWindowManager(new BrowserWindow());
            modalWindow = openModal(manager);
        });

        it("captures scrubbed modern console errors without source URLs or modal metadata", () => {
            emit("console-message", { level: "error", message: "Failed for alice@example.com token=short-secret", sourceId: "data:text/html,private-document" });
            expect(captureMessage).toHaveBeenCalledWith("Modal renderer error: Failed for [email] token=[redacted]", "error", {
                tags: { component: "modal-window", event_type: "console-error" },
            });
            expect(JSON.stringify(jest.mocked(captureMessage).mock.calls)).not.toContain("private-document");
            expect(addBreadcrumb).toHaveBeenCalledWith("Modal renderer error: Failed for [email] token=[redacted]", "modal.console", "error");
        });

        it("logs legacy console warnings without creating Issues", () => {
            emit("console-message", {}, 2, "modalBridge API is unavailable", 9, "data:text/html,secret");
            expect(logWarn).toHaveBeenCalledWith("Modal renderer warning: modalBridge API is unavailable", { component: "modal-window", event_type: "console-warning" });
            expect(captureMessage).not.toHaveBeenCalled();
            expect(captureException).not.toHaveBeenCalled();
        });

        it.each(["info", "debug"])("ignores %s console output", (level) => {
            emit("console-message", { level, message: "token=private-info" });
            expect(captureMessage).not.toHaveBeenCalled();
            expect(logWarn).not.toHaveBeenCalled();
            expect(addBreadcrumb).not.toHaveBeenCalled();
        });

        it.each(["Template: <div>private-secret</div>", "Template: %3Cdiv%3Eprivate-secret%3C/div%3E", "data:text/html,private-document with private spaces"])(
            "redacts generated templates: %s",
            (message) => {
                emit("console-message", { level: "error", message });
                expect(captureMessage).toHaveBeenCalledWith("Modal renderer error: [modal document redacted]", "error", expect.any(Object));
            },
        );

        it("redacts data URLs and authorization values and bounds console messages", () => {
            emit("console-message", { level: "error", message: `data:application/json,private-document Bearer short-secret ${"safe text ".repeat(200)}` });
            const message = jest.mocked(captureMessage).mock.calls[0][0];
            expect(message).not.toContain("private-document");
            expect(message).not.toContain("short-secret");
            expect(message.length).toBe("Modal renderer error: ".length + 1000);
        });

        it("scrubs quoted credentials before warnings reach shared logging", () => {
            emit("console-message", { level: "warning", message: "password=\"private value\" access_token: 'short-secret' Authorization: Bearer another-secret" });
            const message = jest.mocked(logWarn).mock.calls[0][0];
            expect(message).not.toContain("private value");
            expect(message).not.toContain("short-secret");
            expect(message).not.toContain("another-secret");
        });

        it("captures unexpected renderer crashes", () => {
            emit("render-process-gone", {}, { reason: "crashed", exitCode: 139 });
            expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "Modal renderer process terminated unexpectedly" }), {
                tags: { component: "modal-window", event_type: "render-process-gone" },
                extra: { reason: "crashed", exit_code: 139 },
            });
        });

        it("ignores clean exits and teardown events", () => {
            emit("render-process-gone", {}, { reason: "clean-exit", exitCode: 0 });
            getListener(modalWindow, "close")!();
            emit("render-process-gone", {}, { reason: "killed", exitCode: 0 });
            emit("did-fail-load", {}, -2, "private-secret", "data:text/html,private-document", true);
            expect(captureException).not.toHaveBeenCalled();
        });

        it("captures a main-frame failure once without its description or URL", async () => {
            modalWindow.loadURL.mockRejectedValueOnce(Object.assign(new Error("data:text/html,private-document"), { errno: -2 }));
            openModal(manager);
            emit("did-fail-load", {}, -2, "private-secret", "data:text/html,private-document", true);
            await Promise.resolve();
            await Promise.resolve();
            expect(captureException).toHaveBeenCalledTimes(1);
            expect(captureException).toHaveBeenCalledWith(expect.objectContaining({ message: "Failed to load modal content" }), {
                tags: { component: "modal-window", event_type: "did-fail-load" },
                extra: { error_code: -2 },
            });
        });

        it("covers loadURL rejections when no failure event is emitted", async () => {
            modalWindow.loadURL.mockRejectedValueOnce(new Error("private-document"));
            openModal(manager);
            await Promise.resolve();
            await Promise.resolve();
            expect(captureException).toHaveBeenCalledTimes(1);
            expect(jest.mocked(captureException).mock.calls[0][0].message).toBe("Failed to load modal content");
        });

        it("ignores rejections from a superseded navigation", async () => {
            modalWindow.loadURL.mockRejectedValueOnce(new Error("old private-document"));
            openModal(manager);
            openModal(manager);
            await Promise.resolve();
            await Promise.resolve();
            expect(captureException).not.toHaveBeenCalled();
        });

        it("reports failures on subsequent navigations", () => {
            emit("did-fail-load", {}, -2, "ERR_FAILED", "data:text/html,secret", true);
            openModal(manager);
            emit("did-fail-load", {}, -2, "ERR_FAILED", "data:text/html,secret", true);
            expect(captureException).toHaveBeenCalledTimes(2);
        });

        it.each([{ errno: -3 }, { code: "ERR_ABORTED" }, { message: "ERR_ABORTED (-3) loading data:text/html,secret" }])("ignores aborted load rejections: %j", async (error) => {
            modalWindow.loadURL.mockRejectedValueOnce(error);
            openModal(manager);
            await Promise.resolve();
            await Promise.resolve();
            expect(captureException).not.toHaveBeenCalled();
        });

        it("ignores aborted navigations and subframe load failures", () => {
            emit("did-fail-load", {}, -3, "ERR_ABORTED", "data:text/html,secret", true);
            emit("did-fail-load", {}, -2, "ERR_FAILED", "https://example.com", false);
            expect(captureException).not.toHaveBeenCalled();
        });

        it("registers listeners only once when reusing the modal", () => {
            openModal(manager);
            for (const event of ["console-message", "render-process-gone", "did-fail-load"]) {
                expect(modalWindow.webContents.on.mock.calls.filter(([name]) => name === event)).toHaveLength(1);
            }
        });

        it("does not report without consent", () => {
            jest.mocked(hasSentryTelemetryConsent).mockReturnValue(false);
            emit("console-message", { level: "error", message: "private-secret" });
            emit("console-message", { level: "warning", message: "private-secret" });
            emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
            emit("did-fail-load", {}, -2, "ERR_FAILED", "data:text/html,secret", true);
            expect(captureMessage).not.toHaveBeenCalled();
            expect(captureException).not.toHaveBeenCalled();
            expect(logWarn).not.toHaveBeenCalled();
            expect(addBreadcrumb).not.toHaveBeenCalled();
        });

        it("ignores telemetry from a destroyed or hidden modal", () => {
            manager.destroy();
            emit("console-message", { level: "error", message: "private-secret" });
            expect(captureMessage).not.toHaveBeenCalled();
            modalWindow = openModal(manager);
            manager.hideModal();
            emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
            expect(captureException).not.toHaveBeenCalled();
        });
    });
});
