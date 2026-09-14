import { escapeHtml } from "../../utils/toolIconResolver";
import { getModalStyles } from "../sharedStyles";

export interface ModalViewTemplate {
    styles: string;
    body: string;
}

export interface DebugToolTrustModalViewModel {
    /** Absolute, resolved path of the folder about to be mounted. */
    resolvedPath: string;
    /** package.json `name` at that path. */
    packageName: string;
    /** Display name to show as the heading (falls back to the package name). */
    displayName: string;
    /** package.json `version` at that path. */
    version: string;
    /** Name of the connection that will be preselected, when `--debug-tool-connection` was supplied. */
    connectionName?: string | null;
    /** Environment/category label for the target connection, when known. */
    connectionEnvironment?: string | null;
    /** True when this path was previously trusted under a different package name. */
    packageNameChanged?: boolean;
    isDarkTheme: boolean;
}

/**
 * Returns the view markup (styles + body) for the CLI debug-tool trust prompt.
 *
 * This prompt is shown before anything is mounted, for the command-line path only.
 * The Browse -> Load Tool button keeps its native directory dialog as the consent step.
 */
export function getDebugToolTrustModalView(model: DebugToolTrustModalViewModel): ModalViewTemplate {
    const isDarkTheme = model.isDarkTheme;

    const styles =
        getModalStyles(isDarkTheme) +
        `
<style>
    .modal-header h3 {
        color: #ffb900;
    }

    .modal-body {
        font-size: 13px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
        min-height: 0;
    }

    .trust-tool-name {
        font-weight: 600;
        font-size: 15px;
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .trust-tool-meta {
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
    }

    .trust-field-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.45)"};
        margin: 0 0 4px;
    }

    .trust-path {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border-radius: 8px;
        padding: 8px 12px;
        font-family: "Consolas", "Monaco", "Courier New", monospace;
        font-size: 12px;
        word-break: break-all;
        margin: 0;
    }

    .trust-warning {
        border: 1px solid ${isDarkTheme ? "rgba(255, 185, 0, 0.35)" : "rgba(200, 140, 0, 0.35)"};
        background: ${isDarkTheme ? "rgba(255, 185, 0, 0.1)" : "rgba(255, 185, 0, 0.12)"};
        border-radius: 8px;
        padding: 10px 12px;
        margin: 0;
        line-height: 1.5;
    }

    .trust-connection {
        border: 1px solid ${isDarkTheme ? "rgba(76, 194, 255, 0.25)" : "rgba(0, 110, 200, 0.25)"};
        background: ${isDarkTheme ? "rgba(76, 194, 255, 0.08)" : "rgba(0, 110, 200, 0.06)"};
        border-radius: 8px;
        padding: 10px 12px;
        margin: 0;
        line-height: 1.5;
    }

    .trust-note {
        margin: 0;
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        line-height: 1.5;
    }
</style>`;

    const connectionBlock = model.connectionName
        ? `<p class="trust-connection">This tool will be launched against <strong>${escapeHtml(model.connectionName)}</strong>${
              model.connectionEnvironment ? ` (${escapeHtml(model.connectionEnvironment)})` : ""
          } and can read and write data in that environment.</p>`
        : "";

    const renameBlock = model.packageNameChanged
        ? `<p class="trust-warning">The package name at this folder has changed since you trusted it. Confirm this is still your tool before continuing.</p>`
        : "";

    const body = `
<div class="modal-panel">
    <div class="modal-header">
        <div>
            <p class="modal-eyebrow">Local tool</p>
            <h3>Trust this folder?</h3>
        </div>
        <button class="icon-button" id="debug-trust-close-btn" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
        <div>
            <div class="trust-tool-name">${escapeHtml(model.displayName)}</div>
            <div class="trust-tool-meta">${escapeHtml(model.packageName)} · v${escapeHtml(model.version)}</div>
        </div>

        ${renameBlock}

        <div>
            <p class="trust-field-label">Folder</p>
            <p class="trust-path">${escapeHtml(model.resolvedPath)}</p>
        </div>

        <p class="trust-warning">Local tools run with full access to your files, terminal, and the selected Dataverse environment. Only continue if you wrote this tool or trust its source.</p>

        ${connectionBlock}

        <p class="trust-note">This was requested from the command line with <code>--debug-tool</code>. You will be asked once for each folder and connection authorization; you can revoke it later in Settings.</p>
    </div>
    <div class="modal-footer">
        <button type="button" id="debug-trust-cancel-btn" class="fluent-button fluent-button-secondary">Cancel</button>
        <button type="button" id="debug-trust-accept-btn" class="fluent-button fluent-button-primary">Trust this folder</button>
    </div>
</div>`;

    return { styles, body };
}
