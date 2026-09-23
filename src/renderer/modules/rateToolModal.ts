import { logError } from "../../common/logger";
import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getRateToolModalControllerScript } from "../modals/rateTool/controller";
import { getRateToolModalView } from "../modals/rateTool/view";
import { closeBrowserWindowModal, onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

export interface RateToolModalTool {
    id: string;
    name: string;
}

export interface RateToolResult {
    rating?: number;
    ratingCount?: number;
}

const RATE_TOOL_MODAL_ID = "rate-tool-modal";
const RATE_TOOL_MODAL_CHANNELS = {
    submit: "rate-tool:submit",
} as const;
const RATE_TOOL_MODAL_DIMENSIONS = { width: 420, height: 400 };

let resolveOpenModal: ((result: RateToolResult | null) => void) | null = null;
let bridgeInitialized = false;

/**
 * Open the "Rate this tool" modal. Resolves with the recomputed aggregate rating on
 * successful submission, or null if the user cancels.
 */
export async function openRateToolModal(tool: RateToolModalTool): Promise<RateToolResult | null> {
    const existing = await window.toolboxAPI.getMyToolRating(tool.id);

    return new Promise<RateToolResult | null>((resolve) => {
        resolveOpenModal = resolve;
        initializeBridge();

        const isDarkTheme = document.body.classList.contains("dark-theme");
        const { styles, body } = getRateToolModalView({
            toolName: tool.name,
            isDarkTheme,
            existingRating: existing?.rating,
            existingComment: existing?.comment,
        });
        const script = getRateToolModalControllerScript({ channels: RATE_TOOL_MODAL_CHANNELS, toolId: tool.id });

        showBrowserWindowModal({
            id: RATE_TOOL_MODAL_ID,
            html: `${styles}\n${body}\n${script}`,
            width: RATE_TOOL_MODAL_DIMENSIONS.width,
            height: RATE_TOOL_MODAL_DIMENSIONS.height,
        }).catch((error) => {
            logError("Failed to open Rate Tool modal", error);
            settleAndClose(null);
        });
    });
}

function initializeBridge(): void {
    if (bridgeInitialized) return;
    onBrowserWindowModalMessage(handleModalMessage);
    onBrowserWindowModalClosed(handleModalClosed);
    bridgeInitialized = true;
}

function handleModalClosed(payload: ModalWindowClosedPayload): void {
    if (payload?.id !== RATE_TOOL_MODAL_ID || !resolveOpenModal) return;
    settle(null);
}

function handleModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || payload.channel !== RATE_TOOL_MODAL_CHANNELS.submit || !resolveOpenModal) {
        return;
    }

    interface SubmitData {
        toolId?: string;
        rating?: number;
        comment?: string;
    }
    const data = (payload.data ?? {}) as SubmitData;
    if (typeof data.toolId !== "string" || typeof data.rating !== "number") {
        return;
    }

    window.toolboxAPI
        .submitToolRating(data.toolId, data.rating, data.comment)
        .then((aggregate) => {
            settleAndClose(aggregate);
        })
        .catch((error) => {
            logError("Failed to submit tool rating", error);
            void sendBrowserWindowModalMessage({
                channel: `${RATE_TOOL_MODAL_CHANNELS.submit}:error`,
                data: { error: error instanceof Error ? error.message : "Failed to submit rating." },
            });
        });
}

function settleAndClose(result: RateToolResult | null): void {
    void closeBrowserWindowModal();
    settle(result);
}

function settle(result: RateToolResult | null): void {
    const resolve = resolveOpenModal;
    resolveOpenModal = null;
    resolve?.(result);
}
