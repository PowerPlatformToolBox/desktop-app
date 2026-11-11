import { IDEA_RESOLUTIONS, IDEA_STATUSES, IDEA_TYPES, IdeaStatus, IdeaType, ToolIdea } from "../../common/types/toolIdea";
import { canChangeIdeaVote, filterIdeas, isSupportedIdeaIssueUrl } from "../../common/utils/ideas";
import { logError } from "../../common/logger";
import { openToolIdeasModal } from "./toolIdeasModal";
import { openLocalPageAsTab } from "./toolManagement";
import { onBrowserWindowModalMessage } from "./browserWindowModals";

let ideas: ToolIdea[] = [];
let typeFilter: IdeaType | "" = "";
let statusFilter: IdeaStatus | "" = "";
let saving = false;
let reloadAfterSave = false;
let loading = false;
let loadFailed = false;
let feedback = "";
let feedbackError = false;
let revision = 0;
let renderActive: (() => void) | undefined;
let listenersInitialized = false;

function reportError(error: unknown, fallback: string): void {
    feedback = error instanceof Error ? error.message : fallback;
    feedbackError = true;
    logError(error instanceof Error ? error : new Error(fallback));
}

async function loadIdeas(): Promise<void> {
    if (saving) {
        reloadAfterSave = true;
        return;
    }
    const request = ++revision;
    loading = true;
    renderActive?.();
    try {
        const result = await window.toolboxAPI.fetchToolIdeas();
        if (request !== revision) return;
        ideas = result;
        loadFailed = false;
    } catch (error) {
        if (request !== revision) return;
        loadFailed = true;
        reportError(error, "Ideas could not be loaded.");
    } finally {
        if (request === revision) {
            loading = false;
            renderActive?.();
        }
    }
}

function text(tag: string, value: string, className?: string): HTMLElement {
    const element = document.createElement(tag);
    element.textContent = value;
    if (className) element.className = className;
    return element;
}

function action(label: string, run: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fluent-button fluent-button-secondary";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
}

async function changeVote(idea: ToolIdea): Promise<void> {
    if (saving || loading || loadFailed || !canChangeIdeaVote(idea.status)) return;
    saving = true;
    feedback = "";
    renderActive?.();
    let rejected = false;
    try {
        const result = await (idea.hasUpvoted ? window.toolboxAPI.removeToolIdeaVote(idea.id) : window.toolboxAPI.upvoteToolIdea(idea.id));
        ideas = ideas.map((current) => (current.id === idea.id ? { ...current, ...result } : current));
    } catch (error) {
        rejected = true;
        reportError(error, "Your vote could not be saved. Reload Ideas before trying again.");
    } finally {
        saving = false;
        if (rejected || reloadAfterSave) {
            reloadAfterSave = false;
            await loadIdeas();
        }
        renderActive?.();
    }
}

