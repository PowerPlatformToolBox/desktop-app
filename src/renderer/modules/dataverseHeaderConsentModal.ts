import type { DataverseHeaderConsentDecision, DataverseHeaderConsentRequest, ModalWindowClosedPayload, ModalWindowMessagePayload } from "../../common/types";
import { getModalStyles } from "../modals/sharedStyles";
import { closeBrowserWindowModal, onBrowserWindowModalClosed, onBrowserWindowModalMessage, showBrowserWindowModal } from "./browserWindowModals";

const MODAL_ID = "dataverse-header-consent-browser-modal";
const DECISION_CHANNEL = "dataverse-header-consent:decision";

let activeRequest: DataverseHeaderConsentRequest | null = null;
let initialized = false;

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function buildModalHtml(request: DataverseHeaderConsentRequest): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const headerRows = request.headers
        .map(
            (header) => `
                <li class="header-row">
                    ${header.scope ? `<span class="header-scope">${escapeHtml(header.scope)}</span>` : ""}
                    <code class="header-name">${escapeHtml(header.name)}</code>
                    <code class="header-value">${escapeHtml(header.value)}</code>
                </li>`,
        )
        .join("");

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dataverse header permission</title>
    ${getModalStyles(isDarkTheme)}
    <style>
        .modal-panel { gap: 12px; }
        .request-summary { margin: 0; font-size: 13px; line-height: 1.5; color: ${isDarkTheme ? "rgba(255,255,255,.72)" : "rgba(0,0,0,.68)"}; }
        .scope-warning { padding: 12px; border-left: 3px solid #d83b01; background: ${isDarkTheme ? "rgba(216,59,1,.14)" : "rgba(216,59,1,.08)"}; font-size: 12px; line-height: 1.5; }
        .header-list { display: flex; flex-direction: column; gap: 8px; margin: 0; padding: 0; list-style: none; }
        .header-row { display: grid; grid-template-columns: minmax(130px, .35fr) minmax(0, .65fr); gap: 6px 12px; padding: 10px 12px; border: 1px solid ${isDarkTheme ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)"}; border-radius: 6px; }
        .header-scope { grid-column: 1 / -1; color: ${isDarkTheme ? "rgba(255,255,255,.62)" : "rgba(0,0,0,.62)"}; font-size: 11px; }
        .header-name, .header-value { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
        .header-name { color: ${isDarkTheme ? "#75b6e7" : "#005a9e"}; }
        .header-value { color: inherit; }
        .modal-footer { flex-wrap: nowrap; }
        .consent-footer-note { margin: 0 auto 0 0; color: ${isDarkTheme ? "rgba(255,255,255,.62)" : "rgba(0,0,0,.62)"}; font-size: 12px; line-height: 1.4; }
        @media (max-width: 520px) { .header-row { grid-template-columns: 1fr; } .modal-footer { flex-wrap: wrap; } }
    </style>
</head>
<body>
    <main class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <header class="modal-header">
            <div>
                <p class="modal-eyebrow">Dataverse permission request</p>
                <h3 id="consent-title">Allow additional request headers?</h3>
            </div>
            <button class="icon-button" type="button" data-decision="reject" aria-label="Reject and close">&times;</button>
        </header>
        <p class="request-summary"><strong>${escapeHtml(request.toolName)}</strong> wants to ${escapeHtml(request.operation.toLowerCase())} using the headers below.</p>
        <div class="scope-warning">
            <strong>Allow always</strong> also permits different Dataverse header names and values in future requests until you revoke access in Consent Review.
        </div>
        <section class="modal-body" aria-label="Requested headers">
            <ul class="header-list">${headerRows}</ul>
        </section>
        <footer class="modal-footer">
            <p class="consent-footer-note">This consent applies only to this tool.</p>
            <button class="fluent-button fluent-button-secondary" type="button" data-decision="reject">Reject</button>
            <button id="allow-once-button" class="fluent-button fluent-button-secondary" type="button" data-decision="allow-once">Allow once</button>
            <button class="fluent-button fluent-button-primary" type="button" data-decision="allow-tool">Allow always</button>
        </footer>
    </main>
    <script>
        const sendDecision = (decision) => window.modalBridge.send("${DECISION_CHANNEL}", { decision });
        document.querySelectorAll("[data-decision]").forEach((button) => button.addEventListener("click", () => sendDecision(button.dataset.decision)));
        document.addEventListener("keydown", (event) => { if (event.key === "Escape") sendDecision("reject"); });
        document.getElementById("allow-once-button")?.focus();
    </script>
</body>
</html>`;
}

async function respond(decision: DataverseHeaderConsentDecision): Promise<void> {
    const request = activeRequest;
    if (!request) return;
    activeRequest = null;
    try {
        await closeBrowserWindowModal();
    } finally {
        await window.toolboxAPI.respondToDataverseHeaderConsent(request.requestId, decision);
    }
}

function handleModalMessage(payload: ModalWindowMessagePayload): void {
    if (payload.channel !== DECISION_CHANNEL || !payload.data || typeof payload.data !== "object") return;
    const decision = (payload.data as { decision?: unknown }).decision;
    if (decision !== "allow-tool" && decision !== "allow-once" && decision !== "reject") return;
    void respond(decision);
}

function handleModalClosed(payload: ModalWindowClosedPayload): void {
    if (payload.id !== MODAL_ID || !activeRequest) return;
    const requestId = activeRequest.requestId;
    activeRequest = null;
    void window.toolboxAPI.respondToDataverseHeaderConsent(requestId, "reject");
}

async function showRequest(request: DataverseHeaderConsentRequest): Promise<void> {
    activeRequest = request;
    try {
        await showBrowserWindowModal({ id: MODAL_ID, html: buildModalHtml(request), width: 680, height: 620 });
    } catch {
        if (activeRequest?.requestId === request.requestId) {
            activeRequest = null;
            await window.toolboxAPI.respondToDataverseHeaderConsent(request.requestId, "reject");
        }
    }
}

export function initializeDataverseHeaderConsentModal(): void {
    if (initialized) return;
    initialized = true;
    onBrowserWindowModalMessage(handleModalMessage);
    onBrowserWindowModalClosed(handleModalClosed);
    window.toolboxAPI.onDataverseHeaderConsentRequest((request) => void showRequest(request));
}
