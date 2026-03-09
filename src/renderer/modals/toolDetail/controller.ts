export interface ToolDetailModalChannelIds {
    install: string;
    installResult: string;
    review: string;
    repository: string;
    website: string;
}

export interface ToolDetailModalState {
    toolId: string;
    toolName: string;
    isInstalled: boolean;
    isSupported?: boolean;
    readmeUrl?: string | null;
    reviewUrl: string;
    repositoryUrl?: string | null;
    websiteUrl?: string | null;
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
    const reviewLink = document.getElementById("tool-detail-review-link");
    const repoLink = document.getElementById("tool-detail-repo-link");
    const websiteLink = document.getElementById("tool-detail-website-link");
    const feedback = document.getElementById("tool-detail-feedback");
    const closeBtn = document.getElementById("tool-detail-close-btn");
    const readmeContainer = document.getElementById("tool-detail-readme-content");
    const readmeUrl = typeof CONFIG.state.readmeUrl === "string" && CONFIG.state.readmeUrl.trim() ? CONFIG.state.readmeUrl.trim() : null;

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

        // Double-check compatibility
        if (CONFIG.state.isSupported === false) {
            installBtn.disabled = true;
            installBtn.textContent = "Not supported";
            setFeedback("This tool is not compatible with your version of Power Platform ToolBox. Please update your ToolBox to use this tool.", true);
            return;
        }
        installBtn.disabled = true;
        installBtn.textContent = "Installing...";
        setFeedback("");
        modalBridge.send(CONFIG.channels.install, { toolId: CONFIG.state.toolId });
    };

    installBtn?.addEventListener("click", handleInstallClick);
    reviewLink?.addEventListener("click", (event) => {
        event.preventDefault();
        const reviewUrl = typeof CONFIG.state.reviewUrl === "string" ? CONFIG.state.reviewUrl.trim() : "";
        if (!reviewUrl) return;
        modalBridge.send(CONFIG.channels.review, { url: reviewUrl });
    });
    repoLink?.addEventListener("click", (event) => {
        event.preventDefault();
        const repoUrl = typeof CONFIG.state.repositoryUrl === "string" ? CONFIG.state.repositoryUrl.trim() : "";
        if (!repoUrl) return;
        modalBridge.send(CONFIG.channels.repository, { url: repoUrl });
    });
    websiteLink?.addEventListener("click", (event) => {
        event.preventDefault();
        const siteUrl = typeof CONFIG.state.websiteUrl === "string" ? CONFIG.state.websiteUrl.trim() : "";
        if (!siteUrl) return;
        modalBridge.send(CONFIG.channels.website, { url: siteUrl });
    });
    closeBtn?.addEventListener("click", () => modalBridge.close());

    if (CONFIG.state.isInstalled) {
        setInstalledState(true);
    }

    const MARKED_CDN_SRC = "https://cdn.jsdelivr.net/npm/marked/lib/marked.umd.js";

    const ensureMarkedLoaded = () => {
        if (window.marked) {
            return Promise.resolve(window.marked);
        }

        return new Promise((resolve) => {
            const existingScript = document.querySelector("script[data-third-party='marked']");
            if (existingScript) {
                existingScript.addEventListener("load", () => resolve(window.marked));
                existingScript.addEventListener("error", () => resolve(undefined));
                return;
            }

            const script = document.createElement("script");
            script.src = MARKED_CDN_SRC;
            script.async = true;
            script.defer = true;
            script.dataset.thirdParty = "marked";
            script.onload = () => resolve(window.marked);
            script.onerror = () => resolve(undefined);
            document.head.appendChild(script);
        });
    };

    const renderReadmeMarkdown = async () => {
        if (!readmeContainer) {
            return;
        }

        if (!readmeUrl) {
            readmeContainer.textContent = "README is not available for this tool.";
            return;
        }

        readmeContainer.textContent = "Loading README...";

        try {
            const response = await fetch(readmeUrl, { cache: "no-store" });
            if (!response.ok) {
                throw new Error("HTTP " + response.status);
            }

            const markdown = await response.text();
            const markedLib = await ensureMarkedLoaded();

            if (markedLib && typeof markedLib.parse === "function") {
                readmeContainer.innerHTML = markedLib.parse(markdown);
            } else {
                readmeContainer.textContent = markdown;
            }
        } catch (error) {
            captureException("Failed to load README", error);
            readmeContainer.textContent = "Unable to load README.";
        }
    };

    void renderReadmeMarkdown();

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
