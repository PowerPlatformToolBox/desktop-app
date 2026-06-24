import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { logError, logInfo } from "../../common/logger";
import { ToolManifest } from "../../common/types";

type HeadlessInvokeFn = (input: Record<string, unknown>, context: HeadlessInvokeContext) => Promise<Record<string, unknown>>;

interface HeadlessRuntimeModule {
    invokeHeadless?: HeadlessInvokeFn;
    default?: HeadlessInvokeFn | { invokeHeadless?: HeadlessInvokeFn };
}

export interface HeadlessInvokeContext {
    toolId: string;
    toolName: string;
    invocationMode: "one-way" | "two-way";
    authToken?: string;
    updateProgress: (percent: number, message?: string) => void;
    logger: {
        info: (message: string) => void;
        error: (message: string) => void;
    };
}

interface ToolConfigShape {
    agents?: {
        headlessEntry?: string;
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseToolConfig(installPath: string): ToolConfigShape {
    const configPath = path.join(installPath, "pptb.config.json");
    if (!fs.existsSync(configPath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(raw) as ToolConfigShape;
    } catch {
        return {};
    }
}

function parseToolPackageJson(installPath: string): Record<string, unknown> {
    const packageJsonPath = path.join(installPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
        return {};
    }

    try {
        const raw = fs.readFileSync(packageJsonPath, "utf-8");
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function resolveCandidatePaths(manifest: ToolManifest): string[] {
    const installPath = manifest.installPath;
    const config = parseToolConfig(installPath);
    const packageJson = parseToolPackageJson(installPath);

    const candidates = [config.agents?.headlessEntry, "dist/headless.js", "headless.js", typeof packageJson.main === "string" ? packageJson.main : undefined].filter(
        (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
    );

    const resolved = candidates.map((candidate) => path.resolve(installPath, candidate)).filter((candidatePath) => fs.existsSync(candidatePath));

    return [...new Set(resolved)];
}

function resolveInvokeFunction(moduleExports: HeadlessRuntimeModule): HeadlessInvokeFn | null {
    if (typeof moduleExports.invokeHeadless === "function") {
        return moduleExports.invokeHeadless;
    }

    if (typeof moduleExports.default === "function") {
        return moduleExports.default as HeadlessInvokeFn;
    }

    if (isRecord(moduleExports.default) && typeof moduleExports.default.invokeHeadless === "function") {
        return moduleExports.default.invokeHeadless;
    }

    return null;
}

export async function invokeHeadlessTool(manifest: ToolManifest, input: Record<string, unknown>, context: HeadlessInvokeContext): Promise<Record<string, unknown>> {
    const candidatePaths = resolveCandidatePaths(manifest);
    if (candidatePaths.length === 0) {
        throw new Error(`No headless runtime entry found for tool '${manifest.id}'. Add agents.headlessEntry in pptb.config.json or provide dist/headless.js.`);
    }

    let lastError: Error | null = null;

    for (const entryPath of candidatePaths) {
        try {
            const moduleUrl = pathToFileURL(entryPath).href;
            const loaded = (await import(moduleUrl)) as HeadlessRuntimeModule;
            const invokeFn = resolveInvokeFunction(loaded);

            if (!invokeFn) {
                lastError = new Error(`Entry '${entryPath}' does not export invokeHeadless(input, context).`);
                continue;
            }

            context.logger.info(`Executing headless runtime entry '${entryPath}'`);
            const result = await invokeFn(input, context);

            if (!isRecord(result)) {
                throw new Error("Headless runtime must return an object result.");
            }

            return result;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logError(`[MCP][Headless] Failed entry ${entryPath}`, lastError);
        }
    }

    throw new Error(lastError?.message || `Failed to execute headless runtime for tool '${manifest.id}'.`);
}

export function createHeadlessLogger(toolId: string) {
    return {
        info: (message: string) => {
            logInfo(`[MCP][Headless][${toolId}] ${message}`);
        },
        error: (message: string) => {
            logError(`[MCP][Headless][${toolId}] ${message}`);
        },
    };
}