function renderBoard(panel: HTMLElement): void {
    panel.innerHTML = `
        <section class="ideas-board" aria-labelledby="ideas-heading">
            <header class="ideas-toolbar">
                <h1 id="ideas-heading">Ideas</h1>
                <button id="ideas-share" type="button" class="fluent-button fluent-button-primary">Share an idea</button>
            </header>
            <p class="ideas-intro">Share improvements for PPTB Desktop, the VSCode Extension, and new tools.</p>
            <p class="ideas-triage-note">Board statuses are manually maintained triage summaries. GitHub is authoritative for implementation progress; linking an issue does not mean delivery.</p>
            <div class="ideas-filters">
                <label class="ideas-filter">Type <span class="ideas-select-wrap"><select id="ideas-type-filter"><option value="">All types</option></select></span></label>
                <label class="ideas-filter">Status <span class="ideas-select-wrap"><select id="ideas-status-filter"><option value="">All statuses</option></select></span></label>
                <button id="ideas-refresh" type="button" class="fluent-button fluent-button-secondary">Refresh</button>
            </div>
            <p id="ideas-feedback" role="status" aria-live="polite"></p>
            <div id="ideas-list" aria-live="polite"></div>
        </section>`;
    const type = panel.querySelector<HTMLSelectElement>("#ideas-type-filter")!;
    const status = panel.querySelector<HTMLSelectElement>("#ideas-status-filter")!;
    for (const [value, label] of Object.entries(IDEA_TYPES)) type.add(new Option(label, value));
    for (const [value, label] of Object.entries(IDEA_STATUSES)) status.add(new Option(label, value));
    type.value = typeFilter;
    status.value = statusFilter;
    type.addEventListener("change", () => {
        typeFilter = type.value as IdeaType | "";
        render();
    });
    status.addEventListener("change", () => {
        statusFilter = status.value as IdeaStatus | "";
        render();
    });
    const refresh = panel.querySelector<HTMLButtonElement>("#ideas-refresh")!;
    refresh.addEventListener("click", () => {
        feedback = "";
        void loadIdeas();
    });
    panel.querySelector("#ideas-share")!.addEventListener("click", () => {
        openToolIdeasModal().catch((error) => {
            reportError(error, "The idea form could not be opened.");
            render();
        });
    });
    const list = panel.querySelector<HTMLElement>("#ideas-list")!;
    const message = panel.querySelector<HTMLElement>("#ideas-feedback")!;
    function render(): void {
        if (!panel.isConnected) return;
        refresh.disabled = loading || saving;
        message.textContent = feedback;
        message.classList.toggle("ideas-error", feedbackError);
        list.replaceChildren();
        if (loading || loadFailed) {
            list.append(text("p", loading ? "Loading ideas..." : "Ideas could not be loaded. Use Refresh to retry."));
            return;
        }
        const visible = filterIdeas(ideas, typeFilter, statusFilter);
        if (!visible.length) list.append(text("p", ideas.length ? "No ideas match these filters." : "No ideas yet. Share the first idea!"));
        for (const idea of visible) {
            const card = text("article", "", "idea-card");
            card.dataset.ideaId = idea.id;
            const eligible = canChangeIdeaVote(idea.status);
            let voteLabel = idea.hasUpvoted ? "Voted" : "Votes";
            if (eligible) voteLabel = idea.hasUpvoted ? "Voted - remove vote" : "Upvote";
            const vote = action(`${idea.upvotes} ${voteLabel}`, () => {
                void changeVote(idea);
            });
            vote.classList.add("idea-vote");
            vote.setAttribute("aria-pressed", String(idea.hasUpvoted));
            vote.disabled = saving || !eligible;
            if (!eligible) vote.title = "Votes cannot be changed for closed or duplicate ideas.";
            const badges = text("div", "", "idea-badges");
            badges.append(text("span", IDEA_TYPES[idea.ideaType], "idea-badge"), text("span", IDEA_STATUSES[idea.status], "idea-badge"));
            if (idea.resolution) badges.append(text("span", IDEA_RESOLUTIONS[idea.resolution], "idea-badge"));
            const header = text("div", "", "idea-card-header");
            header.append(text("h2", idea.title), vote);
            card.append(badges, header, text("p", idea.description, "idea-description"));
            if (idea.publicNote) card.append(text("h3", "Maintainer explanation"), text("p", idea.publicNote, "idea-description"));
            if (idea.duplicateOf) {
                const original = ideas.find((candidate) => candidate.id === idea.duplicateOf);
                card.append(text("p", `Duplicate of: ${original ? original.title + " (" + original.id + ")" : idea.duplicateOf}`));
            }
            const issueUrl = idea.githubIssueUrl;
            if (issueUrl) {
                if (isSupportedIdeaIssueUrl(idea.ideaType, issueUrl)) {
                    card.append(
                        action("View GitHub issue", () => {
                            window.toolboxAPI.openExternal(issueUrl).catch((error) => {
                                reportError(error, "The GitHub issue could not be opened.");
                                render();
                            });
                        }),
                    );
                } else {
                    card.append(text("p", "Unsupported GitHub issue link. It cannot be opened.", "ideas-error"));
                }
            }
            list.append(card);
        }
    }
    renderActive = render;
    render();
    void loadIdeas();
}

export async function openIdeasTab(): Promise<void> {
    if (!listenersInitialized) {
        onBrowserWindowModalMessage((payload) => {
            if (payload.channel !== "idea-submitted") return;
            feedback = typeFilter || statusFilter ? "Idea submitted. Your filters may hide the new idea." : "Thanks! Your idea has been submitted.";
            feedbackError = false;
            void loadIdeas();
        });
        listenersInitialized = true;
    }
    await openLocalPageAsTab("app-ideas", "Ideas", renderBoard, "");
}
