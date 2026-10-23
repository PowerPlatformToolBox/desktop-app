import { getModalStyles } from "../sharedStyles";
import { IDEA_TYPES } from "../../../common/types/toolIdea";

export interface ToolIdeasModalView {
    styles: string;
    body: string;
}

export function getToolIdeasModalView(isDarkTheme: boolean): ToolIdeasModalView {
    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .tool-idea-description-input { width: 100%; min-height: 72px; resize: vertical; }
</style>`;
    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Community ideas</p>
            <h3>Share an idea</h3>
        </div>
        <button id="tool-ideas-close-btn" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div id="tool-ideas-feedback" class="modal-feedback" role="status" aria-live="polite"></div>
        <p>Suggest an improvement for PPTB Desktop, the VSCode Extension, or a new tool. Browse existing suggestions in the Ideas tab.</p>
        <form id="tool-idea-form">
            <div class="form-group">
                <label for="tool-idea-type">Idea type</label>
                <select id="tool-idea-type" class="modal-input fluent-select" required>
                    <option value="" selected disabled>Select an idea type</option>
                    ${Object.entries(IDEA_TYPES)
                        .map(([value, label]) => `<option value="${value}">${label}</option>`)
                        .join("")}
                </select>
            </div>
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
                <button id="tool-idea-submit-btn" class="fluent-button fluent-button-primary" type="submit">Share an idea</button>
            </div>
        </form>
    </div>
</div>`;
    return { styles, body };
}
