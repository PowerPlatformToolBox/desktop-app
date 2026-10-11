export function getToolIdeasModalControllerScript(): string {
    return `
<script>
(() => {
    const api = window.toolboxAPI && window.toolboxAPI.toolIdeas;
    const list = document.getElementById("tool-ideas-list");
    const feedback = document.getElementById("tool-ideas-feedback");
    const form = document.getElementById("tool-idea-form");
    const submitButton = document.getElementById("tool-idea-submit-btn");
    const closeButton = document.getElementById("tool-ideas-close-btn");

    const setFeedback = (message, isError) => {
        if (!feedback) return;
        feedback.textContent = message || "";
        feedback.style.display = message ? "block" : "none";
        feedback.classList.toggle("error", !!isError);
        feedback.classList.toggle("success", !isError && !!message);
    };

    const renderIdeas = (ideas) => {
        if (!list) return;
        list.replaceChildren();
        if (!ideas.length) {
            const empty = document.createElement("p");
            empty.className = "tool-idea-empty";
            empty.textContent = "No ideas yet. Be the first to suggest one!";
            list.appendChild(empty);
            return;
        }
        ideas.forEach((idea) => {
            const card = document.createElement("article");
            card.className = "tool-idea";
            const header = document.createElement("div");
            header.className = "tool-idea-header";
            const title = document.createElement("h5");
            title.className = "tool-idea-title";
            title.textContent = idea.title;
            const vote = document.createElement("button");
            vote.className = "fluent-button fluent-button-secondary tool-idea-vote";
            vote.type = "button";
            vote.textContent = idea.hasUpvoted ? "▲ " + idea.upvotes + " Voted" : "▲ " + idea.upvotes + " Upvote";
            vote.disabled = idea.hasUpvoted;
            vote.addEventListener("click", async () => {
                vote.disabled = true;
                try {
                    await api.upvote(idea.id);
                    await loadIdeas();
                } catch (error) {
                    vote.disabled = false;
                    setFeedback(error instanceof Error ? error.message : "Failed to upvote this idea.", true);
                }
            });
            header.append(title, vote);
            const description = document.createElement("p");
            description.className = "tool-idea-description";
            description.textContent = idea.description;
            card.append(header, description);
            list.appendChild(card);
        });
    };

    const loadIdeas = async () => {
        if (!api || !list) return;
        list.textContent = "Loading ideas…";
        try {
            renderIdeas(await api.fetch());
        } catch (error) {
            list.textContent = "Ideas could not be loaded.";
            setFeedback(error instanceof Error ? error.message : "Ideas could not be loaded.", true);
        }
    };

    form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!(form instanceof HTMLFormElement) || !(submitButton instanceof HTMLButtonElement) || !api) return;
        const title = document.getElementById("tool-idea-title");
        const description = document.getElementById("tool-idea-description");
        const email = document.getElementById("tool-idea-email");
        if (!(title instanceof HTMLInputElement) || !(description instanceof HTMLTextAreaElement) || !(email instanceof HTMLInputElement)) return;
        submitButton.disabled = true;
        submitButton.textContent = "Submitting…";
        setFeedback("", false);
        try {
            await api.submit({ title: title.value, description: description.value, email: email.value });
            form.reset();
            setFeedback("Thanks! Your idea has been submitted.", false);
            await loadIdeas();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : "Failed to submit your idea.", true);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Submit Idea";
        }
    });

    closeButton?.addEventListener("click", () => window.modalBridge?.close());
    void loadIdeas();
})();
</script>`;
}
