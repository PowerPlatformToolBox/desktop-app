import { type CspExceptionSource, normalizeCspExceptionSource } from "../../../common/types";
import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

/**
 * Context provided when re-triggering consent because the tool has new permissions since
 * the user last approved. Contains the previously approved domains and the newly added ones.
 */
export interface CspReconsentContext {
    /** Required domains that were approved in the previous consent. */
    previouslyApprovedRequired: string[];
    /** Optional domains that were approved by the user in the previous consent. */
    previouslyApprovedOptional: string[];
    /** Required domains added since the last consent (must be approved to continue). */
    newRequired: string[];
    /** Optional domains added since the last consent (user may selectively approve). */
    newOptional: string[];
}

export interface CspExceptionModalViewModel {
    toolName: string;
    authors: string[];
    cspExceptions: { [directive: string]: CspExceptionSource[] };
    isDarkTheme: boolean;
    mode?: "consent" | "manage";
    hasGrantedConsent?: boolean;
    /** Optional domains that should be pre-selected in manage mode. */
    preselectedOptionalDomains?: string[];
    /** When present, renders the modal in re-consent mode, highlighting only the new permissions. */
    reconsentContext?: CspReconsentContext;
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
 *
 * When `reconsentContext` is provided (re-consent mode), only the newly added permissions
 * are shown for approval and previously approved permissions are displayed as informational context.
 */
export function getCspExceptionModalView(model: CspExceptionModalViewModel): ModalViewTemplate {
    const isDarkTheme = model.isDarkTheme;
    const isReconsent = !!model.reconsentContext;
    const mode = model.mode ?? "consent";
    const isManageMode = mode === "manage";

    const authorsList = model.authors && model.authors.length ? model.authors.join(", ") : "Unknown";

    // Determine which types of permissions are being requested for dynamic title/description.
    const directiveKeys = Object.keys(model.cspExceptions);
    const hasMailtoOnly = directiveKeys.length === 1 && directiveKeys[0] === "mailto";
    const hasMailto = directiveKeys.includes("mailto");

    const modalTitle = isManageMode ? "Manage Permissions" : isReconsent ? "Updated Permissions" : hasMailtoOnly ? "Email Permission Required" : "Permission Request";
    // These are intentional sentence fragments that complete the phrase
    // "<ToolName> by <Authors> <modalDescription>" in the modal body template below.
    const modalDescription = isManageMode
        ? "permissions can be adjusted below. Choose Grant All, Revoke All, or make selective changes to optional entries."
        : isReconsent
          ? "has been updated with new permissions that require your approval."
          : hasMailtoOnly
            ? "wants to open email links in your default email client."
            : hasMailto
              ? "wants to access external resources and open email links."
              : "wants to connect to websites outside this application.";

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

    const renderEntryItem = (entry: { domain: string; exceptionReason?: string }, isCheckbox = false, isDisabled = false, isChecked = true): string => {
        // Use a human-readable label for the special mailto: sentinel domain.
        const domainLabel = entry.domain === "mailto:" ? "Email links (mailto:)" : entry.domain;
        const domainHtml = `<code class="csp-exception-domain-code">${escapeHtml(domainLabel)}</code>`;
        const reasonHtml = entry.exceptionReason ? `<div class="csp-exception-reason">${renderMarkdownInline(entry.exceptionReason)}</div>` : "";
        if (isCheckbox) {
            const disabledAttr = isDisabled ? " disabled" : "";
            const checkedAttr = isChecked ? " checked" : "";
            const itemClass = isDisabled ? "csp-optional-item csp-required-item" : "csp-optional-item";
            return `
            <li class="${itemClass}">
                <label class="csp-optional-label">
                    <input type="checkbox" class="csp-optional-checkbox" value="${escapeHtml(entry.domain)}"${checkedAttr}${disabledAttr}>
                    <span class="csp-optional-content">
                        ${domainHtml}
                        ${reasonHtml}
                    </span>
                </label>
            </li>`;
        }
        return `<li>${domainHtml}${reasonHtml}</li>`;
    };

    let requiredSectionHtml = "";
    let optionalSectionHtml = "";
    let previouslyApprovedSectionHtml = "";
    let optionalEntriesCount = 0;

    if (isReconsent && model.reconsentContext) {
        // Re-consent mode: show only the NEW permissions for approval, and previously approved as context.
        const ctx = model.reconsentContext;

        const newRequiredEntries = ctx.newRequired.map((domain) => allEntries.get(domain) ?? { domain });
        const newOptionalEntries = ctx.newOptional.map((domain) => allEntries.get(domain) ?? { domain });

        const newRequiredHtml = newRequiredEntries.map((e) => renderEntryItem(e, true, true)).join("");
        const newOptionalHtml = newOptionalEntries.map((e) => renderEntryItem(e, true, false)).join("");

        requiredSectionHtml =
            newRequiredEntries.length > 0
                ? `
        <div class="csp-section-label">New Required</div>
        <div class="csp-exceptions-list">
            <ul>${newRequiredHtml}</ul>
        </div>`
                : "";

        optionalSectionHtml =
            newOptionalEntries.length > 0
                ? `
        <div class="csp-section-label csp-section-label-optional">
            New Optional
            <span class="csp-section-sublabel">Uncheck any you do not want to allow</span>
        </div>
        <div class="csp-exceptions-list csp-exceptions-list-optional">
            <ul>${newOptionalHtml}</ul>
        </div>`
                : "";

        // Build the previously approved section (required + optional combined, informational only)
        const prevApprovedDomains = [...ctx.previouslyApprovedRequired, ...ctx.previouslyApprovedOptional];
        if (prevApprovedDomains.length > 0) {
            const prevEntriesHtml = prevApprovedDomains
                .map((domain) => {
                    const entry = allEntries.get(domain) ?? { domain };
                    return renderEntryItem(entry);
                })
                .join("");
            previouslyApprovedSectionHtml = `
        <div class="csp-section-label csp-section-label-previous">
            Previously Approved
        </div>
        <div class="csp-exceptions-list csp-exceptions-list-previous">
            <ul>${prevEntriesHtml}</ul>
        </div>`;
        }
    } else {
        // Initial consent mode: show all required and optional entries.
        const requiredEntries = Array.from(allEntries.values()).filter((e) => !e.optional);
        const optionalEntries = Array.from(allEntries.values()).filter((e) => e.optional);
        optionalEntriesCount = optionalEntries.length;
        const preselectedOptionalSet = new Set(model.preselectedOptionalDomains ?? optionalEntries.map((entry) => entry.domain));

        const requiredHtml = requiredEntries.map((e) => renderEntryItem(e, true, true)).join("");
        const optionalHtml = optionalEntries.map((e) => renderEntryItem(e, true, false, preselectedOptionalSet.has(e.domain))).join("");

        requiredSectionHtml =
            requiredEntries.length > 0
                ? `
        <div class="csp-section-label">Required</div>
        <div class="csp-exceptions-list">
            <ul>${requiredHtml}</ul>
        </div>`
                : "";

        optionalSectionHtml =
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
    }

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    /* CSP exception modal specific styles */
    .modal-header h3 {
        color: #ffb900;
    }

    .modal-body p {
        line-height: 1.6;
    }

    .modal-body {
        font-size: 13px;
        font-weight: 400;
        overflow: hidden;
        padding-right: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
    }

    .csp-description {
        margin: 0;
        flex: 0 0 auto;
    }

    .csp-permissions-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
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
        font-size: 15px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
    }

