import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface SelectMultiConnectionModalOptions {
    minConnections: number;
    maxConnections: number;
    toolName?: string;
    initialConnectionIds?: Array<string | null>;
}

/**
 * Returns the view markup (styles + body) for the select multi-connection modal BrowserWindow.
 * @param isDarkTheme - Whether dark theme is enabled
 * @param isSecondaryRequired - Whether the secondary connection is required (true) or optional (false)
 * @param toolName - Optional name of the tool requesting the connections
 */
export function getSelectMultiConnectionModalView(isDarkTheme: boolean, optionsOrIsSecondaryRequired: boolean | SelectMultiConnectionModalOptions = true, toolName?: string): ModalViewTemplate {
    if (typeof optionsOrIsSecondaryRequired === "object") {
        return getConnectionSlotsModalView(isDarkTheme, optionsOrIsSecondaryRequired);
    }

    const isSecondaryRequired = optionsOrIsSecondaryRequired;
    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    /* Additional styles specific to multi-connection modal */
    .connections-container {
        display: flex;
        gap: 16px;
        flex: 1;
    }

    .connection-section {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .section-label {
        font-size: 14px;
        font-weight: 600;
        color: ${isDarkTheme ? "#fff" : "#000"};
        margin-bottom: 12px;
        display: block;
    }

    .connection-badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-left: 8px;
    }

    .connection-badge.primary {
        background: rgba(14, 99, 156, 0.2);
        color: #4cc2ff;
    }

    .connection-badge.secondary {
        background: rgba(255, 140, 0, 0.2);
        color: #ff8c00;
    }

    .connection-list {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }

    .connection-item:not(.authenticated):hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)"};
        border-color: ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
    }

    .connection-item.authenticated {
        background: rgba(14, 99, 156, 0.15);
        border-color: #0e639c;
    }

    .connection-item.disabled {
        opacity: 0.5;
        cursor: not-allowed;
        pointer-events: none;
    }

    .connection-header {
        align-items: flex-start;
        gap: 8px;
    }

    .connection-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
    }

    .connected-badge {
        font-size: 11px;
    }

    .impersonate-checkbox-row { display: flex; align-items: center; gap: 6px; margin-top: 10px; font-size: 12px; }
    .impersonate-checkbox-row input { margin: 0; }
</style>`;

    const toolNameHtml = toolName ? `<p class="modal-eyebrow">${escapeHtml(toolName)}</p>` : `<p class="modal-eyebrow">Multi-Connection ${isSecondaryRequired ? "Required" : "Optional"}</p>`;

    const body = `

<div class="modal-panel">
    <div class="modal-header">
        <div>
            ${toolNameHtml}
            <h3>Select Connections</h3>
        </div>
        <button id="close-select-multi-connection-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body">
        <div class="info-message">
            This tool requires a primary connection${isSecondaryRequired ? " and a secondary connection" : ". A secondary connection is optional"}. Please select ${
                isSecondaryRequired ? "both connections" : "at least a primary connection"
            } to continue.
        </div>
        <div id="power-platform-api-info-multi" class="modal-warning" style="display: none; margin-bottom: 12px;">
            <span>This tool uses Power Platform API. Selecting a connection that is not enabled for PP API may cause issues while using this tool.</span>
        </div>
        
        <div class="modal-search-container">
            <div class="modal-search-bar">
                <div class="modal-search-input-wrapper">
                    <input type="text" id="multi-connection-search" class="modal-search-input" placeholder="Search connections..." />
                    <button type="button" id="multi-connection-search-clear" class="modal-search-clear-btn" aria-label="Clear connection search" title="Clear search">&times;</button>
                </div>
                <button type="button" id="multi-connection-filter-btn" class="modal-search-filter-btn" aria-label="Filters and sorting" aria-haspopup="true" aria-expanded="false" aria-controls="multi-connection-filter-dropdown">
                    <svg class="modal-filter-icon" viewBox="0 0 24 24" focusable="false">
                        <path d="M4 5h16l-6 7v5l-4 2v-7z" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
            <div class="modal-filter-dropdown" id="multi-connection-filter-dropdown" style="display: none;">
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Sort By</div>
                    <select id="multi-connection-sort" class="modal-filter-select">
                        <option value="last-used">Last Used</option>
                        <option value="name-asc">Name (A-Z)</option>
                        <option value="name-desc">Name (Z-A)</option>
                        <option value="environment">Environment Type</option>
                    </select>
                </div>
                <div class="modal-filter-divider"></div>
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Environment</div>
                    <select id="multi-connection-env-filter" class="modal-filter-select">
                        <option value="">All Environments</option>
                        <option value="Dev">Dev</option>
                        <option value="Test">Test</option>
                        <option value="UAT">UAT</option>
                        <option value="Production">Production</option>
                    </select>
                </div>
                <div class="modal-filter-divider"></div>
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Authentication</div>
                    <select id="multi-connection-auth-filter" class="modal-filter-select">
                        <option value="">All Auth Types</option>
                        <option value="interactive">Microsoft Login</option>
                        <option value="clientSecret">Client Secret</option>
                        <option value="usernamePassword">Username/Password</option>
                    </select>
                </div>
                <div class="modal-filter-divider"></div>
                <div class="modal-filter-section">
                    <div class="modal-filter-title">Category</div>
                    <select id="multi-connection-category-filter" class="modal-filter-select">
                        <option value="">All Categories</option>
                    </select>
                </div>
            </div>
        </div>
        
        <div class="connections-container">
            <div class="connection-section">
                <span class="section-label">
                    Primary Connection
                    <span class="connection-badge primary">Required</span>
                </span>
                <div id="primary-connections-list" class="connection-list">
                    <!-- Primary connections will be populated here -->
                </div>
            </div>

            <div class="connection-section">
                <span class="section-label">
                    Secondary Connection
                    <span class="connection-badge secondary">${isSecondaryRequired ? "Required" : "Optional"}</span>
                </span>
                <div id="secondary-connections-list" class="connection-list">
                    <!-- Secondary connections will be populated here -->
                </div>
            </div>
        </div>
    </div>
    <div class="modal-footer">
        <button id="cancel-select-multi-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button id="confirm-multi-connection-btn" class="fluent-button fluent-button-primary" disabled>Confirm</button>
    </div>

