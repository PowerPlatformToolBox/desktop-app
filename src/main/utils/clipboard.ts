/**
 * Clipboard utility functions
 */

import { clipboard } from "electron";

/**
 * Copy text to clipboard
 */
export function copyToClipboard(text: string): void {
    clipboard.writeText(text);
}

/**
 * Read text from clipboard
 */
export function readFromClipboard(): string {
    return clipboard.readText();
}
