import { app } from "electron";
import { compareVersions } from "../../common/utils/version";
import { MIN_SUPPORTED_API_VERSION } from "../constants";

/**
 * Version Manager
 * Handles version comparison and compatibility checking for tools
 */
export class VersionManager {
    /**
     * Check if a tool is compatible with the current ToolBox version
     * @param minAPI - Minimum API version required by the tool (from Supabase)
     * @param maxAPI - Maximum API version tested by the tool (from Supabase, informational only)
     * @returns true if the tool is supported, false otherwise
     *
     * Compatibility rules:
     * 1. If tool has no version constraints (legacy): always compatible
     * 2. Tool's minAPI must be >= MIN_SUPPORTED_API_VERSION (doesn't use deprecated APIs)
     * 3. Tool's minAPI must be <= current ToolBox version (ToolBox meets minimum requirement)
     * 4. maxAPI is informational only - tools built with older APIs continue to work
     *    unless breaking changes are introduced (tracked by MIN_SUPPORTED_API_VERSION)
     */
    static isToolSupported(minAPI?: string, maxAPI?: string): boolean {
        const toolboxVersion = VersionManager.getToolBoxVersion();

        // If no version constraints, assume compatible (legacy tools)
        if (!minAPI && !maxAPI) {
            return true;
        }

        // Check minimum version requirements
        if (minAPI) {
            // Tool's minAPI must be >= MIN_SUPPORTED_API_VERSION
            // This ensures the tool doesn't require APIs that have been deprecated/removed
            const minAPIvsMinSupported = compareVersions(minAPI, MIN_SUPPORTED_API_VERSION);
            if (minAPIvsMinSupported < 0) {
                // Tool requires APIs older than what we support
                return false;
            }

            // Tool's minAPI must be <= current ToolBox version
            // This ensures the current ToolBox has the minimum APIs the tool needs
            const toolboxVsMinAPI = compareVersions(toolboxVersion, minAPI);
            if (toolboxVsMinAPI < 0) {
                // Current ToolBox version is older than what tool requires
                return false;
            }
        }

        // TODO: For future enhancement, if installed ToolBox version is less than the the API tool is built on
        // maxAPI is informational only - tools built with older APIs will continue
        // to work on newer ToolBox versions unless we introduce breaking changes
        // Breaking changes are tracked by updating MIN_SUPPORTED_API_VERSION

        return true;
    }

    /**
     * Get the current ToolBox version from Electron app
     */
    static getToolBoxVersion(): string {
        return app.getVersion();
    }

    /**
     * Get the minimum supported API version
     */
    static getMinSupportedApiVersion(): string {
        return MIN_SUPPORTED_API_VERSION;
    }
}
