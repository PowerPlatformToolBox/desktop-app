export function getToolIdeasModalControllerScript(): string {
    return `
<script>
(() => {
    const api = window.toolboxAPI && window.toolboxAPI.toolIdeas;
    const feedback = document.getElementById("tool-ideas-feedback");
    const form = document.getElementById("tool-idea-form");
    const submitButton = document.getElementById("tool-idea-submit-btn");
    const closeButton = document.getElementById("tool-ideas-close-btn");
    let saving = false;

    const setFeedback = (message, isError) => {
        feedback.textContent = message;
        feedback.style.display = message ? "block" : "none";
        feedback.classList.toggle("error", isError);
        feedback.classList.toggle("success", !isError && !!message);
    };

    if (!api) {
        submitButton.disabled = true;
        setFeedback("The Ideas service is unavailable. Close this form and try again.", true);
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (saving || !api || !form.reportValidity()) return;
        const ideaType = document.getElementById("tool-idea-type");
        const title = document.getElementById("tool-idea-title");
        const description = document.getElementById("tool-idea-description");
        const email = document.getElementById("tool-idea-email");
        saving = true;
        submitButton.disabled = true;
        submitButton.textContent = "Submitting...";
        setFeedback("", false);
        try {
            await api.submit({ ideaType: ideaType.value, title: title.value, description: description.value, email: email.value });
            form.reset();
            setFeedback("Thanks! Your idea has been submitted.", false);
            window.modalBridge?.send("idea-submitted");
            await window.modalBridge?.close();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : "Failed to submit your idea.", true);
        } finally {
            saving = false;
            submitButton.disabled = false;
            submitButton.textContent = "Share an idea";
        }
    });

    closeButton.addEventListener("click", () => {
        Promise.resolve(window.modalBridge?.close()).catch((error) => setFeedback(error instanceof Error ? error.message : "The form could not be closed.", true));
    });
})();
</script>`;
}
