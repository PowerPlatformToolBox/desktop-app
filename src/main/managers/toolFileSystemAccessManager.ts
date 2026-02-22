import * as path from "path";
import { logInfo, logWarn } from "../../common/sentryHelper";

/**
 * Manages filesystem access permissions for tools
 * Implements a user-consent model where tools can only access paths explicitly selected by users
 * Similar to VS Code Extension Host security model
 * 
 * Access is tracked per tool instance (instanceId) to support multiple instances of the same tool
 */
export class ToolFileSystemAccessManager {
    // Map: instanceId -> Set of allowed absolute paths
    private allowedPaths: Map<string, Set<string>> = new Map();

    /**
     * Grant access to a path for a specific tool instance
     * Called automatically when user selects a path via selectPath() or saveFile()
     */
    grantAccess(instanceId: string, filePath: string): void {
        const resolvedPath = path.resolve(filePath);

        if (!this.allowedPaths.has(instanceId)) {
            this.allowedPaths.set(instanceId, new Set());
        }

        this.allowedPaths.get(instanceId)!.add(resolvedPath);
        logInfo(`[ToolFilesystemAccess] Granted access to tool instance ${instanceId}: ${resolvedPath}`);
    }

    /**
     * Check if a tool instance has access to a specific path
     * Access is granted if:
     * 1. The exact path was user-selected
     * 2. The path is a descendant of a user-selected directory
     */
    canAccess(instanceId: string, targetPath: string): boolean {
        const allowedSet = this.allowedPaths.get(instanceId);
        if (!allowedSet || allowedSet.size === 0) {
            return false;
        }

        const resolvedTarget = path.resolve(targetPath);

        // Check if the target path matches or is within any allowed path
        for (const allowedPath of allowedSet) {
            // Exact match
            if (resolvedTarget === allowedPath) {
                return true;
            }

            // Check if target is a descendant of allowed directory
            // Use path separators to ensure we're checking directory boundaries
            const relativePath = path.relative(allowedPath, resolvedTarget);
            const isDescendant = !relativePath.startsWith("..") && !path.isAbsolute(relativePath);

            if (isDescendant) {
                return true;
            }
        }

        return false;
    }

    /**
     * Validate access and throw if denied
     */
    validateAccess(instanceId: string, targetPath: string): void {
        if (!this.canAccess(instanceId, targetPath)) {
            const resolvedPath = path.resolve(targetPath);
            logWarn(`[ToolFilesystemAccess] Access denied for tool instance ${instanceId} to path: ${resolvedPath}`);
            throw new Error(
                `Access denied. This tool does not have permission to access "${resolvedPath}". ` +
                    `Please use toolboxAPI.fileSystem.selectPath() to grant access to a directory, ` +
                    `or use toolboxAPI.fileSystem.saveFile() to select where to save files.`,
            );
        }
    }

    /**
     * Revoke all access for a tool instance (called when tool instance is closed)
     */
    revokeAllAccess(instanceId: string): void {
        const removed = this.allowedPaths.delete(instanceId);
        if (removed) {
            logInfo(`[ToolFilesystemAccess] Revoked all filesystem access for tool instance: ${instanceId}`);
        }
    }

    /**
     * Get all allowed paths for a tool instance (for debugging/auditing)
     */
    getAllowedPaths(instanceId: string): string[] {
        const allowedSet = this.allowedPaths.get(instanceId);
        return allowedSet ? Array.from(allowedSet) : [];
    }

    /**
     * Clear all permissions (for testing/cleanup)
     */
    clearAll(): void {
        this.allowedPaths.clear();
        logInfo("[ToolFilesystemAccess] Cleared all filesystem permissions");
    }
}
