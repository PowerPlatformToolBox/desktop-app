import { getModalStyles } from "../sharedStyles";

export interface ToolIdeasModalView {
    styles: string;
    body: string;
}

export function getToolIdeasModalView(isDarkTheme: boolean): ToolIdeasModalView {
    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .tool-ideas-list { max-height: 210px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .tool-idea { padding: 10px 12px; border: 1px solid ${isDarkTheme ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)"}; border-radius: 8px; }
    .tool-idea-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
    .tool-idea-title { margin: 0; font-size: 14px; font-weight: 600; }
    .tool-idea-description { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
    .tool-idea-vote { white-space: nowrap; }
    .tool-idea-empty { opacity: .7; font-size: 13px; }
    .tool-idea-description-input { width: 100%; min-height: 72px; resize: vertical; }
</style>`;
    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Community ideas</p>
            <h3>Suggest a Tool</h3>
        </div>
        <button id="tool-ideas-close-btn" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div id="tool-ideas-feedback" class="modal-feedback" role="status" aria-live="polite"></div>
        <h4>Popular ideas</h4>
        <div id="tool-ideas-list" class="tool-ideas-list" aria-live="polite">Loading ideas…</div>
        <h4>Share a new idea</h4>
        <form id="tool-idea-form">
            <div class="form-group">
                <label for="tool-idea-title">Title</label>
                <input id="tool-idea-title" class="modal-input" type="text" maxlength="120" required />
            </div>
            <div class="form-group">
                <label for="tool-idea-description">Description</label>
                <textarea id="tool-idea-description" class="modal-input tool-idea-description-input" maxlength="3000" required></textarea>
            </div>
            <div class="form-group">
                <label for="tool-idea-email">Contact email (optional)</label>
                <input id="tool-idea-email" class="modal-input" type="email" maxlength="254" />
            </div>
            <div class="modal-footer">
                <button id="tool-idea-submit-btn" class="fluent-button fluent-button-primary" type="submit">Submit Idea</button>
            </div>
        </form>
    </div>
</div>`;
    return { styles, body };
}
