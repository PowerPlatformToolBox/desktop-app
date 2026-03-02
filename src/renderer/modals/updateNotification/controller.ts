export interface UpdateNotificationModalChannelIds {
    download: string;
    install: string;
    dismiss: string;
    openExternal: string;
}

export interface UpdateNotificationModalControllerConfig {
    type: "available" | "downloaded";
    channels: UpdateNotificationModalChannelIds;
}

export function getUpdateNotificationModalControllerScript(config: UpdateNotificationModalControllerConfig): string {
    const serialized = JSON.stringify(config);
    return `
<script>
(() => {
    const CONFIG = ${serialized};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        return;
    }

    const actionBtn = document.getElementById("update-action-btn");
    const laterBtn = document.getElementById("update-later-btn");
    const closeBtn = document.getElementById("update-close-btn");
    const progressWrap = document.getElementById("update-progress-wrap");
    const progressFill = document.getElementById("update-progress-fill");
    const progressLabel = document.getElementById("update-progress-label");

    // effectiveType tracks the current state and is updated when a download
    // completes inside an already-open "available" modal, so the action button
    // correctly sends "install" instead of "download" after the transition, and
    // the dismiss logic correctly sets installOnExit only when in "downloaded" state.
    let effectiveType = CONFIG.type;

    const setDownloadingState = (percent) => {
        if (progressWrap) progressWrap.style.display = "flex";
        if (progressFill) progressFill.style.width = percent + "%";
        if (progressLabel) progressLabel.textContent = "Downloading update\\u2026 " + percent + "%";
        if (actionBtn instanceof HTMLButtonElement) {
            actionBtn.disabled = true;
            actionBtn.textContent = "Downloading\\u2026";
        }
        if (laterBtn instanceof HTMLButtonElement) {
            laterBtn.disabled = true;
        }
    };

    const setErrorState = (message) => {
        if (progressWrap) progressWrap.style.display = "none";
        if (actionBtn instanceof HTMLButtonElement) {
            actionBtn.disabled = false;
            actionBtn.textContent = effectiveType === "downloaded" ? "Restart & Install Now" : "Download & Install";
        }
        if (laterBtn instanceof HTMLButtonElement) {
            laterBtn.disabled = false;
        }
        if (progressLabel) {
            progressLabel.textContent = message || "Unable to complete update. Please check your connection and try again.";
            progressLabel.style.color = "#d13438";
            if (progressWrap) progressWrap.style.display = "flex";
        }
    };

    actionBtn?.addEventListener("click", () => {
        if (!(actionBtn instanceof HTMLButtonElement) || actionBtn.disabled) return;
        if (effectiveType === "available") {
            setDownloadingState(0);
            modalBridge.send(CONFIG.channels.download, {});
        } else {
            if (actionBtn instanceof HTMLButtonElement) {
                actionBtn.disabled = true;
                actionBtn.textContent = "Restarting\\u2026";
            }
            modalBridge.send(CONFIG.channels.install, {});
        }
    });

    laterBtn?.addEventListener("click", () => {
        if (!(laterBtn instanceof HTMLButtonElement) || laterBtn.disabled) return;
        modalBridge.send(CONFIG.channels.dismiss, { installOnExit: effectiveType === "downloaded" });
        modalBridge.close();
    });

    closeBtn?.addEventListener("click", () => {
        modalBridge.send(CONFIG.channels.dismiss, { installOnExit: false });
        modalBridge.close();
    });

    // Handle "View full release notes" link — open in external browser via main process
    document.querySelectorAll("a.update-release-notes-link").forEach((link) => {
        link.addEventListener("click", (event) => {
            event.preventDefault();
            const url = link instanceof HTMLAnchorElement ? link.href : "";
            if (url) {
                modalBridge.send(CONFIG.channels.openExternal, { url });
            }
        });
    });

    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.channel === "update:progress") {
            const percent = typeof payload.data?.percent === "number" ? payload.data.percent : 0;
            setDownloadingState(percent);
        }
        if (payload.channel === "update:downloaded") {
            effectiveType = "downloaded";
            if (progressWrap) progressWrap.style.display = "none";
            if (actionBtn instanceof HTMLButtonElement) {
                actionBtn.disabled = false;
                actionBtn.textContent = "Restart & Install Now";
            }
            if (laterBtn instanceof HTMLButtonElement) {
                laterBtn.disabled = false;
                laterBtn.textContent = "Install on Exit";
            }
        }
        if (payload.channel === "update:error") {
            const message = typeof payload.data?.message === "string" ? payload.data.message : undefined;
            setErrorState(message);
        }
    });
})();
</script>`;
}