</div>`;

    return { styles, body };
}

function getConnectionSlotsModalView(isDarkTheme: boolean, options: SelectMultiConnectionModalOptions): ModalViewTemplate {
    const { minConnections, maxConnections } = options;
    const lastAssignedSlot = options.initialConnectionIds?.reduce((lastIndex, connectionId, index) => (connectionId ? index : lastIndex), -1) ?? -1;
    const initialSlotCount = Math.min(maxConnections, Math.max(minConnections, lastAssignedSlot + 1));
    const slots = Array.from({ length: initialSlotCount }, (_, index) => {
        const required = index < minConnections;
        const assigned = options.initialConnectionIds?.[index];
        return `<div class="connection-slot-row" data-slot-row="${index}">
            <button type="button" class="connection-slot-button" data-slot-index="${index}" aria-pressed="${index === 0 ? "true" : "false"}">
                <span class="connection-slot-number">${index + 1}</span>
                <span class="connection-slot-copy"><strong>Connection ${index + 1}</strong><small data-slot-name="${index}">${assigned ? escapeHtml(assigned) : "Not selected"}</small></span>
                <span class="connection-badge ${required ? "required" : "optional"}">${required ? "Required" : "Optional"}</span>
            </button>
            ${required ? "" : `<button type="button" class="connection-slot-clear" data-clear-slot="${index}" aria-label="Clear connection ${index + 1}" title="Clear slot">&times;</button>`}
        </div>`;
    }).join("");
    const toolNameHtml = options.toolName ? `<p class="modal-eyebrow">${escapeHtml(options.toolName)}</p>` : `<p class="modal-eyebrow">Select ${minConnections}–${maxConnections} connections</p>`;
    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .slot-selection-layout { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 16px; min-height: 0; flex: 1; }
    .connection-slot-rail { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; border-right: 1px solid ${isDarkTheme ? "#454545" : "#d1d1d1"}; padding-right: 12px; }
    .connection-slot-row { display: flex; gap: 4px; align-items: stretch; }
    .connection-slot-button { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 0; text-align: left; padding: 9px; color: inherit; border: 1px solid ${isDarkTheme ? "#454545" : "#d1d1d1"}; background: transparent; cursor: pointer; }
    .connection-slot-button[aria-pressed="true"] { border-color: #0f6cbd; background: ${isDarkTheme ? "#202d38" : "#edf6fc"}; }
    .connection-slot-number { display: grid; place-items: center; width: 26px; height: 26px; flex: 0 0 26px; border-radius: 2px; background: ${isDarkTheme ? "#3a3a3a" : "#e8e8e8"}; font-weight: 600; }
    .connection-slot-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
    .connection-slot-copy strong, .connection-slot-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .connection-slot-copy small { opacity: .75; }
    .connection-slot-indicators { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 0 auto; min-width: 16px; }
    .connection-slot-connected-check { display: inline-grid; place-items: center; width: 16px; height: 16px; flex: 0 0 16px; border-radius: 50%; background: ${isDarkTheme ? "#39734d" : "#d7f0dd"}; color: ${isDarkTheme ? "#a5e0b5" : "#176b35"}; font-size: 11px; }
    .connection-slot-impersonation-icon { display: block; width: 16px; height: 16px; flex: 0 0 16px; }
    .connection-badge { font-size: 10px; text-transform: uppercase; }
    .connection-badge.required { color: #b10e1e; }
    .connection-badge.optional { color: #616161; }
    .connection-slot-clear { width: 30px; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 18px; }
    .connection-slot-add { min-height: 38px; border: 1px dashed ${isDarkTheme ? "#666" : "#999"}; background: transparent; color: inherit; cursor: pointer; }
    .connection-slot-add:disabled { opacity: .45; cursor: default; }
    .slot-connections-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
    #active-connection-slot-label { display: block; margin: 0 0 12px; line-height: 1.35; }
    .slot-connections-pane .connection-list { flex: 1; min-height: 180px; overflow-y: auto; }
    .connection-selected-indicator { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 9px; border-radius: 3px; background: ${isDarkTheme ? "#24402f" : "#e6f4ea"}; color: ${isDarkTheme ? "#9bd4aa" : "#176b35"}; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .connection-selected-check { display: grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: ${isDarkTheme ? "#39734d" : "#cce8d3"}; font-size: 11px; }
    .slot-duplicate-warning { color: #9a6700; margin: 8px 0 14px; line-height: 1.4; }
    .slot-duplicate-card-note { display: flex; align-items: center; gap: 6px; margin: 7px 0 0 22px; line-height: 1.4; color: #9a6700; }
    @media (max-width: 720px) { .slot-selection-layout { grid-template-columns: 1fr; } .connection-slot-rail { border-right: 0; padding-right: 0; max-height: 190px; } }
</style>`;
    const body = `
<div class="modal-panel">
    <div class="modal-header"><div>${toolNameHtml}<h3>Select Connections</h3></div><button id="close-select-multi-connection-modal" class="icon-button" aria-label="Close">&times;</button></div>
    <div class="modal-body">
        <div class="info-message">Choose at least ${minConnections} connection${minConnections === 1 ? "" : "s"}. You can assign up to ${maxConnections} slots.</div>
        <div id="power-platform-api-info-multi" class="modal-warning" style="display:none;margin-bottom:12px"><span>This tool uses Power Platform API. Select connections enabled for PP API.</span></div>
        <div class="modal-search-container">
            <div class="modal-search-bar"><div class="modal-search-input-wrapper"><input type="text" id="multi-connection-search" class="modal-search-input" placeholder="Search connections..." /><button type="button" id="multi-connection-search-clear" class="modal-search-clear-btn" aria-label="Clear connection search" title="Clear search">&times;</button></div><button type="button" id="multi-connection-filter-btn" class="modal-search-filter-btn" aria-label="Filters and sorting" aria-haspopup="true" aria-expanded="false" aria-controls="multi-connection-filter-dropdown"><svg class="modal-filter-icon" viewBox="0 0 24 24" focusable="false"><path d="M4 5h16l-6 7v5l-4 2v-7z" stroke-linejoin="round"></path></svg></button></div>
            <div class="modal-filter-dropdown" id="multi-connection-filter-dropdown" style="display:none">
                <div class="modal-filter-section"><div class="modal-filter-title">Sort By</div><select id="multi-connection-sort" class="modal-filter-select"><option value="last-used">Last Used</option><option value="name-asc">Name (A-Z)</option><option value="name-desc">Name (Z-A)</option><option value="environment">Environment Type</option></select></div>
                <div class="modal-filter-divider"></div><div class="modal-filter-section"><div class="modal-filter-title">Environment</div><select id="multi-connection-env-filter" class="modal-filter-select"><option value="">All Environments</option><option value="Dev">Dev</option><option value="Test">Test</option><option value="UAT">UAT</option><option value="Production">Production</option></select></div>
                <div class="modal-filter-divider"></div><div class="modal-filter-section"><div class="modal-filter-title">Authentication</div><select id="multi-connection-auth-filter" class="modal-filter-select"><option value="">All Auth Types</option><option value="interactive">Microsoft Login</option><option value="clientSecret">Client Secret</option><option value="usernamePassword">Username/Password</option></select></div>
                <div class="modal-filter-divider"></div><div class="modal-filter-section"><div class="modal-filter-title">Category</div><select id="multi-connection-category-filter" class="modal-filter-select"><option value="">All Categories</option></select></div>
            </div>
        </div>
        <div class="slot-selection-layout">
            <div id="connection-slot-rail" class="connection-slot-rail">${slots}<button id="add-connection-slot-btn" class="connection-slot-add" type="button" ${initialSlotCount >= maxConnections ? "disabled" : ""}>+ Add connection</button></div>
            <div class="slot-connections-pane"><strong id="active-connection-slot-label">Connection 1</strong><p id="slot-duplicate-warning" class="slot-duplicate-warning" hidden>This connection is assigned to another slot.</p><div id="slot-connection-list" class="connection-list"><div class="empty-state">Loading connections...</div></div></div>
        </div>
    </div>
    <div class="modal-footer"><button id="cancel-select-multi-connection-btn" class="fluent-button fluent-button-secondary">Cancel</button><button id="confirm-multi-connection-btn" class="fluent-button fluent-button-primary" disabled>Confirm</button></div>
</div>`;
    return { styles, body };
}
