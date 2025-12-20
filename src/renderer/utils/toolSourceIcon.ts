/**
 * Utility functions for generating tool source icons
 */

/**
 * Generate source icon HTML based on tool ID
 * @param toolId - The tool ID (e.g., "local-mytool", "npm-mytool", or "registry-tool-id")
 * @returns HTML string with source icon and tooltip
 */
export function getToolSourceIconHtml(toolId: string): string {
    if (toolId.startsWith("local-")) {
        // Local development tool
        return `<span class="tool-source-icon" title="Local Development Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1h8.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3H3v11h10V6h-2.5A.5.5 0 0110 5.5V4.5z"/>
            </svg>
        </span>`;
    } else if (toolId.startsWith("npm-")) {
        // NPM installed tool
        return `<span class="tool-source-icon" title="NPM Package Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm1 1h8v8H4V4zm1 1v6h2V6h2v5h2V5H5z"/>
            </svg>
        </span>`;
    } else {
        // Registry tool (official)
        return `<span class="tool-source-icon" title="Official Registry Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1a7 7 0 11-7 7 7 7 0 017-7zm0 2a5 5 0 100 10 5 5 0 000-10zm0 1a4 4 0 11-4 4 4 4 0 014-4z"/>
            </svg>
        </span>`;
    }
}

/**
 * Generate source icon HTML for tool detail modal based on tool ID
 * Uses same icon generation as sidebar, but with modal-specific class
 * @param toolId - The tool ID (e.g., "local-mytool", "npm-mytool", or "registry-tool-id")
 * @returns HTML string with source icon and tooltip for modal display
 */
export function getToolDetailSourceIconHtml(toolId: string): string {
    if (toolId.startsWith("local-")) {
        // Local development tool
        return `<span class="tool-detail-source-icon" title="Local Development Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 4.5V14a1 1 0 01-1 1H3a1 1 0 01-1-1V2a1 1 0 011-1h8.5L14 4.5zm-3 0A1.5 1.5 0 019.5 3H3v11h10V6h-2.5A.5.5 0 0110 5.5V4.5z"/>
            </svg>
        </span>`;
    } else if (toolId.startsWith("npm-")) {
        // NPM installed tool
        return `<span class="tool-detail-source-icon" title="NPM Package Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 2h12v12H2V2zm1 1v10h10V3H3zm1 1h8v8H4V4zm1 1v6h2V6h2v5h2V5H5z"/>
            </svg>
        </span>`;
    } else {
        // Registry tool (official)
        return `<span class="tool-detail-source-icon" title="Official Registry Tool">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 1a7 7 0 11-7 7 7 7 0 017-7zm0 2a5 5 0 100 10 5 5 0 000-10zm0 1a4 4 0 11-4 4 4 4 0 014-4z"/>
            </svg>
        </span>`;
    }
}
