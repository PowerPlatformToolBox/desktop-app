import { logError } from "../../common/logger";
import type { ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { normalizeReviewVersion, TOOL_REVIEW_NOT_INSTALLED_MESSAGE, TOOL_REVIEW_VERSION_MAX_LENGTH } from "../../common/utils/toolReview";
import { getRateToolModalControllerScript } from "../modals/rateTool/controller";
import { getRateToolModalView } from "../modals/rateTool/view";
import { buildToolIssuesListUrl } from "../utils/repositoryUrl";
import { getToolReviewUnavailableMessage, resolveToolReviewAccess, type ToolReviewAccess } from "../utils/toolReviewAccess";
import { closeBrowserWindowModal, onBrowserWindowModalClosed, onBrowserWindowModalMessage, sendBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

export interface RateToolModalTool {
    id: string;
    name: string;
    /** Fallback repository (e.g. from the catalog) used for the issues link when installed metadata has none. */
    repository?: string;
}

export interface RateToolResult {
    rating?: number;
    ratingCount?: number;
}

const RATE_TOOL_MODAL_ID = "rate-tool-modal";
const RATE_TOOL_MODAL_CHANNELS = {
    submit: "rate-tool:submit",
    context: "rate-tool:context",
    openIssues: "rate-tool:open-issues",
} as const;
const RATE_TOOL_MODAL_DIMENSIONS = { width: 440, height: 500 };
const INSTALL_STATE_POLL_MS = 3000;

let resolveOpenModal: ((result: RateToolResult | null) => void) | null = null;
let openModalPromise: Promise<RateToolResult | null> | null = null;
let bridgeInitialized = false;
let currentTool: RateToolModalTool | null = null;
let currentIssuesUrl: string | null = null;
let submitting = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let lastPushedState = "";

async function notify(title: string, body: string, type: "success" | "error" | "warning"): Promise<void> {
    try {
        await window.toolboxAPI.utils.showNotification({ title, body, type });
    } catch (error) {
        logError("Failed to show rating notification", error);
    }
}

/**
 * Open the "Rate this tool" modal. Resolves with the recomputed aggregate rating on
 * successful submission, or null if the user cancels or the tool cannot be reviewed.
 * Installation is re-verified here so every entry point is guarded, not only the visible buttons.
 */
export function openRateToolModal(tool: RateToolModalTool): Promise<RateToolResult | null> {
    if (openModalPromise) return openModalPromise;

    const promise = (async (): Promise<RateToolResult | null> => {
        const access = await resolveToolReviewAccess(tool.id);
        if (access.status !== "eligible") {
            await notify("Review unavailable", getToolReviewUnavailableMessage(access) ?? TOOL_REVIEW_NOT_INSTALLED_MESSAGE, access.status === "unknown" ? "error" : "warning");
            return null;
        }

        let existing: { rating?: number; comment?: string } | null = null;
        try {
            existing = await window.toolboxAPI.getMyToolRating(tool.id);
        } catch (error) {
            logError("Failed to load existing tool rating", error);
        }

        return new Promise<RateToolResult | null>((resolve) => {
            resolveOpenModal = resolve;
            currentTool = tool;
            currentIssuesUrl = buildToolIssuesListUrl(access.context.repository) ?? buildToolIssuesListUrl(tool.repository);
            submitting = false;
            lastPushedState = pushStateKey(access);
            initializeBridge();

            const isDarkTheme = document.body.classList.contains("dark-theme");
            const installedVersion = normalizeReviewVersion(access.context.version) ?? "";
            const { styles, body } = getRateToolModalView({
                toolName: tool.name,
                isDarkTheme,
                existingRating: existing?.rating,
                existingComment: existing?.comment,
                installedVersion,
                hasIssuesLink: !!currentIssuesUrl,
            });
            const script = getRateToolModalControllerScript({
                channels: RATE_TOOL_MODAL_CHANNELS,
                toolId: tool.id,
                installedVersion,
                versionMaxLength: TOOL_REVIEW_VERSION_MAX_LENGTH,
                notInstalledMessage: TOOL_REVIEW_NOT_INSTALLED_MESSAGE,
            });

            showBrowserWindowModal({
                id: RATE_TOOL_MODAL_ID,
                html: `${styles}\n${body}\n${script}`,
                width: RATE_TOOL_MODAL_DIMENSIONS.width,
                height: RATE_TOOL_MODAL_DIMENSIONS.height,
            })
                .then(startPolling)
                .catch((error) => {
                    logError("Failed to open Rate Tool modal", error);
                    settleAndClose(null);
                });
        });
    })();
    openModalPromise = promise.finally(() => {
        openModalPromise = null;
    });
    return openModalPromise;
}

function pushStateKey(access: ToolReviewAccess): string {
    return access.status === "eligible" ? `installed:${access.context.version ?? ""}` : access.status;
}

async function pushContext(access: ToolReviewAccess): Promise<void> {
    if (access.status === "unknown") return;
    const key = pushStateKey(access);
    if (key === lastPushedState) return;
    lastPushedState = key;
    await sendBrowserWindowModalMessage({
        channel: RATE_TOOL_MODAL_CHANNELS.context,
        data: access.status === "eligible" ? { installed: true, version: access.context.version ?? "" } : { installed: false },
    });
}

function startPolling(): void {
    stopPolling();
    pollTimer = setInterval(() => {
        const tool = currentTool;
        if (!tool || submitting) return;
        void resolveToolReviewAccess(tool.id).then((access) => (currentTool?.id === tool.id ? pushContext(access) : undefined));
    }, INSTALL_STATE_POLL_MS);
}

function stopPolling(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
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

function sendSubmitError(message: string): Promise<void> {
    return sendBrowserWindowModalMessage({ channel: `${RATE_TOOL_MODAL_CHANNELS.submit}:error`, data: { error: message } }).then(() => undefined);
}

function handleModalMessage(payload: ModalWindowMessagePayload): void {
    if (!payload || typeof payload !== "object" || !resolveOpenModal || !currentTool) {
        return;
    }

    if (payload.channel === RATE_TOOL_MODAL_CHANNELS.openIssues) {
        if (currentIssuesUrl) {
            window.toolboxAPI.openExternal(currentIssuesUrl).catch((error) => logError("Failed to open tool issues page", error));
        }
        return;
    }

    if (payload.channel !== RATE_TOOL_MODAL_CHANNELS.submit) {
        return;
    }

    interface SubmitData {
        toolId?: string;
        rating?: number;
        comment?: string;
        toolVersion?: string;
    }
    const data = (payload.data ?? {}) as SubmitData;
    // Only the tool this dialog was opened for can be submitted.
    if (data.toolId !== currentTool.id || typeof data.rating !== "number" || submitting) {
        return;
    }

    void submitReview(currentTool.id, data.rating, data.comment, data.toolVersion);
}

async function submitReview(toolId: string, rating: number, comment: string | undefined, toolVersion: string | undefined): Promise<void> {
    submitting = true;
    try {
        const version = normalizeReviewVersion(toolVersion);
        if (!version) {
            await sendSubmitError(`Enter the version of the tool you are reviewing (1-${TOOL_REVIEW_VERSION_MAX_LENGTH} characters).`);
            return;
        }

        // Recheck installation and installed version immediately before submitting.
        const access = await resolveToolReviewAccess(toolId);
        if (access.status !== "eligible") {
            lastPushedState = "";
            await pushContext(access.status === "unknown" ? { status: "not-installed" } : access);
            await sendSubmitError(getToolReviewUnavailableMessage(access) ?? TOOL_REVIEW_NOT_INSTALLED_MESSAGE);
            return;
        }
        const installedVersion = normalizeReviewVersion(access.context.version);
        if (installedVersion && installedVersion !== version) {
            lastPushedState = "";
            await pushContext(access);
            await sendSubmitError(`The installed version changed to ${installedVersion}. Please confirm the new version before submitting.`);
            return;
        }

        const aggregate = await window.toolboxAPI.submitToolRating(toolId, rating, comment, version);
        void notify("Review submitted", "Thanks for sharing your experience.", "success");
        settleAndClose(aggregate);
    } catch (error) {
        logError("Failed to submit tool rating", error);
        await sendSubmitError(error instanceof Error ? error.message : "Failed to submit rating.");
    } finally {
        submitting = false;
    }
}

function settleAndClose(result: RateToolResult | null): void {
    void closeBrowserWindowModal();
    settle(result);
}

function settle(result: RateToolResult | null): void {
    stopPolling();
    currentTool = null;
    currentIssuesUrl = null;
    const resolve = resolveOpenModal;
    resolveOpenModal = null;
    resolve?.(result);
}
