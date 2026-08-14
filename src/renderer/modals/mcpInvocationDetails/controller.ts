import { closeModal, openModal } from "../../modules/modalManagement";

export const MCP_INVOCATION_MODAL_ID = "mcp-invocation-modal";
export const MCP_INVOCATION_MODAL_CLOSE_ID = "mcp-invocation-modal-close";
export const MCP_INVOCATION_MODAL_CONTENT_ID = "mcp-invocation-modal-content";

let controllerBound = false;
let closeHandler: (() => void) | null = null;

export function initializeMcpInvocationDetailsModalController(onClose: () => void): void {
    closeHandler = onClose;
    if (controllerBound) {
        return;
    }

    const modal = document.getElementById(MCP_INVOCATION_MODAL_ID) as HTMLDivElement | null;
    const closeButton = document.getElementById(MCP_INVOCATION_MODAL_CLOSE_ID) as HTMLButtonElement | null;

    if (!modal || !closeButton) {
        return;
    }

    closeButton.addEventListener("click", () => {
        hideMcpInvocationDetailsModal();
    });

    modal.addEventListener("click", (event) => {
        if (event.target === modal) {
            hideMcpInvocationDetailsModal();
        }
    });

    controllerBound = true;
}

export function showMcpInvocationDetailsModal(): void {
    openModal(MCP_INVOCATION_MODAL_ID);
}

export function hideMcpInvocationDetailsModal(): void {
    closeModal(MCP_INVOCATION_MODAL_ID);
    closeHandler?.();
}

export function isMcpInvocationDetailsModalOpen(): boolean {
    const modal = document.getElementById(MCP_INVOCATION_MODAL_ID);
    return Boolean(modal?.classList.contains("active"));
}

export function setMcpInvocationDetailsModalContent(contentHtml: string): void {
    const content = document.getElementById(MCP_INVOCATION_MODAL_CONTENT_ID);
    if (!content) {
        return;
    }

    const scrollTop = content.scrollTop;
    const scrollLeft = content.scrollLeft;
    content.innerHTML = contentHtml;

    window.requestAnimationFrame(() => {
        content.scrollTop = scrollTop;
        content.scrollLeft = scrollLeft;
    });
}
