/**
 * Filesystem utility functions
 */

import { dialog } from "electron";
import * as fs from "fs/promises";
import * as fsSync from "fs";

/**
 * Read a file as UTF-8 text
 * Ideal for configs (pcfconfig.json, package.json)
 */
export async function readText(filePath: string): Promise<string> {
    try {
        return await fs.readFile(filePath, "utf-8");
    } catch (error) {
        throw new Error(`Failed to read file as text: ${(error as Error).message}`);
    }
}

/**
 * Read a file as raw binary data
 * For images, ZIPs, manifests that need to be hashed, uploaded, or parsed as non-text
 */
export async function readBinary(filePath: string): Promise<ArrayBuffer> {
    try {
        const buffer = await fs.readFile(filePath);
        return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    } catch (error) {
        throw new Error(`Failed to read file as binary: ${(error as Error).message}`);
    }
}

/**
 * Check if a file or directory exists
 * Lightweight existence check before attempting reads/writes
 */
export async function exists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get file or directory metadata
 * Confirms users picked the correct folder/file and shows info in UI
 */
export async function stat(filePath: string): Promise<{ type: "file" | "directory"; size: number; mtime: string }> {
    try {
        const stats = await fs.stat(filePath);
        return {
            type: stats.isDirectory() ? "directory" : "file",
            size: stats.size,
            mtime: stats.mtime.toISOString(),
        };
    } catch (error) {
        throw new Error(`Failed to get file stats: ${(error as Error).message}`);
    }
}

/**
 * Read directory contents
 * Enumerate folder contents when tools need to show selectable files or validate structure
 */
export async function readDirectory(dirPath: string): Promise<Array<{ name: string; type: "file" | "directory" }>> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map((entry) => ({
            name: entry.name,
            type: entry.isDirectory() ? "directory" : "file",
        }));
    } catch (error) {
        throw new Error(`Failed to read directory: ${(error as Error).message}`);
    }
}

/**
 * Write text content to a file
 * Save generated files (manifests, logs) without forcing users through save dialog
 */
export async function writeText(filePath: string, content: string): Promise<void> {
    try {
        await fs.writeFile(filePath, content, "utf-8");
    } catch (error) {
        throw new Error(`Failed to write text file: ${(error as Error).message}`);
    }
}

/**
 * Create a directory (recursive)
 * Ensure target folders exist before writing scaffolding artifacts
 */
export async function createDirectory(dirPath: string): Promise<void> {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        throw new Error(`Failed to create directory: ${(error as Error).message}`);
    }
}

/**
 * Save file dialog and write content
 * MOVED FROM utils namespace - no backward compatibility
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
        fsSync.writeFileSync(result.filePath, content);
        return result.filePath;
    } catch (error) {
        throw new Error(`Failed to save file: ${(error as Error).message}`);
    }
}

/**
 * Open a system dialog to select a file or folder
 * MOVED FROM utils namespace - no backward compatibility
 */
export async function selectPath(options?: {
    type?: "file" | "folder";
    title?: string;
    message?: string;
    buttonLabel?: string;
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
}): Promise<string | null> {
    const selectionType = options?.type ?? "file";
    const properties: Array<"openFile" | "openDirectory" | "promptToCreate" | "createDirectory"> = selectionType === "folder" ? ["openDirectory", "createDirectory"] : ["openFile"];

    const result = await dialog.showOpenDialog({
        title: options?.title,
        message: options?.message,
        buttonLabel: options?.buttonLabel,
        defaultPath: options?.defaultPath,
        filters: selectionType === "file" ? options?.filters : undefined,
        properties,
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    return result.filePaths[0];
}

/**
 * Open directory picker dialog
 * @deprecated Use selectPath({ type: 'folder' }) instead
 */
export async function openDirectoryPicker(title?: string, message?: string): Promise<string | null> {
    return selectPath({ type: "folder", title: title || "Select Directory", message });
}
