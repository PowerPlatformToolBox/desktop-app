/**
 * Shared modal styling that adapts to theme
 * Used across all modal dialogs for consistent appearance
 */

/**
 * Generate theme-aware styles for modal windows
 * @param isDarkTheme - Whether the modal should use dark theme
 * @returns CSS styles as a string
 */
export function getModalStyles(isDarkTheme: boolean): string {
    return `
<style>
    :root {
        /* Enable native browser theming for built-in UI elements (inputs, selects, scrollbars) to match the theme */
        color-scheme: ${isDarkTheme ? "dark" : "light"};
    }

    * {
        box-sizing: border-box;
    }

    body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: ${isDarkTheme ? "#f3f3f3" : "#1f1f1f"};
    }

    .modal-panel {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 24px;
        background: ${isDarkTheme ? "#1f1f23" : "#ffffff"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 30px 80px rgba(0, 0, 0, ${isDarkTheme ? "0.6" : "0.15"});
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
    }

    .modal-eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 11px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin: 0;
    }

    .modal-header h3 {
        margin: 4px 0 0;
        font-size: 20px;
        font-weight: 600;
    }

    .icon-button {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        border: none;
        color: ${isDarkTheme ? "#fff" : "#000"};
        width: 32px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
    }

    .icon-button:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.18)" : "rgba(0, 0, 0, 0.18)"};
    }

    .modal-body {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
    }

    .form-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 16px;
    }

    label {
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.8)"};
    }

    .modal-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
        font-size: 14px;
    }
    .modal-input::placeholder {
        color: ${isDarkTheme ? "rgba(226, 217, 217, 0.7)" : "rgba(96, 94, 92, 0.3)"};
    }

    .modal-input:focus {
        outline: 2px solid #0e639c;
        border-color: transparent;
    }

    .field-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 12px;
        border-radius: 12px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
        margin-bottom: 16px;
    }

    .password-wrapper {
        position: relative;
    }

    .password-toggle-btn {
        position: absolute;
        right: 10px;
        top: 50%;
        transform: translateY(-50%);
        border: none;
        background: transparent;
        cursor: pointer;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.7)"};
        font-size: 16px;
    }

    .modal-footer {
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: flex-end;
        flex-wrap: wrap;
    }

    .footer-spacer {
        flex: 1;
    }

    .modal-feedback {
        display: none;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 77, 109, 0.35);
        background: rgba(255, 77, 109, 0.12);
        color: #ffb3c1;
        font-size: 13px;
        line-height: 1.4;
    }

    .modal-warning {
        display: none;
        padding: 10px 12px;
        margin-bottom: 12px;
        border-radius: 8px;
        border: 1px solid rgba(255, 185, 0, 0.35);
        background: rgba(255, 185, 0, 0.12);
        color: ${isDarkTheme ? "#ffc83d" : "#8b6500"};
        font-size: 13px;
        line-height: 1.4;
    }

    .fluent-button {
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        padding: 10px 18px;
        cursor: pointer;
        transition: background 0.2s ease, color 0.2s ease;
    }

    .fluent-button-primary {
        background: #0e639c;
        color: #fff;
    }

    .fluent-button-secondary {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .fluent-button-secondary:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"};
    }

    .fluent-button-ghost {
        background: transparent;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.8)"};
    }

    .section-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
    }

    .helper-text {
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin-top: -6px;
        margin-bottom: 8px;
    }

    select.modal-input option {
        background: ${isDarkTheme ? "#1f1f23" : "#fff"};
        color: ${isDarkTheme ? "#fff" : "#000"};
    }

    .empty-state {
        text-align: center;
        padding: 40px 20px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
    }

    .empty-state p {
        margin: 8px 0;
    }

    .empty-state-hint {
        font-size: 13px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
    }

    .connection-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .connection-card {
        padding: 16px;
        border-radius: 12px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 2px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .connection-card:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)"};
        border-color: #0e639c;
    }

    .connection-card.selected {
        background: rgba(14, 99, 156, 0.15);
        border-color: #0e639c;
    }

    .connection-name {
        font-weight: 600;
        font-size: 14px;
        margin-bottom: 4px;
    }

    .connection-url {
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
        margin-bottom: 8px;
    }

    .connection-env-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .env-dev {
        background: ${isDarkTheme ? "rgba(76, 175, 80, 0.25)" : "rgba(76, 175, 80, 0.2)"};
        color: ${isDarkTheme ? "#81c784" : "#2e7d32"};
    }

    .env-test {
        background: ${isDarkTheme ? "rgba(255, 167, 38, 0.25)" : "rgba(255, 152, 0, 0.2)"};
        color: ${isDarkTheme ? "#ffb74d" : "#e65100"};
    }

    .env-uat {
        background: ${isDarkTheme ? "rgba(33, 150, 243, 0.25)" : "rgba(33, 150, 243, 0.2)"};
        color: ${isDarkTheme ? "#64b5f6" : "#0d47a1"};
    }

    .env-production {
        background: ${isDarkTheme ? "rgba(244, 67, 54, 0.25)" : "rgba(244, 67, 54, 0.2)"};
        color: ${isDarkTheme ? "#ef9a9a" : "#b71c1c"};
    }

    .env-sandbox {
        background: ${isDarkTheme ? "rgba(2, 136, 209, 0.2)" : "rgba(2, 119, 189, 0.2)"};
        color: ${isDarkTheme ? "#0288d1" : "#0277bd"};
    }

    .env-development {
        background: rgba(46, 125, 50, 0.2);
        color: #2e7d32;
    }

    .connection-item {
        padding: 12px;
        border-radius: 8px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.03)" : "rgba(0, 0, 0, 0.03)"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        cursor: pointer;
        transition: all 0.2s ease;
        margin-bottom: 10px;
    }

    .connection-item:hover {
        background: rgba(0, 120, 212, 0.06);
        border-color: rgba(0, 120, 212, 0.4);
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
    }

    .connection-item.active {
        background: rgba(0, 120, 212, 0.1);
        border-left: 3px solid #0e639c;
    }

    .connection-item.selected {
        background: rgba(14, 99, 156, 0.25);
        border-color: #1177bb;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.12);
    }

    .connection-item-top-tags {
        display: flex;
        gap: 6px;
        margin-bottom: 8px;
    }

    .connection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
    }

    .connection-name {
        font-weight: 500;
        font-size: 13px;
    }

    .connection-url {
        font-size: 11px;
        color: #8a8886;
        margin-bottom: 6px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .connection-item-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .connection-item-meta-left {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .connection-meta {
        display: flex;
        gap: 8px;
        font-size: 12px;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.5)" : "rgba(0, 0, 0, 0.5)"};
    }

    .connection-meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .auth-type-badge {
        padding: 2px 8px;
        border-radius: 4px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        font-size: 11px;
    }

    .fluent-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .fluent-button-secondary:hover:not(:disabled) {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.2)"};
    }

    .info-message {
        padding: 12px;
        border-radius: 8px;
        background: rgba(14, 99, 156, 0.12);
        border: 1px solid rgba(14, 99, 156, 0.3);
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.9)" : "rgba(0, 0, 0, 0.9)"};
        font-size: 13px;
        line-height: 1.5;
        margin-bottom: 16px;
    }

    .modal-search-container {
        position: relative;
        margin-bottom: 16px;
    }

    .modal-search-bar {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .modal-search-input {
        flex: 1;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.03)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
        font-size: 14px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }

    .modal-search-input:focus {
        outline: none;
        border-color: #0e639c;
        box-shadow: 0 0 0 1px #0e639c;
    }

    .modal-search-filter-btn {
        width: 38px;
        height: 36px;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: transparent;
        color: ${isDarkTheme ? "#fff" : "#000"};
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background 0.2s ease, border-color 0.2s ease;
    }

    .modal-search-filter-btn:hover {
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.06)"};
        border-color: #0e639c;
    }

    .modal-search-filter-btn.active {
        background: #0e639c;
        color: #fff;
        border-color: #0e639c;
    }

    .modal-filter-icon {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.6;
    }

    .modal-filter-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 280px;
        background: ${isDarkTheme ? "#26262b" : "#ffffff"};
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.12)"};
        border-radius: 10px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, ${isDarkTheme ? "0.65" : "0.15"});
        padding: 8px 0;
        z-index: 1000;
    }

    .modal-filter-section {
        padding: 8px 16px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .modal-filter-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: ${isDarkTheme ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"};
    }

    .modal-filter-select {
        width: 100%;
        padding: 7px 10px;
        border-radius: 8px;
        border: 1px solid ${isDarkTheme ? "rgba(255, 255, 255, 0.16)" : "rgba(0, 0, 0, 0.16)"};
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.04)" : "rgba(0, 0, 0, 0.03)"};
        color: ${isDarkTheme ? "#fff" : "#000"};
        font-size: 13px;
    }

    .modal-filter-divider {
        height: 1px;
        background: ${isDarkTheme ? "rgba(255, 255, 255, 0.08)" : "rgba(0, 0, 0, 0.08)"};
        margin: 4px 0;
    }
</style>`;
}
