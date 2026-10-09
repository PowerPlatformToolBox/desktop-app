import type { ModalWindowClosedPayload, ModalWindowMessagePayload, NativeWorkerConsentDescriptor, NativeWorkerConsentRequest, NativeWorkerConsentUI } from "../../../common/types";
import { getModalStyles } from "../../modals/sharedStyles";
import {
    closeBrowserWindowModal,
    offBrowserWindowModalClosed,
    offBrowserWindowModalMessage,
    onBrowserWindowModalClosed,
    onBrowserWindowModalMessage,
    sendBrowserWindowModalMessage,
    showBrowserWindowModal,
} from "../browserWindowModals";

const MODAL_ID = "native-worker-consent-browser-modal";
const DECISION_CHANNEL = "native-worker-consent:decision";
const RESULT_CHANNEL = "native-worker-consent:result";

let activeRequest: NativeWorkerConsentRequest | null = null;
let initialized = false;

export const NATIVE_WORKER_WARNING = "Native code runs with your user permissions and is not sandboxed. It can access files, use the network, and start processes. Approve only workers you trust.";

export function nativeWorkerConsentDetails(descriptor: NativeWorkerConsentDescriptor): string[] {
    const worker = descriptor.declaration;
    const source = descriptor.source.kind === "nuget.org" ? descriptor.source.url : `Local feed: ${descriptor.source.path} (package SHA-512 ${descriptor.source.packageSha512})`;
    return [
        `Tool: ${descriptor.toolName} (${descriptor.toolId}) ${descriptor.toolVersion}`,
        `Worker: ${descriptor.workerId}`,
        `Package: ${worker.packageId} ${worker.packageVersion}`,
        `Source: ${source}`,
        `Command: ${worker.command}`,
    ];
}

