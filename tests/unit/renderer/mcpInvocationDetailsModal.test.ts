/// <reference types="jest" />

import {
    initializeMcpInvocationDetailsModalController,
    isMcpInvocationDetailsModalOpen,
    MCP_INVOCATION_MODAL_CLOSE_ID,
    MCP_INVOCATION_MODAL_ID,
    showMcpInvocationDetailsModal,
} from "../../../src/renderer/modals/mcpInvocationDetails/controller";

class ModalElement extends EventTarget {
    dataset: Record<string, string> = {};
    private classes = new Set<string>();
    classList = {
        add: (value: string) => this.classes.add(value),
        remove: (value: string) => this.classes.delete(value),
        contains: (value: string) => this.classes.has(value),
    };
}

describe("MCP invocation details modal", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    let elements: Map<string, ModalElement>;

    function renderModal(): { modal: ModalElement; closeButton: ModalElement } {
        const modal = new ModalElement();
        const closeButton = new ModalElement();
        elements.set(MCP_INVOCATION_MODAL_ID, modal);
        elements.set(MCP_INVOCATION_MODAL_CLOSE_ID, closeButton);
        return { modal, closeButton };
    }

    beforeEach(() => {
        elements = new Map();
        Object.defineProperty(globalThis, "document", {
            configurable: true,
            value: { getElementById: (id: string) => elements.get(id) ?? null },
        });
    });

    afterEach(() => {
        if (originalDocument) {
            Object.defineProperty(globalThis, "document", originalDocument);
        } else {
            Reflect.deleteProperty(globalThis, "document");
        }
    });

    it("closes with the Close button after the MCP tab recreates the modal", () => {
        const first = renderModal();
        const firstOnClose = jest.fn();
        initializeMcpInvocationDetailsModalController(firstOnClose);
        showMcpInvocationDetailsModal();
        first.closeButton.dispatchEvent(new Event("click"));
        expect(isMcpInvocationDetailsModalOpen()).toBe(false);
        expect(firstOnClose).toHaveBeenCalledTimes(1);

        const reopened = renderModal();
        const onClose = jest.fn();
        initializeMcpInvocationDetailsModalController(onClose);
        showMcpInvocationDetailsModal();
        expect(isMcpInvocationDetailsModalOpen()).toBe(true);

        reopened.closeButton.dispatchEvent(new Event("click"));
        expect(isMcpInvocationDetailsModalOpen()).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(firstOnClose).toHaveBeenCalledTimes(1);
    });

    it("closes on a backdrop click after recreating the modal", () => {
        renderModal();
        initializeMcpInvocationDetailsModalController(jest.fn());
        const { modal } = renderModal();
        const onClose = jest.fn();
        initializeMcpInvocationDetailsModalController(onClose);
        showMcpInvocationDetailsModal();

        modal.dispatchEvent(new Event("click"));
        expect(isMcpInvocationDetailsModalOpen()).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("does not duplicate handlers when initialized again on the same modal", () => {
        const { closeButton } = renderModal();
        const oldOnClose = jest.fn();
        const onClose = jest.fn();
        initializeMcpInvocationDetailsModalController(oldOnClose);
        initializeMcpInvocationDetailsModalController(onClose);
        showMcpInvocationDetailsModal();

        closeButton.dispatchEvent(new Event("click"));
        expect(isMcpInvocationDetailsModalOpen()).toBe(false);
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(oldOnClose).not.toHaveBeenCalled();
    });
});
