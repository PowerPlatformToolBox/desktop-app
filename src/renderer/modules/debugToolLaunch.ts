/**
 * CLI `--debug-tool` launch handler (renderer side).
 *
 * Mounts a local tool directory supplied on the command line and opens it in a tab.
 * Re-invoking for the same tool closes the existing tab first so there is never a
 * duplicate. A folder must be explicitly trusted before anything is mounted.
 *
 * Logging note: every logger function in this app forwards to Sentry, so the raw
 * `localPath`, the connection name, and any raw error message must never be passed
 * to one. Use `describeLocalPath()` for correlation; raw values go only into
 * user-facing notifications, which never leave the machine.
 */

import { logError, logInfo, logWarn } from "../../common/logger";
import type { Connection, DebugToolLaunchRequest, LocalToolIdentity } from "../../common/types";
import { openDebugToolTrustModal } from "./debugToolTrustModal";
import { applyDebugMenuVisibility } from "./themeManagement";
import { closeTool, closeToolsAtomically, getOpenTools, launchTool } from "./toolManagement";
import { loadSidebarTools } from "./toolsSidebarManagement";

/**
 * Produce a Sentry-safe description of a path: `basename#hash8`.
 *
 * Mirrors `describePath()` in the main process, but without a Node `crypto`
 * dependency. The hash only needs to correlate log lines, not resist collisions.
 */
function describeLocalPath(fullPath: string): string {
    if (typeof fullPath !== "string" || fullPath.length === 0) {
        return "unknown";
    }

    let hash = 5381;
    for (let index = 0; index < fullPath.length; index++) {
        hash = ((hash << 5) + hash + fullPath.charCodeAt(index)) >>> 0;
    }

    const segments = fullPath.split(/[\\/]/).filter((segment) => segment.length > 0);
    const basename = segments.length > 0 ? segments[segments.length - 1] : "unknown";
    return `${basename}#${hash.toString(16).padStart(8, "0")}`;
}

async function notify(title: string, body: string, type: "info" | "success" | "warning" | "error", persistent = false): Promise<void> {
    await window.toolboxAPI.utils
        .showNotification({
            title,
            body,
            type,
            ...(persistent ? { duration: 0 } : {}),
        })
        .catch(() => {
            /* A failed notification must not mask the original outcome. */
        });
}

/**
 * Resolve `--debug-tool-connection` to a saved connection.
 *
 * Tries the value as an id first, then as an exact case-insensitive name. Returns
 * `null` when nothing matches or when the name is ambiguous — the caller then falls
 * back to the tool's stored connection rather than guessing between duplicates.
 */
async function resolveFlagConnection(value: string): Promise<{ connection: Connection | null; ambiguous: boolean }> {
    const byId = await window.toolboxAPI.connections.getById(value).catch(() => null);
    if (byId) {
        return { connection: byId, ambiguous: false };
    }

    const all = await window.toolboxAPI.connections.getAll().catch(() => [] as Connection[]);
    const needle = value.trim().toLowerCase();
    const matches = all.filter((connection) => connection.name.trim().toLowerCase() === needle);

    if (matches.length === 1) {
        return { connection: matches[0], ambiguous: false };
    }

    return { connection: null, ambiguous: matches.length > 1 };
}

/**
 * Attempt a silent token acquisition. Returns null when it fails so `launchTool`
 * prompts instead of launching against a dead token.
 */
async function ensureAuthenticated(connectionId: string | null): Promise<string | null> {
    if (!connectionId) {
        return null;
    }

    try {
        const isExpired = await window.toolboxAPI.connections.isTokenExpired(connectionId);
        if (isExpired) {
            const result = await window.toolboxAPI.connections.refreshToken(connectionId);
            if (!result.success) {
                return null;
            }
        }
        return connectionId;
    } catch (error) {
        logWarn("[DebugToolLaunch] Silent authentication failed; connection will not be preselected", { error: error instanceof Error ? error.name : "unknown" });
        return null;
    }
}

/**
 * Close every open instance of a tool and report whether they all actually closed.
 *
 * Every renderer and main-process veto is checked before any existing instance is
 * removed, so a later veto cannot leave a partial reload behind.
 */
