import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface ReportConcernModalViewModel {
    toolName: string;
    toolVersion?: string;
    isDarkTheme: boolean;
}

/**
 * Returns the view markup (styles + body) for the Report a Concern modal BrowserWindow.
 */
export function getReportConcernModalView(model: ReportConcernModalViewModel): ModalViewTemplate {
    const isDarkTheme = model.isDarkTheme;
    const subtitle = model.toolVersion ? `${model.toolName} v${model.toolVersion}` : model.toolName;

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .modal-header h3 {
        color: #ffb900;
    }

    .modal-body {
        font-size: 13px;
        font-weight: 400;
    }

    .report-concern-description {
        margin: 0 0 4px;
        line-height: 1.5;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.75)" : "rgba(0, 0, 0, 0.7)"};
    }

    textarea.modal-input {
        resize: vertical;
        min-height: 84px;
        font-family: inherit;
    }
</style>`;

    const body = `

<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">🚩 Report a Concern</p>
            <h3>${escapeHtml(subtitle)}</h3>
        </div>
    </div>
    <div class="modal-body">
        <p class="report-concern-description">
            Let us know if this tool violates the Power Platform ToolBox community values (e.g. spam, unsafe code, or inappropriate content). Reports are reviewed by our team.
        </p>
        <div class="form-group">
            <label for="report-reason">Reason</label>
            <select id="report-reason" class="modal-input">
                <option value="" disabled selected>Select a reason</option>
                <option value="spam">Spam or misleading</option>
                <option value="malicious">Malicious or unsafe code</option>
                <option value="inappropriate">Inappropriate content</option>
                <option value="community-values">Violates community values</option>
                <option value="other">Other</option>
            </select>
        </div>
        <div class="form-group">
            <label for="report-description">Details</label>
            <textarea id="report-description" class="modal-input" rows="4" placeholder="Describe the concern (required for 'Other')"></textarea>
        </div>
        <div class="form-group">
            <label for="report-email">Email (optional, for follow-up)</label>
            <input id="report-email" type="email" class="modal-input" placeholder="you@example.com" />
        </div>
        <div id="report-concern-feedback" class="modal-feedback"></div>
    </div>
    <div class="modal-footer">
        <button id="report-concern-cancel-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="report-concern-submit-btn" class="fluent-button fluent-button-primary">Submit Report</button>
    </div>
</div>`;

    return { styles, body };
}
