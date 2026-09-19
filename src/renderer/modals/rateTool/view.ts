import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface RateToolModalViewModel {
    toolName: string;
    isDarkTheme: boolean;
    existingRating?: number;
    existingComment?: string;
}

const MAX_COMMENT_LENGTH = 500;

export function getRateToolModalView(model: RateToolModalViewModel): ModalViewTemplate {
    const styles =
        getModalStyles(model.isDarkTheme) +
        `
<style>
    .star-rating {
        display: flex;
        gap: 6px;
        font-size: 32px;
        line-height: 1;
    }

    .star-rating .star {
        cursor: pointer;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.25)" : "rgba(0, 0, 0, 0.2)"};
        transition: color 0.1s ease-in-out;
        user-select: none;
    }

    .star-rating .star.active {
        color: #ffb81c;
    }

    .rate-tool-comment {
        width: 100%;
        min-height: 80px;
        resize: vertical;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid ${model.isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
        color: ${model.isDarkTheme ? "#fff" : "#000"};
        font-family: inherit;
        font-size: 13px;
    }

    .rate-tool-comment-count {
        font-size: 11px;
        text-align: right;
        color: ${model.isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
    }
</style>`;

    const existingRating = typeof model.existingRating === "number" ? Math.min(5, Math.max(1, Math.round(model.existingRating))) : 0;
    const stars = [1, 2, 3, 4, 5]
        .map((value) => `<span class="star${value <= existingRating ? " active" : ""}" data-star-value="${value}" role="button" aria-label="${value} star${value > 1 ? "s" : ""}">★</span>`)
        .join("");

    const body = `
<div class="modal-panel" data-selected-rating="${existingRating}">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Rate this tool</p>
            <h3>${escapeHtml(model.toolName)}</h3>
        </div>
        <button id="rate-tool-close-btn" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div class="form-group">
            <div id="rate-tool-stars" class="star-rating">${stars}</div>
        </div>
        <div class="form-group">
            <label for="rate-tool-comment">Comment (optional)</label>
            <textarea id="rate-tool-comment" class="rate-tool-comment" maxlength="${MAX_COMMENT_LENGTH}" placeholder="What did you think of this tool?">${escapeHtml(model.existingComment ?? "")}</textarea>
            <span id="rate-tool-comment-count" class="rate-tool-comment-count">0/${MAX_COMMENT_LENGTH}</span>
        </div>
        <div id="rate-tool-feedback" class="modal-feedback"></div>
    </div>
    <div class="modal-footer">
        <button id="rate-tool-cancel-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="rate-tool-submit-btn" class="fluent-button fluent-button-primary" ${existingRating ? "" : "disabled"}>Submit Rating</button>
    </div>
</div>`;

    return { styles, body };
}