function api(): NativeWorkerConsentUI {
    return (window as unknown as { toolboxAPI: NativeWorkerConsentUI }).toolboxAPI;
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function textElement(tag: string, text: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

function consentActionButton(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fluent-button fluent-button-secondary";
    button.textContent = label;
    button.addEventListener("click", onClick);
    return button;
}

function buildModalHtml(request: NativeWorkerConsentRequest): string {
    const isDarkTheme = document.body.classList.contains("dark-theme");
    const detailRows = nativeWorkerConsentDetails(request)
        .map((line) => `<div class="worker-detail"><dt>${escapeHtml(line.split(":", 1)[0])}</dt><dd>${escapeHtml(line.slice(line.indexOf(":") + 1).trim())}</dd></div>`)
        .join("");

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Native worker permission</title>
    ${getModalStyles(isDarkTheme)}
    <style>
        .modal-panel { gap: 12px; overflow: hidden; }
        .worker-warning { flex: none; margin: 0; padding: 12px; border-left: 3px solid #d83b01; background: ${isDarkTheme ? "rgba(216,59,1,.16)" : "rgba(216,59,1,.08)"}; font-size: 13px; line-height: 1.5; }
        .modal-body { min-height: 0; }
        .worker-details { display: grid; gap: 8px; margin: 0; }
        .worker-detail { display: grid; grid-template-columns: minmax(120px, .32fr) minmax(0, .68fr); gap: 8px 12px; padding: 8px 10px; border: 1px solid ${isDarkTheme ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.12)"}; border-radius: 6px; }
        .worker-detail dt { color: ${isDarkTheme ? "rgba(255,255,255,.62)" : "rgba(0,0,0,.62)"}; font-size: 12px; }
        .worker-detail dd { min-width: 0; margin: 0; overflow-wrap: anywhere; font-size: 12px; line-height: 1.45; }
        .modal-footer { flex: none; }
        .modal-feedback { display: none; }
        .modal-feedback.visible { display: block; }
        .modal-footer button { white-space: normal; overflow-wrap: anywhere; }
        @media (max-width: 520px) { .worker-detail { grid-template-columns: 1fr; gap: 4px; } }
    </style>
</head>
<body>
    <main class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="consent-title" aria-describedby="worker-warning">
        <header class="modal-header">
            <div>
                <p class="modal-eyebrow">Native code permission request</p>
                <h3 id="consent-title">Approve Native Worker</h3>
            </div>
            <button class="icon-button" type="button" data-decision="reject" aria-label="Reject and close">&times;</button>
        </header>
        <p class="worker-warning" id="worker-warning">${escapeHtml(NATIVE_WORKER_WARNING)}</p>
        <section class="modal-body" aria-label="Worker details">
            <dl class="worker-details">${detailRows}</dl>
        </section>
        <p class="modal-feedback" id="consent-feedback" role="alert" aria-live="assertive"></p>
        <footer class="modal-footer">
            <button class="fluent-button fluent-button-secondary" type="button" data-decision="reject">Reject</button>
            <button id="allow-once-button" class="fluent-button fluent-button-secondary" type="button" data-decision="allow-once">Allow once</button>
            <button class="fluent-button fluent-button-primary" type="button" data-decision="allow-tool">Trust this tool version and worker</button>
        </footer>
    </main>
    <script>
        const buttons = [...document.querySelectorAll("[data-decision]")];
        buttons.forEach((button) => button.addEventListener("click", () => {
            buttons.forEach((item) => { item.disabled = true; });
            window.modalBridge.send("${DECISION_CHANNEL}", { decision: button.dataset.decision });
        }));
        window.modalBridge.onMessage((payload) => {
            if (payload?.channel !== "${RESULT_CHANNEL}") return;
            const feedback = document.getElementById("consent-feedback");
            feedback.textContent = "Approval was not saved. Reject or try again.";
            feedback.classList.add("visible");
            buttons.forEach((button) => { button.disabled = false; });
        });
        document.getElementById("allow-once-button")?.focus();
    </script>
</body>
</html>`;
}

export function initializeNativeWorkerConsentModal(): void {
    if (initialized) return;
    initialized = true;
    const showRequest = async (request: NativeWorkerConsentRequest): Promise<void> => {
        activeRequest = request;
        try {
            await showBrowserWindowModal({ id: MODAL_ID, html: buildModalHtml(request), width: 640, height: 500 });
        } catch {
            if (activeRequest?.requestId === request.requestId) {
                activeRequest = null;
                await api()
                    .respondToNativeWorkerConsent(request.requestId, "reject")
                    .catch(() => false);
            }
        }
    };
    const handleClosed = (payload: ModalWindowClosedPayload): void => {
        if (payload.id !== MODAL_ID || !activeRequest) return;
        const requestId = activeRequest.requestId;
        activeRequest = null;
        void api().respondToNativeWorkerConsent(requestId, "reject");
    };
    const handleConsentClosed = (requestId: string): void => {
        if (activeRequest?.requestId !== requestId) return;
        activeRequest = null;
        void closeBrowserWindowModal();
    };
    const handleMessage = (payload: ModalWindowMessagePayload): void => {
        if (payload.channel !== DECISION_CHANNEL || !payload.data || typeof payload.data !== "object" || !activeRequest) return;
        const decision = (payload.data as { decision?: unknown }).decision;
        if (decision !== "allow-tool" && decision !== "allow-once" && decision !== "reject") return;
        void api()
            .respondToNativeWorkerConsent(activeRequest.requestId, decision)
            .then(async (accepted) => {
                if (!accepted) throw new Error("Consent request expired");
                activeRequest = null;
                await closeBrowserWindowModal();
            })
            .catch(() => {
                if (!activeRequest) return;
                void sendBrowserWindowModalMessage({ channel: RESULT_CHANNEL, data: { success: false } }).catch(() => undefined);
            });
    };
    onBrowserWindowModalMessage(handleMessage);
    onBrowserWindowModalClosed(handleClosed);
    const unsubscribeRequest = api().onNativeWorkerConsentRequest((request) => void showRequest(request));
    const unsubscribeClosed = api().onNativeWorkerConsentClosed(handleConsentClosed);
    window.addEventListener(
        "beforeunload",
        () => {
            unsubscribeRequest();
            unsubscribeClosed();
            offBrowserWindowModalMessage(handleMessage);
            offBrowserWindowModalClosed(handleClosed);
            activeRequest = null;
        },
        { once: true },
    );
}

export function appendNativeWorkerConsentReview(container: HTMLElement): void {
    const section = document.createElement("section");
    section.className = "settings-vscode-section native-worker-consent-review";
    section.appendChild(textElement("h2", "Native Workers"));
    section.appendChild(textElement("p", NATIVE_WORKER_WARNING));
    const list = document.createElement("div");
    list.setAttribute("aria-live", "polite");
    const refresh = async () => {
        try {
            const records = await api().getNativeWorkerConsents();
            list.replaceChildren();
            if (!records.length) list.appendChild(textElement("p", "No persistent native-worker approvals."));
            records.forEach((record) => {
                const row = document.createElement("article");
                row.className = "native-worker-consent-record";
                nativeWorkerConsentDetails(record).forEach((line) => row.appendChild(textElement("p", line)));
                row.appendChild(textElement("p", `Approved: ${record.approvedAt}`));
                const status = textElement("p", "");
                status.setAttribute("role", "status");
                const revoke = consentActionButton("Revoke", () => {
                    revoke.setAttribute("disabled", "");
                    void api()
                        .revokeNativeWorkerConsent(record.fingerprint)
                        .then(refresh)
                        .catch(() => {
                            status.textContent = "Unable to revoke this approval.";
                            revoke.removeAttribute("disabled");
                        });
                });
                row.append(revoke, status);
                list.appendChild(row);
            });
        } catch {
            list.replaceChildren(textElement("p", "Unable to load native-worker approvals."));
        }
    };
    section.append(
        consentActionButton("Refresh Native Approvals", () => {
            void refresh();
        }),
        list,
    );
    container.appendChild(section);
    void refresh();
}
