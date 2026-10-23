export interface RateToolModalChannelIds {
    submit: string;
    context: string;
    openIssues: string;
}

export interface RateToolModalControllerConfig {
    channels: RateToolModalChannelIds;
    toolId: string;
    installedVersion: string;
    versionMaxLength: number;
    notInstalledMessage: string;
}

/**
 * Returns the controller script that wires up DOM events for the Rate Tool modal.
 */
export function getRateToolModalControllerScript(config: RateToolModalControllerConfig): string {
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

    const panel = document.querySelector(".modal-panel");
    const stars = document.querySelectorAll("#rate-tool-stars .star");
    const submitBtn = document.getElementById("rate-tool-submit-btn");
    const cancelBtn = document.getElementById("rate-tool-cancel-btn");
    const closeBtn = document.getElementById("rate-tool-close-btn");
    const commentInput = document.getElementById("rate-tool-comment");
    const commentCount = document.getElementById("rate-tool-comment-count");
    const feedback = document.getElementById("rate-tool-feedback");
    const installedBlock = document.getElementById("rate-tool-version-installed");
    const installedValue = document.getElementById("rate-tool-version-value");
    const manualBlock = document.getElementById("rate-tool-version-manual");
    const versionInput = document.getElementById("rate-tool-version-input");
    const confirmRow = document.getElementById("rate-tool-version-confirm-row");
    const confirmBox = document.getElementById("rate-tool-version-confirm");
    const confirmText = document.getElementById("rate-tool-version-confirm-text");
    const issuesLink = document.getElementById("rate-tool-issues-link");

    let selectedRating = panel ? parseInt(panel.getAttribute("data-selected-rating") || "0", 10) || 0 : 0;
    let installedVersion = CONFIG.installedVersion || "";
    let isInstalled = true;
    let needsConfirm = false;
    let submitting = false;

    const currentVersion = () => (installedVersion || (versionInput instanceof HTMLInputElement ? versionInput.value : "")).trim();
    const isConfirmed = () => !needsConfirm || (confirmBox instanceof HTMLInputElement && confirmBox.checked);

    const updateSubmitState = () => {
        if (!(submitBtn instanceof HTMLButtonElement)) return;
        submitBtn.disabled = submitting || !isInstalled || selectedRating < 1 || !isConfirmed();
    };

    const renderStars = () => {
        stars.forEach((star) => {
            const value = parseInt(star.getAttribute("data-star-value") || "0", 10);
            star.classList.toggle("active", value <= selectedRating);
            star.setAttribute("aria-pressed", String(value === selectedRating));
        });
        updateSubmitState();
    };

    stars.forEach((star) => {
        star.addEventListener("click", () => {
            selectedRating = parseInt(star.getAttribute("data-star-value") || "0", 10);
            renderStars();
        });
    });

    const updateCommentCount = () => {
        if (commentInput instanceof HTMLTextAreaElement && commentCount) {
            commentCount.textContent = commentInput.value.length + "/" + commentInput.maxLength;
        }
    };
    commentInput?.addEventListener("input", updateCommentCount);
    updateCommentCount();

    const setFeedback = (message, isError) => {
        if (!feedback) return;
        feedback.textContent = message || "";
        feedback.style.display = message ? "block" : "none";
        feedback.classList.toggle("error", !!isError);
        feedback.classList.toggle("success", !isError && !!message);
    };

    versionInput?.addEventListener("input", updateSubmitState);
    confirmBox?.addEventListener("change", updateSubmitState);

    const renderVersion = () => {
        if (installedBlock) installedBlock.hidden = !installedVersion;
        if (manualBlock) manualBlock.hidden = !!installedVersion;
        if (installedValue) installedValue.textContent = installedVersion;
        if (confirmRow) confirmRow.hidden = !needsConfirm;
        if (confirmText) confirmText.textContent = needsConfirm ? "The installed version changed to " + installedVersion + ". I confirm my review is for this version." : "";
    };

    submitBtn?.addEventListener("click", () => {
        if (submitting || !(submitBtn instanceof HTMLButtonElement) || submitBtn.disabled) return;
        const version = currentVersion();
        if (!version) {
            setFeedback("Enter the version of the tool you are reviewing.", true);
            return;
        }
        if (version.length > CONFIG.versionMaxLength) {
            setFeedback("The tool version must be " + CONFIG.versionMaxLength + " characters or fewer.", true);
            return;
        }
        submitting = true;
        submitBtn.textContent = "Submitting...";
        updateSubmitState();
        setFeedback("", false);
        const comment = commentInput instanceof HTMLTextAreaElement ? commentInput.value.trim() : "";
        modalBridge.send(CONFIG.channels.submit, { toolId: CONFIG.toolId, rating: selectedRating, comment: comment || undefined, toolVersion: version });
    });

    const openIssues = () => modalBridge.send(CONFIG.channels.openIssues, {});
    issuesLink?.addEventListener("click", openIssues);
    issuesLink?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openIssues();
        }
    });

    cancelBtn?.addEventListener("click", () => modalBridge.close());
    closeBtn?.addEventListener("click", () => modalBridge.close());

    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        const data = payload.data || {};
        if (payload.channel === CONFIG.channels.context) {
            if (!data.installed) {
                isInstalled = false;
                setFeedback(CONFIG.notInstalledMessage, true);
            } else {
                if (!isInstalled) setFeedback("", false);
                isInstalled = true;
                const nextVersion = typeof data.version === "string" ? data.version.trim() : "";
                const previous = currentVersion();
                if (nextVersion && nextVersion !== installedVersion) {
                    // Never silently re-associate the draft with a different version.
                    needsConfirm = !!previous && previous !== nextVersion;
                    if (confirmBox instanceof HTMLInputElement) confirmBox.checked = false;
                    installedVersion = nextVersion;
                    renderVersion();
                }
            }
            updateSubmitState();
            return;
        }
        if (payload.channel !== CONFIG.channels.submit + ":error") return;
        submitting = false;
        if (submitBtn instanceof HTMLButtonElement) {
            submitBtn.textContent = "Submit Rating";
        }
        updateSubmitState();
        setFeedback(data.error || "Failed to submit rating.", true);
    });

    renderVersion();
    renderStars();
})();
</script>`;
}
