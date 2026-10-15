import type { ToolConcernReportSource } from "../../../common/types";

export interface ReportConcernModalState {
    toolId: string;
    toolName: string;
    toolVersion?: string;
    source: ToolConcernReportSource;
    maturity?: string;
}

/**
 * Returns the controller script that wires up DOM events for the Report a Concern modal.
 * Calls `window.toolboxAPI.reportTool` directly (exposed by modalPreload.ts) instead of
 * round-tripping through the main window, since the submission result only needs to be
 * shown inside this modal.
 */
export function getReportConcernModalControllerScript(state: ReportConcernModalState): string {
    const serializedState = JSON.stringify(state);
    return `
<script>
(() => {
    const STATE = ${serializedState};
    const modalBridge = window.modalBridge;
    const reportApi = window.toolboxAPI && window.toolboxAPI.reportTool;
    if (!modalBridge || !reportApi) {
        console.warn("Report Concern modal APIs are unavailable");
        return;
    }

    const reasonSelect = document.getElementById("report-reason");
    const descriptionField = document.getElementById("report-description");
    const emailField = document.getElementById("report-email");
    const feedback = document.getElementById("report-concern-feedback");
    const submitBtn = document.getElementById("report-concern-submit-btn");
    const cancelBtn = document.getElementById("report-concern-cancel-btn");

    const setFeedback = (message, variant) => {
        if (!feedback) return;
        feedback.textContent = message || "";
        feedback.style.display = message ? "block" : "none";
        feedback.classList.remove("success", "error");
        if (variant) feedback.classList.add(variant);
    };

    const disableForm = () => {
        [reasonSelect, descriptionField, emailField, submitBtn].forEach((el) => {
            if (el) el.disabled = true;
        });
    };

    reportApi
        .hasReportedConcern(STATE.toolId)
        .then((alreadyReported) => {
            if (alreadyReported) {
                disableForm();
                setFeedback("You've already reported this tool. Our team will review it.", "success");
            }
        })
        .catch(() => {
            // Non-fatal: if the dedupe check fails, still allow the user to submit.
        });

    cancelBtn?.addEventListener("click", () => {
        modalBridge.close();
    });

    submitBtn?.addEventListener("click", async () => {
        if (!(submitBtn instanceof HTMLButtonElement)) return;

        const reason = reasonSelect ? reasonSelect.value : "";
        const description = descriptionField ? descriptionField.value.trim() : "";
        const email = emailField ? emailField.value.trim() : "";

        if (!reason) {
            setFeedback("Please select a reason.", "error");
            return;
        }
        if (reason === "other" && !description) {
            setFeedback("Please describe the concern for 'Other'.", "error");
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
        setFeedback("");

        try {
            const result = await reportApi.submitConcern({
                toolId: STATE.toolId,
                toolName: STATE.toolName,
                toolVersion: STATE.toolVersion,
                reason: reason,
                description: description || undefined,
                email: email || undefined,
                source: STATE.source,
                maturity: STATE.maturity,
            });

            if (result && result.success) {
                disableForm();
                setFeedback("Thank you. Your report has been submitted for review.", "success");
                setTimeout(() => modalBridge.close(), 1500);
            } else {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Report";
                setFeedback((result && result.error) || "Failed to submit report. Please try again.", "error");
            }
        } catch (error) {
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Report";
            setFeedback("Failed to submit report. Please try again.", "error");
        }
    });
})();
</script>`;
}
