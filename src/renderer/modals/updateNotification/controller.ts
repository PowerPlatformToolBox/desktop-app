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

    actionBtn?.addEventListener("click", () => {
        if (!(actionBtn instanceof HTMLButtonElement) || actionBtn.disabled) return;
        if (CONFIG.type === "available") {
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
        modalBridge.send(CONFIG.channels.dismiss, { installOnExit: CONFIG.type === "downloaded" });
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
    });
})();
</script>`;
}
