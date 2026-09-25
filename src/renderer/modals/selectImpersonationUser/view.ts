import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ImpersonationUserListItem {
    systemuserid: string;
    fullname: string;
    internalemailaddress?: string;
}

/** Describes which connection the picker is choosing an impersonation user for, so the modal can call it out (important when picking for both a primary and secondary connection). */
export interface ImpersonationPickerContext {
    connectionName: string;
    environment?: string;
    /** e.g. "Primary Connection" / "Secondary Connection" - omitted for single-connection tools. */
    connectionRoleLabel?: string;
}

export function getSelectImpersonationUserModalView(isDarkTheme: boolean, users: ImpersonationUserListItem[], context?: ImpersonationPickerContext): { styles: string; body: string } {
    const rows = users
        .map(
            (user, index) => `
                <button type="button" class="user-row" data-index="${index}" data-search="${escapeHtml(`${user.fullname} ${user.internalemailaddress ?? ""}`)}">
                    <strong>${escapeHtml(user.fullname)}</strong>
                    ${user.internalemailaddress ? `<span>${escapeHtml(user.internalemailaddress)}</span>` : ""}
                </button>`,
        )
        .join("");

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .impersonation-user-modal-body { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .impersonation-user-intro { flex: 0 0 auto; margin-bottom: 12px; }
    .impersonation-user-filter { flex: 0 0 auto; padding-bottom: 12px; }
    .user-search { width: 100%; margin: 0; }
    .user-list { display: grid; align-content: start; grid-auto-rows: 38px; gap: 4px; overflow-y: auto; min-height: 0; flex: 1; padding: 2px 4px 4px 0; }
    .user-row { display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px; width: 100%; height: 38px; min-height: 38px; padding: 0 12px; text-align: left; overflow: hidden; border: 1px solid ${isDarkTheme ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.16)"}; border-radius: 6px; background: ${isDarkTheme ? "rgba(255,255,255,.05)" : "#fff"}; color: ${isDarkTheme ? "#f3f3f3" : "#1f1f1f"}; cursor: pointer; font: inherit; transition: background-color 120ms ease, border-color 120ms ease; }
    .user-row:hover { background: ${isDarkTheme ? "rgba(255,255,255,.1)" : "#f5f5f5"}; border-color: #0e639c; }
    .user-row:focus { outline: 2px solid #0e639c; outline-offset: 1px; }
    .user-row strong { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; }
    .user-row span { flex: 0 1 auto; min-width: 0; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; color: ${isDarkTheme ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.6)"}; font-size: 12px; }
    .empty-users { padding: 32px 8px; text-align: center; color: ${isDarkTheme ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.6)"}; display: none; }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">${context ? escapeHtml(`${context.connectionName}${context.environment ? ` (${context.environment})` : ""}${context.connectionRoleLabel ? ` \u00b7 ${context.connectionRoleLabel}` : ""}`) : "Dataverse"}</p>
            <h3>Impersonate User</h3>
        </div>
        <button id="close-select-impersonation-user-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body impersonation-user-modal-body">
        <div class="info-message impersonation-user-intro">Optionally select a Dataverse user to impersonate for ${context ? `<strong>${escapeHtml(context.connectionName)}</strong>${context.connectionRoleLabel ? ` (${escapeHtml(context.connectionRoleLabel)})` : ""}` : "this connection"}.</div>
        <div class="impersonation-user-filter">
            <div class="modal-search-input-wrapper">
                <input id="select-impersonation-user-search" class="modal-search-input user-search" type="search" placeholder="Filter by name or email..." aria-label="Filter Dataverse users" autocomplete="off" />
            </div>
        </div>
        <div id="impersonation-users-list" class="user-list">${rows}</div>
        <div id="impersonation-users-empty" class="empty-users">No matching users.</div>
    </div>
    <div class="modal-footer">
        <button id="skip-select-impersonation-user-btn" class="fluent-button fluent-button-secondary">Skip</button>
    </div>
</div>`;

    return { styles, body };
}
