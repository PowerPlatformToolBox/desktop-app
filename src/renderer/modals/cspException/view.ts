import { type CspExceptionSource, normalizeCspExceptionSource } from "../../../common/types";
import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface CspExceptionModalViewModel {
    toolName: string;
    authors: string[];
    cspExceptions: { [directive: string]: CspExceptionSource[] };
    isDarkTheme: boolean;
}

/**
 * Render a subset of inline Markdown to safe HTML.
 * Supports: **bold**, *italic*, `inline code`.
 * All text is HTML-escaped first to prevent injection.
 */
function renderMarkdownInline(text: string): string {
    let result = escapeHtml(text);
    // Bold: **text** (non-greedy, processed before italic)
    result = result.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic: *text* — use lookahead/lookbehind to avoid matching ** bold markers
    result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    // Inline code: `text`
    result = result.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    return result;
}

/**
 * Returns the view markup (styles + body) for the CSP exception modal BrowserWindow.
 * Required and optional exceptions are shown in separate sections.
 * Optional exceptions have checkboxes so the user can selectively approve them.
 */
export function getCspExceptionModalView(model: CspExceptionModalViewModel): ModalViewTemplate {
    const isDarkTheme = model.isDarkTheme;

    const authorsList = model.authors && model.authors.length ? model.authors.join(", ") : "Unknown";

    // Build flat map of unique CSP source entries across all directives, keyed by domain
    const allEntries = new Map<string, { domain: string; exceptionReason?: string; optional?: boolean }>();
    for (const sources of Object.values(model.cspExceptions)) {
        if (Array.isArray(sources)) {
            sources.forEach((source: CspExceptionSource) => {
                const entry = normalizeCspExceptionSource(source);
                const existing = allEntries.get(entry.domain);
                if (!existing) {
                    allEntries.set(entry.domain, entry);
                } else {
                    // Merge duplicate domains deterministically:
                    // - Treat as required if any occurrence is required.
                    // - Prefer non-empty exception reasons, combining if they differ.
                    const mergedOptional = (existing.optional ?? false) && (entry.optional ?? false) ? true : undefined;
                    let mergedReason: string | undefined;
                    const existingReason = existing.exceptionReason && existing.exceptionReason.trim().length > 0 ? existing.exceptionReason : undefined;
                    const newReason = entry.exceptionReason && entry.exceptionReason.trim().length > 0 ? entry.exceptionReason : undefined;
                    if (existingReason && newReason && existingReason !== newReason) {
                        mergedReason = `${existingReason}\n\n${newReason}`;
                    } else {
                        mergedReason = existingReason ?? newReason;
                    }
                    allEntries.set(entry.domain, {
                        ...existing,
                        ...entry,
                        optional: mergedOptional,
                        exceptionReason: mergedReason,
                    });
                }
            });
        }
    }

    const requiredEntries = Array.from(allEntries.values()).filter((e) => !e.optional);
    const optionalEntries = Array.from(allEntries.values()).filter((e) => e.optional);

    const renderEntryItem = (entry: { domain: string; exceptionReason?: string }, isCheckbox = false, isDisabled = false): string => {
        const domainHtml = `<code class="csp-exception-domain-code">${escapeHtml(entry.domain)}</code>`;
        const reasonHtml = entry.exceptionReason ? `<div class="csp-exception-reason">${renderMarkdownInline(entry.exceptionReason)}</div>` : "";
        if (isCheckbox) {
            const disabledAttr = isDisabled ? " disabled" : "";
            const itemClass = isDisabled ? "csp-optional-item csp-required-item" : "csp-optional-item";
            return `
            <li class="${itemClass}">
                <label class="csp-optional-label">
                    <input type="checkbox" class="csp-optional-checkbox" value="${escapeHtml(entry.domain)}" checked${disabledAttr}>
                    <span class="csp-optional-content">
                        ${domainHtml}
                        ${reasonHtml}
                    </span>
                </label>
            </li>`;
        }
        return `<li>${domainHtml}${reasonHtml}</li>`;
    };

    const requiredHtml = requiredEntries.map((e) => renderEntryItem(e, true, true)).join("");
    const optionalHtml = optionalEntries.map((e) => renderEntryItem(e, true, false)).join("");

    const requiredSectionHtml =
        requiredEntries.length > 0
            ? `
        <div class="csp-section-label">Required</div>
        <div class="csp-exceptions-list">
            <ul>${requiredHtml}</ul>
        </div>`
            : "";

    const optionalSectionHtml =
        optionalEntries.length > 0
            ? `
        <div class="csp-section-label csp-section-label-optional">
            Optional
            <span class="csp-section-sublabel">Uncheck any you do not want to allow</span>
        </div>
        <div class="csp-exceptions-list csp-exceptions-list-optional">
            <ul>${optionalHtml}</ul>
        </div>`
            : "";

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    /* CSP exception modal specific styles */
    .modal-header h3 {
        color: #ffb900;
    }

    .modal-body p {
        margin-bottom: 16px;
        line-height: 1.6;
    }

    .tool-info {
        margin-bottom: 20px;
    }

    .tool-name {
        font-weight: 600;
        font-size: 15px;
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .tool-author {
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin-top: 4px;
    }

    .csp-section-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.45)"};
        margin-bottom: 6px;
        margin-top: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .csp-section-label-optional {
        color: ${isDarkTheme ? "rgba(76, 194, 255, 0.8)" : "rgba(0, 110, 200, 0.8)"};
    }

    .csp-section-sublabel {
        font-size: 10px;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.4)"};
    }

    .csp-exceptions-list {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border-radius: 8px;
        padding: 8px 12px;
        margin-bottom: 4px;
        max-height: 160px;
        overflow-y: auto;
    }

    .csp-exceptions-list-optional {
        border-color: ${isDarkTheme ? "rgba(76, 194, 255, 0.2)" : "rgba(0, 110, 200, 0.2)"};
    }

    .csp-exceptions-list ul {
        margin: 0;
        padding-left: 20px;
        list-style: none;
    }

    .csp-exceptions-list li {
        margin: 6px 0;
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
        padding-left: 0;
    }

    .csp-exceptions-list code {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)"};
        border-radius: 3px;
        padding: 2px 6px;
        font-family: "Consolas", "Monaco", "Courier New", monospace;
        font-size: 12px;
        color: ${isDarkTheme ? "#f48771" : "#d84315"};
    }

    .csp-optional-item {
        list-style: none;
        padding-left: 0;
    }

    .csp-optional-label {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        cursor: pointer;
    }

    .csp-optional-checkbox {
        margin-top: 3px;
        flex-shrink: 0;
        width: 14px;
        height: 14px;
        cursor: pointer;
        accent-color: #0e639c;
    }

    .csp-required-item .csp-optional-checkbox {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .csp-required-item .csp-optional-label {
        cursor: default;
    }

    .csp-optional-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .csp-warning {
        background: rgba(255, 185, 0, 0.1);
        border: 1px solid rgba(255, 185, 0, 0.3);
        border-radius: 8px;
        padding: 12px;
        margin: 16px 0;
    }

    .csp-warning p {
        margin: 0 0 12px 0;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
        font-size: 13px;
        line-height: 1.5;
    }

    .csp-warning p:last-child {
        margin-bottom: 0;
    }

    .csp-warning strong {
        color: #ffb900;
    }

    .csp-learn-more {
        color: #4cc2ff;
    }

    .csp-exception-domain-code {
        width: fit-content;
    }

    .csp-exception-reason {
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.55)" : "rgba(0, 0, 0, 0.55)"};
        margin-top: 2px;
        line-height: 1.4;
    }

    .csp-exception-reason code {
        font-size: 11px;
    }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">⚠️ Permission Request</p>
            <h3>Website Access Required</h3>
        </div>
    </div>
    <div class="modal-body">
        <p>
            <strong class="tool-name">${escapeHtml(model.toolName)}</strong> by <span class="tool-author">${escapeHtml(authorsList)}</span>
            wants to connect to websites outside this application.
        </p>
        <p>Only allow if you trust this tool and the author(s) who created it.</p>
        ${requiredSectionHtml}
        ${optionalSectionHtml}
        <div class="csp-warning">
            <p>
                <strong>⚠️ Only allow if you trust this tool.</strong>
            </p>
            <p>
                If you are unsure, decline and check the tool's documentation or contact its author before proceeding.
                <a href="https://docs.powerplatformtoolbox.com/data-access" target="_blank" rel="noopener noreferrer" class="csp-learn-more">Learn more about website permissions.</a>
            </p>
        </div>
    </div>
    <div class="modal-footer">
        <button id="csp-decline-btn" class="fluent-button fluent-button-secondary">Decline</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Allow &amp; Continue</button>
    </div>
</div>`;

    return { styles, body };
}