async function closeExistingInstances(toolId: string): Promise<boolean> {
    const instanceIds = Array.from(getOpenTools().values())
        .filter((openTool) => !openTool.isDetailTab && openTool.toolId === toolId)
        .map((openTool) => openTool.instanceId);

    return closeToolsAtomically(instanceIds);
}

/**
 * Handle a `--debug-tool` request forwarded by the main process.
 *
 * Never throws: every failure surfaces as a persistent notification so the app
 * stays usable after a bad invocation.
 */
export async function handleDebugToolLaunchRequest(request: DebugToolLaunchRequest): Promise<void> {
    const localPath = request?.localPath ?? "";
    const pathLabel = describeLocalPath(localPath);
    let provisionalRegistration: LocalToolIdentity | null = null;

    try {
        logInfo("[DebugToolLaunch] Handling CLI debug tool request", { path: pathLabel, hasConnectionFlag: !!request?.connection, openDevTools: request?.openDevTools === true });

        const identity = await window.toolboxAPI.peekLocalToolIdentity(localPath);
        if (!identity) {
            logWarn("[DebugToolLaunch] No readable package.json at the requested path", { path: pathLabel });
            await notify("Debug Tool Failed", `No readable package.json was found at:\n${localPath}`, "error", true);
            return;
        }
        const resolvedPath = identity.resolvedPath;
        const resolvedPathLabel = describeLocalPath(resolvedPath);

        // Resolve the flag connection up front: the trust prompt must name the target
        // environment, and the decision covers both the mount and that environment.
        let flagConnection: Connection | null = null;
        let flagAmbiguous = false;
        if (request.connection) {
            const resolution = await resolveFlagConnection(request.connection);
            flagConnection = resolution.connection;
            flagAmbiguous = resolution.ambiguous;
            if (!flagConnection) {
                logWarn("[DebugToolLaunch] Explicit connection flag did not resolve; launch aborted", { ambiguous: flagAmbiguous });
                await notify(
                    "Connection Not Resolved",
                    flagAmbiguous ? "More than one connection matches --debug-tool-connection. Use the connection ID instead." : "No connection matches --debug-tool-connection.",
                    "error",
                    true,
                );
                return;
            }
        }

        const wasRegistered = (await window.toolboxAPI.getAllTools()).some((registeredTool) => registeredTool.id === identity.id);
        const wasOpen = Array.from(getOpenTools().values()).some((openTool) => !openTool.isDetailTab && openTool.toolId === identity.id);
        const tool = await window.toolboxAPI.loadLocalTool(resolvedPath, identity, !wasRegistered);
        if (!wasRegistered) {
            provisionalRegistration = identity;
        }

        const storedConnectionId = flagConnection ? null : await window.toolboxAPI.getToolConnection(tool.id).catch(() => null);
        const primaryConnectionId = flagConnection?.id ?? storedConnectionId;
        const secondaryConnectionId = await window.toolboxAPI.getToolSecondaryConnection(tool.id).catch(() => null);

        if (!primaryConnectionId && (tool.features?.connectionRequirement ?? "required") === "required") {
            await notify("Connection Required", `${tool.name} needs a connection. Pass --debug-tool-connection <id or name> to skip this prompt next time.`, "info");
        }

        const launchedInstanceId = await launchTool(tool.id, {
            source: "cli-debug-tool",
            toolOverride: tool,
            primaryConnectionId,
            secondaryConnectionId,
            beforeLaunch: async (connections) => {
                const authenticatedPrimary = await ensureAuthenticated(connections.primaryConnectionId);
                const authenticatedSecondary = await ensureAuthenticated(connections.secondaryConnectionId);
                if (authenticatedPrimary !== connections.primaryConnectionId || authenticatedSecondary !== connections.secondaryConnectionId) {
                    await notify("Authentication Required", "The selected connection could not be refreshed without interaction. Reconnect it and run the command again.", "error", true);
                    return false;
                }

                const [primaryConnection, secondaryConnection] = await Promise.all([
                    authenticatedPrimary ? window.toolboxAPI.connections.getById(authenticatedPrimary).catch(() => null) : Promise.resolve(null),
                    authenticatedSecondary ? window.toolboxAPI.connections.getById(authenticatedSecondary).catch(() => null) : Promise.resolve(null),
                ]);
                const trusted = await window.toolboxAPI.isDebugToolPathTrusted(resolvedPath, identity.name, authenticatedPrimary, authenticatedSecondary);
                if (!trusted) {
                    const knownPaths = await window.toolboxAPI.getTrustedDebugToolPaths().catch(() => []);
                    const packageNameChanged = knownPaths.some((entry) => entry.resolvedPath === resolvedPath && entry.packageName !== identity.name);
                    const connectionNames = [primaryConnection?.name, secondaryConnection?.name].filter((name): name is string => !!name).join(" / ") || null;
                    const connectionEnvironments =
                        [primaryConnection?.environment, secondaryConnection?.environment].filter((environment): environment is Connection["environment"] => !!environment).join(" / ") || null;
                    const granted = await openDebugToolTrustModal({
                        resolvedPath,
                        packageName: identity.name,
                        displayName: identity.displayName,
                        version: identity.version,
                        connectionName: connectionNames,
                        connectionEnvironment: connectionEnvironments,
                        packageNameChanged,
                    });
                    if (!granted) {
                        logInfo("[DebugToolLaunch] Trust declined; tool launch aborted", { path: resolvedPathLabel });
                        await notify("Debug Tool Cancelled", `The folder was not trusted, so nothing was launched:\n${resolvedPath}`, "info");
                        return false;
                    }

                    await window.toolboxAPI.trustDebugToolPath(resolvedPath, identity.name, authenticatedPrimary, authenticatedSecondary);
                }

                return true;
            },
            afterWindowLaunch: async () => {
                if (!wasOpen || (await closeExistingInstances(identity.id))) {
                    return true;
                }

                logWarn("[DebugToolLaunch] Existing tool instance refused to close; aborting relaunch", { path: resolvedPathLabel });
                await notify(
                    "Debug Tool Not Reloaded",
                    `${identity.displayName} is still open and could not be closed — it may be pinned or have unsaved work.\nClose the tab manually and run the command again.\n\n${resolvedPath}`,
                    "warning",
                    true,
                );
                return false;
            },
        });

        if (!launchedInstanceId) {
            return;
        }

        if (provisionalRegistration && !(await window.toolboxAPI.commitLocalTool(tool.id, provisionalRegistration))) {
            await closeTool(launchedInstanceId, { force: true });
            throw new Error("The local tool could not be committed after launch.");
        }
        provisionalRegistration = null;

        // Session-only: reveal the debug menu and local tool after a successful launch.
        applyDebugMenuVisibility(true);
        await loadSidebarTools();

        if (request.openDevTools) {
            await window.toolboxAPI.openToolDevTools(launchedInstanceId).catch((error) => {
                logWarn("[DebugToolLaunch] Failed to open DevTools for the mounted tool", { error: error instanceof Error ? error.name : "unknown" });
            });
        }

        await notify(wasOpen ? "Debug Tool Reloaded" : "Debug Tool Loaded", `${tool.name} v${tool.version ?? identity.version}\n${resolvedPath}`, "success");
        logInfo("[DebugToolLaunch] Local tool mounted from CLI", { path: resolvedPathLabel, reloaded: wasOpen });
    } catch (error) {
        logError(new Error("[DebugToolLaunch] Local tool launch failed"), { error: error instanceof Error ? error.name : "unknown", path: pathLabel });
        const message = error instanceof Error ? error.message : String(error);
        await notify("Debug Tool Failed", message, "error", true);
    } finally {
        if (provisionalRegistration) {
            await window.toolboxAPI.removeLocalTool(provisionalRegistration.id, provisionalRegistration).catch(() => false);
            await loadSidebarTools().catch(() => undefined);
        }
    }
}

let debugToolLaunchQueue: Promise<void> = Promise.resolve();

export function enqueueDebugToolLaunchRequest(request: DebugToolLaunchRequest): Promise<void> {
    const queued = debugToolLaunchQueue.then(() => handleDebugToolLaunchRequest(request));
    debugToolLaunchQueue = queued.catch(() => undefined);
    return queued;
}
