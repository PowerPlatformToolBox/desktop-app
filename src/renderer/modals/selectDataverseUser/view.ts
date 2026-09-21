import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface DataverseUserListItem {
    systemuserid: string;
    fullname: string;
    internalemailaddress?: string;
}

export function getSelectDataverseUserModalView(isDarkTheme: boolean, users: DataverseUserListItem[]): { styles: string; body: string } {
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
    .dataverse-user-modal-body { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
    .dataverse-user-intro { flex: 0 0 auto; margin-bottom: 12px; }
    .dataverse-user-filter { flex: 0 0 auto; padding-bottom: 12px; background: ${isDarkTheme ? "#1f1f23" : "#ffffff"}; }
    .user-search { width: 100%; margin: 0; }
    .user-list { display: grid; align-content: start; grid-auto-rows: 64px; gap: 8px; overflow-y: auto; min-height: 0; flex: 1; padding: 2px 4px 4px 0; }
    .user-row { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; width: 100%; height: 64px; min-height: 64px; padding: 10px 14px; text-align: left; overflow: hidden; border: 1px solid ${isDarkTheme ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.16)"}; border-radius: 6px; background: ${isDarkTheme ? "rgba(255,255,255,.05)" : "#fff"}; color: ${isDarkTheme ? "#f3f3f3" : "#1f1f1f"}; cursor: pointer; font: inherit; transition: background-color 120ms ease, border-color 120ms ease; }
    .user-row:hover { background: ${isDarkTheme ? "rgba(255,255,255,.1)" : "#f5f5f5"}; border-color: #0e639c; }
    .user-row:focus { outline: 2px solid #0e639c; outline-offset: 1px; }
    .user-row strong, .user-row span { display: block; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .user-row span { margin-top: 3px; color: ${isDarkTheme ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.6)"}; font-size: 12px; }
    .empty-users { padding: 32px 8px; text-align: center; color: ${isDarkTheme ? "rgba(255,255,255,.65)" : "rgba(0,0,0,.6)"}; display: none; }
</style>`;

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Dataverse</p>
            <h3>Select User</h3>
        </div>
        <button id="close-select-dataverse-user-modal" class="icon-button" aria-label="Close">&times;</button>
    </div>
    <div class="modal-body dataverse-user-modal-body">
        <div class="info-message dataverse-user-intro">Select the Dataverse user to use for the primary tool connection.</div>
        <div class="dataverse-user-filter">
            <div class="modal-search-input-wrapper">
                <input id="select-dataverse-user-search" class="modal-search-input user-search" type="search" placeholder="Filter by name or email..." aria-label="Filter Dataverse users" autocomplete="off" />
            </div>
        </div>
        <div id="dataverse-users-list" class="user-list">${rows}</div>
        <div id="dataverse-users-empty" class="empty-users">No matching users.</div>
    </div>
    <div class="modal-footer">
        <button id="cancel-select-dataverse-user-btn" class="fluent-button fluent-button-secondary">Cancel</button>
    </div>
</div>`;

    return { styles, body };
}
