/**
 * Filesystem utility functions
 */

import { dialog } from "electron";
import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";

/**
 * Get system directories that should not be accessed
 */
function getSystemDirectories(): string[] {
    const systemDirs: string[] = [];

    if (process.platform === "win32") {
        systemDirs.push("C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)");
    } else if (process.platform === "darwin") {
        systemDirs.push("/System", "/Library", "/private", "/usr", "/bin", "/sbin");
    } else {
        systemDirs.push("/bin", "/sbin", "/usr", "/lib", "/lib64", "/boot", "/sys", "/proc");
    }

    return systemDirs;
}

/**
 * Validate path for security - prevents path traversal and access to system directories
 */
function isPathSafe(filePath: string): boolean {
    // Resolve to absolute path
    const resolvedPath = path.resolve(filePath);

    // Ensure path is absolute after resolution
    if (!path.isAbsolute(resolvedPath)) {
        return false;
    }

    // Check if path contains null bytes (security check)
    if (resolvedPath.includes("\0")) {
        return false;
    }

    // Don't allow access to system directories
    const systemDirs = getSystemDirectories();
    const lowerPath = resolvedPath.toLowerCase();

    for (const sysDir of systemDirs) {
        if (lowerPath.startsWith(sysDir.toLowerCase())) {
            return false;
        }
    }

    return true;
}

/**
 * Read a file as UTF-8 text
 * Ideal for configs (pcfconfig.json, package.json)
 */
export async function readText(filePath: string): Promise<string> {
    if (!isPathSafe(filePath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

    try {
        return await fs.readFile(filePath, "utf-8");
    } catch (error) {
        throw new Error(`Failed to read file as text: ${(error as Error).message}`);
    }
}

/**
 * Read a file as raw binary data
 * For images, ZIPs, manifests that need to be hashed, uploaded, or parsed as non-text
 * Returns a Buffer which Electron can properly serialize over IPC
 */
export async function readBinary(filePath: string): Promise<Buffer> {
    if (!isPathSafe(filePath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

    try {
        return await fs.readFile(filePath);
    } catch (error) {
        throw new Error(`Failed to read file as binary: ${(error as Error).message}`);
    }
}

/**
 * Check if a file or directory exists
 * Lightweight existence check before attempting reads/writes
 */
export async function exists(filePath: string): Promise<boolean> {
    if (!isPathSafe(filePath)) {
        return false;
    }

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
    if (!isPathSafe(filePath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

    try {
        const stats = await fs.stat(filePath);

        let type: "file" | "directory";
        if (stats.isDirectory()) {
            type = "directory";
        } else if (stats.isFile()) {
            type = "file";
        } else {
            throw new Error("Unsupported file system entry type (not a regular file or directory)");
        }

        return {
            type,
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
 * Only returns regular files and directories, skips symbolic links and other special entries
 */
export async function readDirectory(dirPath: string): Promise<Array<{ name: string; type: "file" | "directory" }>> {
    if (!isPathSafe(dirPath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
            .filter((entry) => entry.isFile() || entry.isDirectory())
            .map((entry) => ({
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
    if (!isPathSafe(filePath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

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
    if (!isPathSafe(dirPath)) {
        throw new Error("Access to the specified path is not allowed for security reasons");
    }

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
export async function saveFile(defaultPath: string, content: string | Buffer, filters?: Array<{ name: string; extensions: string[] }>): Promise<string | null> {
    // Determine filters to use
    let dialogFilters: Array<{ name: string; extensions: string[] }>;

    if (filters && filters.length > 0) {
        // Use provided filters
        dialogFilters = filters;
    } else {
        // Try to derive filter from filename extension using path.extname for robust extraction
        const ext = path.extname(defaultPath).slice(1).toLowerCase(); // Remove leading dot
        if (ext) {
            // Create a filter based on the extension
            const extensionName = ext.toUpperCase();
            dialogFilters = [
                { name: `${extensionName} Files`, extensions: [ext] },
                { name: "All Files", extensions: ["*"] },
            ];
        } else {
            // No extension, use default filters
            dialogFilters = [
                { name: "All Files", extensions: ["*"] },
                { name: "Text Files", extensions: ["txt"] },
                { name: "JSON Files", extensions: ["json"] },
                { name: "XML Files", extensions: ["xml"] },
                { name: "CSV Files", extensions: ["csv"] },
            ];
        }
    }

    const result = await dialog.showSaveDialog({
        defaultPath,
        filters: dialogFilters,
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
