/**
 * Feedback and environment diagnostics utility functions.
 *
 * These utilities are intentionally free of class dependencies so they can be
 * called from any part of the main process (menu builder, IPC handlers, etc.).
 */

import { app } from "electron";
import { logError } from "../../common/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnvironmentDiagnostics {
    appVersion: string;
    channel: string;
    locale: string;
    electronVersion: string;
    nodeVersion: string;
    chromeVersion: string;
    platform: string;
    arch: string;
    osVersion: string;
}

/** Resolved information about the currently-active tool instance. */
export interface ActiveToolInfo {
    instanceId: string | null;
    toolId: string;
    toolName: string;
    toolVersion: string;
}

// ---------------------------------------------------------------------------
// Environment diagnostics
// ---------------------------------------------------------------------------

export function getEnvironmentDiagnostics(): EnvironmentDiagnostics {
    return {
        appVersion: app.getVersion(),
        channel: process.env.PPTB_CHANNEL ?? "stable",
        locale: app.getLocale(),
        electronVersion: process.versions.electron,
        nodeVersion: process.versions.node,
        chromeVersion: process.versions.chrome,
        platform: process.platform,
        arch: process.arch,
        osVersion: process.getSystemVersion(),
    };
}

export function buildEnvironmentSummaryLines(extraLines: string[] = []): string[] {
    const d = getEnvironmentDiagnostics();

    return [
        `PPTB Version: ${d.appVersion}`,
        `Channel: ${d.channel}`,
        `Platform: ${d.platform}`,
        `Architecture: ${d.arch}`,
        `OS Version: ${d.osVersion}`,
        `Locale: ${d.locale}`,
        `Electron: ${d.electronVersion}`,
        `Node: ${d.nodeVersion}`,
        `Chrome: ${d.chromeVersion}`,
        ...extraLines,
    ];
}

// ---------------------------------------------------------------------------
// Active tool info
// ---------------------------------------------------------------------------

/**
 * Derive the active tool's identity from a raw tool-window instance ID.
 *
 * Instance IDs follow the pattern `<toolId>-<part1>-<part2>` (two trailing
 * UUID-like segments appended at window creation time).  The last two
 * dash-separated segments are stripped to recover the base tool ID.
 *
 * Accepts lightweight getter callbacks so this function has no direct
 * dependency on ToolManager or ToolWindowManager.
 */
export function resolveActiveToolInfo(
    activeInstanceId: string | null,
    getTool: (toolId: string) => { name?: string; version?: string } | undefined,
    getInstalledManifestSync: (toolId: string) => { name?: string; version?: string } | null,
): ActiveToolInfo {
    if (!activeInstanceId) {
        return { instanceId: null, toolId: "none", toolName: "none", toolVersion: "none" };
    }

    const parsedToolId = activeInstanceId.split("-").slice(0, -2).join("-");
    const toolId = parsedToolId || "unknown";

    const activeTool = getTool(toolId);
    const installedManifest = activeTool ? null : getInstalledManifestSync(toolId);
    const toolName = activeTool?.name ?? installedManifest?.name ?? toolId;
    const toolVersion = activeTool?.version ?? installedManifest?.version ?? "unknown";

    return { instanceId: activeInstanceId, toolId, toolName, toolVersion };
}

// ---------------------------------------------------------------------------
// Feedback URL builders
// ---------------------------------------------------------------------------

/**
 * Build a GitHub issues/new URL for a third-party tool, pre-filling the body
 * with an environment summary that includes the tool's name and version.
 * Non-GitHub URLs are returned as-is after the environment block is appended
 * as a query parameter.
 *
 * Falls back to the original URL if construction fails.
 */
export function buildToolFeedbackUrl(repositoryUrl: string, activeToolInfo: ActiveToolInfo): string {
    try {
        const environmentSummary = [
            `[Write your comment/feedback/issue here]`,
            ``,
            ...buildEnvironmentSummaryLines([`Tool Name: ${activeToolInfo.toolName}`, `Tool Version: ${activeToolInfo.toolVersion}`]),
        ].join("\n");

        const url = new URL(repositoryUrl);
        if (url.hostname === "github.com") {
            // Strip trailing slashes and known suffixes so we always end up at the repo root.
            const cleanPath = url.pathname.replace(/\/(issues|pulls|discussions).*$/, "").replace(/\/+$/, "");
            url.pathname = `${cleanPath}/issues/new`;
        }

        url.searchParams.set("body", environmentSummary);
        return url.toString();
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logError(err);
        return repositoryUrl;
    }
}

/**
 * Build a pre-filled GitHub bug-report URL for ToolBox itself.
 * Accepts an {@link ActiveToolInfo} so the active-tool context can be
 * injected from any call site without coupling this function to the managers.
 */
export function buildToolBoxFeedbackUrl(activeToolInfo: ActiveToolInfo): string {
    const fallbackIssuesUrl = "https://github.com/PowerPlatformToolBox/desktop-app/issues/new?template=issue-form-bug.yml";

    try {
        const diagnostics = getEnvironmentDiagnostics();

        const environmentSummary = buildEnvironmentSummaryLines([
            `Active Tool Instance ID: ${activeToolInfo.instanceId ?? "none"}`,
            `Active Tool ID: ${activeToolInfo.toolId}`,
            `Active Tool Name: ${activeToolInfo.toolName}`,
            `Active Tool Version: ${activeToolInfo.toolVersion}`,
        ]).join("\n");

        const logsTemplate = ["Paste relevant logs here (if available).", "", "Environment (auto-filled):", environmentSummary].join("\n");

        const params = new URLSearchParams({
            template: "issue-form-bug.yml",
            title: "[Bug]: ",
            version: diagnostics.appVersion,
            logs: logsTemplate,
        });

        return `https://github.com/PowerPlatformToolBox/desktop-app/issues/new?${params.toString()}`;
    } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logError(err);
        return fallbackIssuesUrl;
    }
}
