export interface RateToolModalChannelIds {
    submit: string;
}

export interface RateToolModalControllerConfig {
    channels: RateToolModalChannelIds;
    toolId: string;
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

    let selectedRating = panel ? parseInt(panel.getAttribute("data-selected-rating") || "0", 10) || 0 : 0;

    const renderStars = () => {
        stars.forEach((star) => {
            const value = parseInt(star.getAttribute("data-star-value") || "0", 10);
            star.classList.toggle("active", value <= selectedRating);
        });
        if (submitBtn instanceof HTMLButtonElement) {
            submitBtn.disabled = selectedRating < 1;
        }
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

    submitBtn?.addEventListener("click", () => {
        if (selectedRating < 1 || !(submitBtn instanceof HTMLButtonElement) || submitBtn.disabled) return;
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
        setFeedback("", false);
        const comment = commentInput instanceof HTMLTextAreaElement ? commentInput.value.trim() : "";
        modalBridge.send(CONFIG.channels.submit, { toolId: CONFIG.toolId, rating: selectedRating, comment: comment || undefined });
    });

    cancelBtn?.addEventListener("click", () => modalBridge.close());
    closeBtn?.addEventListener("click", () => modalBridge.close());

    modalBridge.onMessage?.((payload) => {
        if (!payload || typeof payload !== "object") return;
        if (payload.channel !== CONFIG.channels.submit + ":error") return;
        const data = payload.data || {};
        if (submitBtn instanceof HTMLButtonElement) {
            submitBtn.disabled = selectedRating < 1;
            submitBtn.textContent = "Submit Rating";
        }
        setFeedback(data.error || "Failed to submit rating.", true);
    });

    renderStars();
})();
</script>`;
}
