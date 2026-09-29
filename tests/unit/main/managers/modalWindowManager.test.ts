/// <reference types="jest" />

import { BrowserWindow } from "electron";
import { ModalWindowManager } from "../../../../src/main/managers/modalWindowManager";

// electron is replaced by the manual mock in tests/__mocks__/

type MockWindow = InstanceType<typeof BrowserWindow> & {
    on: jest.Mock;
    isVisible: jest.Mock;
    moveTop: jest.Mock;
    focus: jest.Mock;
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
});
