/**
 * Filesystem utility functions
 */

import { dialog } from "electron";
import * as fs from "fs";

/**
 * Save file dialog and write content
 */
export async function saveFile(defaultPath: string, content: string | Buffer): Promise<string | null> {
    const result = await dialog.showSaveDialog({
        defaultPath,
        filters: [
            { name: "All Files", extensions: ["*"] },
            { name: "Text Files", extensions: ["txt"] },
            { name: "JSON Files", extensions: ["json"] },
            { name: "XML Files", extensions: ["xml"] },
            { name: "CSV Files", extensions: ["csv"] },
        ],
    });

    if (result.canceled || !result.filePath) {
        return null;
    }

    try {
        fs.writeFileSync(result.filePath, content);
        return result.filePath;
    } catch (error) {
        throw new Error(`Failed to save file: ${(error as Error).message}`);
    }
}

/**
 * Open directory picker dialog
 */
export async function openDirectoryPicker(title?: string, message?: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({
        properties: ["openDirectory"],
        title: title || "Select Directory",
        message: message,
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
}
