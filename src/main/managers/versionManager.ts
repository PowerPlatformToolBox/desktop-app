import { app } from "electron";
import { MIN_SUPPORTED_API_VERSION } from "../constants";

/**
 * Version Manager
 * Handles version comparison and compatibility checking for tools
 */
export class VersionManager {
    /**
     * Compare two semantic version strings
     * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
     * Handles versions like "1.0.0", "1.0.12", "1.1.3-beta.1"
     * 
     * Note: Pre-release versions (e.g., "1.0.0-beta.1") are considered less than
     * their release counterparts (e.g., "1.0.0") as per semver spec
     */
    static compareVersions(v1: string, v2: string): number {
        // Split version into numeric and pre-release parts
        const parseVersion = (v: string) => {
            const [numericPart, preRelease] = v.split("-");
            const numeric = numericPart.split(".").map((p) => parseInt(p, 10) || 0);
            return { numeric, preRelease: preRelease || null };
        };

        const parsed1 = parseVersion(v1);
        const parsed2 = parseVersion(v2);

        // Compare numeric parts
        const maxLength = Math.max(parsed1.numeric.length, parsed2.numeric.length);
        for (let i = 0; i < maxLength; i++) {
            const p1 = parsed1.numeric[i] || 0;
            const p2 = parsed2.numeric[i] || 0;
            if (p1 < p2) return -1;
            if (p1 > p2) return 1;
        }

        // If numeric parts are equal, compare pre-release
        // No pre-release (release version) > has pre-release (pre-release version)
        if (parsed1.preRelease === null && parsed2.preRelease !== null) return 1;
        if (parsed1.preRelease !== null && parsed2.preRelease === null) return -1;
        if (parsed1.preRelease !== null && parsed2.preRelease !== null) {
            // Simple string comparison for pre-release tags
            if (parsed1.preRelease < parsed2.preRelease) return -1;
            if (parsed1.preRelease > parsed2.preRelease) return 1;
        }

        return 0;
    }

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
        
        // Log all calls with stack trace
        console.log("[VersionManager] isToolSupported called:", { minAPI, maxAPI, toolboxVersion, MIN_SUPPORTED_API_VERSION });
        console.log("[VersionManager] Call stack:", new Error().stack);
        
        // If no version constraints, assume compatible (legacy tools)
        if (!minAPI && !maxAPI) {
            console.log("[VersionManager] No version constraints - legacy tool is compatible");
            return true;
        }

        console.log("[VersionManager] Checking compatibility with version constraints");

        // Check minimum version requirements
        if (minAPI) {
            // Tool's minAPI must be >= MIN_SUPPORTED_API_VERSION
            // This ensures the tool doesn't require APIs that have been deprecated/removed
            const minAPIvsMinSupported = VersionManager.compareVersions(minAPI, MIN_SUPPORTED_API_VERSION);
            console.log("[VersionManager] minAPI vs MIN_SUPPORTED_API_VERSION:", { minAPI, MIN_SUPPORTED_API_VERSION, comparison: minAPIvsMinSupported });
            if (minAPIvsMinSupported < 0) {
                // Tool requires APIs older than what we support
                console.log("[VersionManager] INCOMPATIBLE: Tool minAPI < MIN_SUPPORTED_API_VERSION");
                return false;
            }

            // Tool's minAPI must be <= current ToolBox version
            // This ensures the current ToolBox has the minimum APIs the tool needs
            const toolboxVsMinAPI = VersionManager.compareVersions(toolboxVersion, minAPI);
            console.log("[VersionManager] toolboxVersion vs minAPI:", { toolboxVersion, minAPI, comparison: toolboxVsMinAPI });
            if (toolboxVsMinAPI < 0) {
                // Current ToolBox version is older than what tool requires
                console.log("[VersionManager] INCOMPATIBLE: toolboxVersion < minAPI");
                return false;
            }
        }

        // maxAPI is informational only - tools built with older APIs will continue
        // to work on newer ToolBox versions unless we introduce breaking changes
        // Breaking changes are tracked by updating MIN_SUPPORTED_API_VERSION

        console.log("[VersionManager] COMPATIBLE");
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
