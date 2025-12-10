export interface ToolDetailModalChannelIds {
    install: string;
    installResult: string;
}

export interface ToolDetailModalState {
    toolId: string;
    toolName: string;
    isInstalled: boolean;
}

export interface ToolDetailModalControllerConfig {
    channels: ToolDetailModalChannelIds;
    state: ToolDetailModalState;
}

export function getToolDetailModalControllerScript(config: ToolDetailModalControllerConfig): string {
    const serialized = JSON.stringify(config);
    return `
<script>
(() => {
    const CONFIG = ${serialized};
    const modalBridge = window.modalBridge;
    if (!modalBridge) {
        console.warn("modalBridge API is unavailable");
        return;
    }

    const installBtn = document.getElementById("tool-detail-install-btn");
    const installedBadge = document.getElementById("tool-detail-installed-badge");
    const feedback = document.getElementById("tool-detail-feedback");
    const closeBtn = document.getElementById("tool-detail-close-btn");

    const setInstalledState = (isInstalled) => {
        if (installBtn instanceof HTMLButtonElement) {
            if (isInstalled) {
                installBtn.style.display = "none";
            } else {
                installBtn.style.display = "inline-flex";
                installBtn.disabled = false;
                installBtn.textContent = "Install";
            }
        }
        if (installedBadge) {
            installedBadge.style.display = isInstalled ? "inline-flex" : "none";
        }
    };

    const setFeedback = (message, isError) => {
        if (!feedback) return;
        feedback.textContent = message || "";
        if (message) {
            feedback.classList.toggle("error", !!isError);
        } else {
            feedback.classList.remove("error");
        }
    };

    const handleInstallClick = () => {
        if (!(installBtn instanceof HTMLButtonElement)) return;
        if (installBtn.disabled) return;
        installBtn.disabled = true;
        installBtn.textContent = "Installing...";
        setFeedback("");
        modalBridge.send(CONFIG.channels.install, { toolId: CONFIG.state.toolId });
    };

    installBtn?.addEventListener("click", handleInstallClick);
    closeBtn?.addEventListener("click", () => modalBridge.close());

    if (CONFIG.state.isInstalled) {
        setInstalledState(true);
    }

    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.channel !== CONFIG.channels.installResult) return;
        const data = payload.data || {};
        if (data.success) {
            setInstalledState(true);
            setFeedback("Installed successfully.");
        } else {
            if (installBtn instanceof HTMLButtonElement) {
                installBtn.disabled = false;
                installBtn.textContent = "Install";
            }
            setFeedback(data.error || "Installation failed.", true);
        }
    });
})();
</script>`;
}