    .csp-section-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.45)"};
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .csp-section-label-optional {
        color: ${isDarkTheme ? "rgba(76, 194, 255, 0.8)" : "rgba(0, 110, 200, 0.8)"};
    }

    .csp-section-label-previous {
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.35)" : "rgba(0, 0, 0, 0.35)"};
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
        max-height: 140px;
        overflow-y: auto;
        min-height: 0;
    }

    .csp-exceptions-list-optional {
        border-color: ${isDarkTheme ? "rgba(76, 194, 255, 0.2)" : "rgba(0, 110, 200, 0.2)"};
    }

    .csp-exceptions-list-previous {
        opacity: 0.6;
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
        margin: 0;
        flex: 0 0 auto;
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

    const selectedOptionalCount = model.preselectedOptionalDomains?.length ?? optionalEntriesCount;
    const hasOptionalEntries = optionalEntriesCount > 0;
    const hasGrantedConsent = model.hasGrantedConsent === true;
    const hasAllOptionalSelected = hasOptionalEntries && selectedOptionalCount === optionalEntriesCount;
    const hasNoOptionalSelected = selectedOptionalCount === 0;

    let manageActionsHtml = `<button id="csp-cancel-btn" class="fluent-button fluent-button-secondary">Cancel</button>`;
    if (hasGrantedConsent) {
        if (hasOptionalEntries) {
            if (hasAllOptionalSelected) {
                manageActionsHtml += `
        <button id="csp-revoke-all-btn" class="fluent-button fluent-button-secondary">Revoke All</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Make Changes</button>`;
            } else if (hasNoOptionalSelected) {
                manageActionsHtml += `
        <button id="csp-grant-all-btn" class="fluent-button fluent-button-secondary">Grant All</button>
        <button id="csp-revoke-all-btn" class="fluent-button fluent-button-secondary">Revoke All</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Make Changes</button>`;
            } else {
                manageActionsHtml += `
        <button id="csp-grant-all-btn" class="fluent-button fluent-button-secondary">Grant All</button>
        <button id="csp-revoke-all-btn" class="fluent-button fluent-button-secondary">Revoke All</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Make Changes</button>`;
            }
        } else {
            manageActionsHtml += `
        <button id="csp-revoke-all-btn" class="fluent-button fluent-button-primary">Revoke All</button>`;
        }
    } else {
        if (hasOptionalEntries) {
            if (hasNoOptionalSelected) {
                manageActionsHtml += `
        <button id="csp-grant-all-btn" class="fluent-button fluent-button-secondary">Grant All</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Make Changes</button>`;
            } else {
                manageActionsHtml += `
        <button id="csp-grant-all-btn" class="fluent-button fluent-button-secondary">Grant All</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Make Changes</button>`;
            }
        } else {
            manageActionsHtml += `
        <button id="csp-grant-all-btn" class="fluent-button fluent-button-primary">Grant All</button>`;
        }
    }

    const footerHtml = isManageMode
        ? `
    <div class="modal-footer modal-footer-manage">
        ${manageActionsHtml}
    </div>`
        : `
    <div class="modal-footer">
        <button id="csp-decline-btn" class="fluent-button fluent-button-secondary">Decline</button>
        <button id="csp-accept-btn" class="fluent-button fluent-button-primary">Allow &amp; Continue</button>
    </div>`;

    const body = `

<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">${isManageMode ? "⚙️ Permission Management" : "⚠️ Permission Request"}</p>
            <h3>${escapeHtml(modalTitle)}</h3>
        </div>
    </div>
    <div class="modal-body">
        <p class="csp-description">
            <strong class="tool-name">${escapeHtml(model.toolName)}</strong> by <span class="tool-author">${escapeHtml(authorsList)}</span>
            ${escapeHtml(modalDescription)}
        </p>
        <div class="csp-permissions-container">
            ${requiredSectionHtml}
            ${optionalSectionHtml}
            ${previouslyApprovedSectionHtml}
        </div>
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
    ${footerHtml}

</div>`;

    return { styles, body };
}
