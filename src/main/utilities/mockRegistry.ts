import * as fs from "fs";
import * as path from "path";
import { CspExceptions } from "../../common/types";

interface OfflineMockRegistryFile {
    version?: string;
    updatedAt?: string;
    description?: string;
    tools?: OfflineMockRegistryTool[];
}

export interface OfflineMockRegistryTool {
    id: string;
    packageName?: string;
    name: string;
    description: string;
    authors?: string[];
    version: string;
    downloadUrl: string;
    icon?: string;
    checksum?: string;
    size?: number;
    publishedAt?: string;
    tags?: string[];
    readme?: string;
    minToolboxVersion?: string;
    repository?: string;
    homepage?: string;
    license?: string;
    cspExceptions?: CspExceptions;
    features?: Record<string, unknown>;
    status?: string;
    minAPI?: string;
    maxAPI?: string;
}

export interface OfflineMockRegistryLoadResult {
    tools: OfflineMockRegistryTool[];
    sourcePath: string | null;
}

function resolveOfflineMockRegistryPath(): string | null {
    const candidatePaths = [
        // Bundled layout: dist/main/data/registry.json (most common runtime path)
        path.join(__dirname, "..", "data", "registry.json"),
        // Defensive fallback for alternate build layouts
        path.join(__dirname, "data", "registry.json"),
        // Source-tree execution (tests/dev helpers)
        path.join(process.cwd(), "src", "main", "data", "registry.json"),
        // Dist path from workspace root when process cwd is project root
        path.join(process.cwd(), "dist", "main", "data", "registry.json"),
    ];

    const resolvedPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    return resolvedPath || null;
}

/**
 * Loads offline mock registry tools from the single source of truth file.
 */
export function loadOfflineMockRegistryTools(): OfflineMockRegistryLoadResult {
    const sourcePath = resolveOfflineMockRegistryPath();
    if (!sourcePath) {
        return {
            tools: [],
            sourcePath: null,
        };
    }

    try {
        const fileText = fs.readFileSync(sourcePath, "utf-8");
        const parsed = JSON.parse(fileText) as OfflineMockRegistryFile;

        if (!Array.isArray(parsed.tools)) {
            return {
                tools: [],
                sourcePath,
            };
        }

        return {
            tools: parsed.tools,
            sourcePath,
        };
    } catch {
        return {
            tools: [],
            sourcePath,
        };
    }
}
