import type { NativeWorkerConsentDecision, NativeWorkerConsentDescriptor, NativeWorkerConsentRequest, NativeWorkerConsentUI } from "../../../common/types";

export const NATIVE_WORKER_WARNING =
    "This is native code running as your operating-system user, NOT in a sandbox. It can access your same-user filesystem, use the network, and start child processes with your user's permissions. Only approve code and publishers you trust. This approval does not install a .NET runtime or grant administrator privileges; any missing runtime requires your explicit installation.";

export function nativeWorkerConsentDetails(descriptor: NativeWorkerConsentDescriptor): string[] {
    const worker = descriptor.declaration;
    return [
        `Tool: ${descriptor.toolName} (${descriptor.toolId}) ${descriptor.toolVersion}`,
        `Worker: ${descriptor.workerId}`,
        `Package: ${worker.packageId} ${worker.packageVersion}`,
        `Source: ${descriptor.source} (nuget.org only)`,
        `Command: ${worker.command}`,
        `Runtime: ${worker.dotnet.targetFramework}, minimum ${worker.dotnet.minimumRuntimeVersion}`,
        `Effective roll-forward: ${worker.dotnet.rollForward === "Latest" ? "LatestMajor" : worker.dotnet.rollForward}`,
        `Platforms: ${worker.platforms.join(", ")} (matrix ${descriptor.platformMatrixVersion})`,
        `Trust scope: this tool version, worker and exact native declaration; protocol ${descriptor.protocolVersion}. Changes require new approval.`,
    ];
}

function api(): NativeWorkerConsentUI {
    return (window as unknown as { toolboxAPI: NativeWorkerConsentUI }).toolboxAPI;
}

function textElement(tag: string, text: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}

function fluentButton(label: string, action: () => void): HTMLElement {
    const button = textElement("fluent-button", label);
    button.setAttribute("role", "button");
    button.tabIndex = 0;
    button.className = "fluent-button fluent-button-secondary";
    const activate = () => {
        if (!button.hasAttribute("disabled")) action();
    };
    button.addEventListener("click", activate);
    button.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            activate();
        }
    });
    return button;
}

export function initializeNativeWorkerConsentModal(): void {
    let active: { request: NativeWorkerConsentRequest; overlay: HTMLElement; previousFocus: HTMLElement | null; keydown: (event: KeyboardEvent) => void } | null = null;
    const close = (requestId: string) => {
        if (!active || active.request.requestId !== requestId) return;
        const previousFocus = active.previousFocus;
        document.removeEventListener("keydown", active.keydown, true);
        active.overlay.remove();
        active = null;
        if (previousFocus?.isConnected) previousFocus.focus();
    };
    const unsubscribeRequest = api().onNativeWorkerConsentRequest((request) => {
        if (active) close(active.request.requestId);
        const overlay = document.createElement("div");
        overlay.className = "native-worker-consent-overlay";
        const dialog = document.createElement("fluent-dialog");
        dialog.className = "native-worker-consent-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "native-worker-consent-title");
        dialog.setAttribute("aria-describedby", "native-worker-consent-warning");
        const title = textElement("h2", "Approve Native Worker");
        title.id = "native-worker-consent-title";
        const warning = textElement("p", NATIVE_WORKER_WARNING);
        warning.id = "native-worker-consent-warning";
        dialog.append(title, warning);
        nativeWorkerConsentDetails(request).forEach((line) => dialog.appendChild(textElement("p", line)));
        const error = textElement("p", "");
        error.setAttribute("role", "alert");
        const actions = document.createElement("div");
        actions.className = "native-worker-consent-actions";
        const buttons: HTMLElement[] = [];
        const respond = async (decision: NativeWorkerConsentDecision) => {
            if (buttons.some((button) => button.hasAttribute("disabled"))) return;
            buttons.forEach((button) => {
                button.setAttribute("disabled", "");
                button.setAttribute("aria-disabled", "true");
            });
            try {
                const accepted = await api().respondToNativeWorkerConsent(request.requestId, decision);
                if (accepted) close(request.requestId);
                else throw new Error("Consent request expired");
            } catch {
                if (active?.request.requestId !== request.requestId) return;
                error.textContent = "Approval was not saved. Reject or try again.";
                buttons.forEach((button) => {
                    button.removeAttribute("disabled");
                    button.removeAttribute("aria-disabled");
                });
            }
        };
        const choices: Array<[string, NativeWorkerConsentDecision]> = [
            ["Reject", "reject"],
            ["Allow Once", "allow-once"],
            ["Trust This Tool Version and Worker", "allow-tool"],
        ];
        choices.forEach(([label, decision]) => {
            const button = fluentButton(label, () => {
                void respond(decision);
            });
            buttons.push(button);
            actions.appendChild(button);
        });
        dialog.append(error, actions);
        overlay.appendChild(dialog);
        const keydown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopImmediatePropagation();
                void respond("reject");
            } else if (event.key === "Tab") {
                event.preventDefault();
                event.stopImmediatePropagation();
                const current = buttons.indexOf(document.activeElement as HTMLElement);
                buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
            }
        };
        active = { request, overlay, previousFocus: document.activeElement as HTMLElement | null, keydown };
        document.body.appendChild(overlay);
        document.addEventListener("keydown", keydown, true);
        buttons[0].focus();
    });
    const unsubscribeClosed = api().onNativeWorkerConsentClosed(close);
    window.addEventListener(
        "beforeunload",
        () => {
            unsubscribeRequest();
            unsubscribeClosed();
            if (active) close(active.request.requestId);
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
                const revoke = fluentButton("Revoke", () => {
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
        fluentButton("Refresh Native Approvals", () => {
            void refresh();
        }),
        list,
    );
    container.appendChild(section);
    void refresh();
}
