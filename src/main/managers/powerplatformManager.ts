import * as https from "https";
import { logError, logWarn } from "../../common/logger";
import { Connection } from "../../common/types";
import { AuthManager } from "./authManager";
import { ConnectionsManager } from "./connectionsManager";
import type { ProxyManager } from "./proxyManager";
import type { PowerPlatformRawOptions, PowerPlatformRawResponse } from "../../common/powerplatformApi";

interface PowerPlatformError {
    error?: {
        code?: string;
        message?: string;
    };
    message?: string;
}

export type PowerPlatformCategory =
    | "Analytics"
    | "AppManagement"
    | "Authorization"
    | "Connectivity"
    | "CopilotStudio"
    | "Dynamics"
    | "EnvironmentManagement"
    | "Governance"
    | "Licensing"
    | "PowerApps"
    | "PowerAutomate"
    | "PowerPages"
    | "ResourceQuery"
    | "UserManagement"
    | "WorkflowAgents";

type PowerPlatformMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const POWER_PLATFORM_CATEGORY_PATHS: Record<PowerPlatformCategory, string> = {
    Analytics: "analytics",
    AppManagement: "appmanagement",
    Authorization: "authorization",
    Connectivity: "connectivity",
    CopilotStudio: "copilotstudio",
    Dynamics: "dynamics",
    EnvironmentManagement: "environmentmanagement",
    Governance: "governance",
    Licensing: "licensing",
    PowerApps: "powerapps",
    PowerAutomate: "powerautomate",
    PowerPages: "powerpages",
    ResourceQuery: "resourcequery",
    UserManagement: "usermanagement",
    WorkflowAgents: "workflowagents",
};

const ALLOWED_METHODS: ReadonlySet<PowerPlatformMethod> = new Set<PowerPlatformMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export class PowerPlatformManager {
    private connectionsManager: ConnectionsManager;
    private authManager: AuthManager;
    private readonly proxyManager?: ProxyManager;

    constructor(connectionsManager: ConnectionsManager, authManager: AuthManager, proxyManager?: ProxyManager) {
        this.connectionsManager = connectionsManager;
        this.authManager = authManager;
        this.proxyManager = proxyManager;
    }

    async request(connectionId: string, category: PowerPlatformCategory, method: string, relativePath = "", body?: unknown, customHeaders?: Record<string, string>): Promise<unknown> {
        const normalizedMethod = method.toUpperCase() as PowerPlatformMethod;

        if (!ALLOWED_METHODS.has(normalizedMethod)) {
            throw new Error(`Invalid Power Platform method '${method}'. Allowed methods: GET, POST, PUT, PATCH, DELETE.`);
        }

        if (!Object.prototype.hasOwnProperty.call(POWER_PLATFORM_CATEGORY_PATHS, category)) {
            throw new Error(`Invalid Power Platform category '${category}'.`);
        }

        const url = this.buildApiUrl(category, relativePath);
        const { accessToken } = await this.getConnectionWithToken(connectionId);

        return await this.makeHttpRequest(url, normalizedMethod, accessToken, body, customHeaders);
    }

    /** Internal transport result includes non-2xx responses; tool clients turn these into structured rejections. */
    async requestRaw(
        connectionId: string,
        category: PowerPlatformCategory,
        method: string,
        path = "",
        body?: unknown,
        customHeaders?: Record<string, string>,
        options?: PowerPlatformRawOptions,
    ): Promise<PowerPlatformRawResponse> {
        const normalizedMethod = typeof method === "string" ? (method.toUpperCase() as PowerPlatformMethod) : undefined;
        if (!normalizedMethod || !ALLOWED_METHODS.has(normalizedMethod)) {
            throw new Error("Invalid Power Platform method. Allowed methods: GET, POST, PUT, PATCH, DELETE.");
        }
        if (!Object.prototype.hasOwnProperty.call(POWER_PLATFORM_CATEGORY_PATHS, category)) {
            throw new Error("Invalid Power Platform category.");
        }
        if (
            options !== undefined &&
            (!options || typeof options !== "object" || Array.isArray(options) || (options.requireDelegatedAuthentication !== undefined && typeof options.requireDelegatedAuthentication !== "boolean"))
        ) {
            throw new Error("Invalid Power Platform raw request options.");
        }
        const url = this.buildApiUrl(category, path, true);
        this.validateCustomHeaders(customHeaders);
        const requiresDelegated =
            options?.requireDelegatedAuthentication || (category === "CopilotStudio" && /^\/copilotstudio\/licensing\/reports(?:\/|$)/i.test(decodeURIComponent(new URL(url).pathname)));
        if (requiresDelegated) {
            const connection = this.connectionsManager.getConnectionById(connectionId);
            if (!connection || (connection.authenticationType !== "interactive" && connection.authenticationType !== "usernamePassword")) {
                throw new Error("This Power Platform request requires a delegated user connection. Select a user-authenticated connection.");
            }
        }
        const { accessToken } = await this.getConnectionWithToken(connectionId);
        return this.makeHttpRequest(url, normalizedMethod, accessToken, body, customHeaders, true);
    }

    private validateCustomHeaders(headers?: Record<string, string>): void {
        if (headers === undefined) return;
        if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
            throw new Error("Power Platform headers must be a string-valued object.");
        }
        const protectedHeaders = new Set(["authorization", "proxy-authorization", "host", "content-length", "transfer-encoding", "connection"]);
        for (const [name, value] of Object.entries(headers)) {
            if (protectedHeaders.has(name.toLowerCase()) || typeof value !== "string" || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value)) {
                throw new Error("Invalid or host-managed Power Platform request header.");
            }
        }
    }

    private buildApiUrl(category: PowerPlatformCategory, relativePath: string, allowLocation = false): string {
        const baseUrl = `https://api.powerplatform.com/${POWER_PLATFORM_CATEGORY_PATHS[category]}`;
        if (typeof relativePath !== "string") throw new Error("Power Platform path must be a string.");
        const cleanPath = relativePath.trim();
        const absolute = /^[a-z][a-z0-9+.-]*:/i.test(cleanPath);
        if (absolute && !allowLocation) throw new Error("Use a relative Power Platform path.");
        // Reject ambiguous paths before URL normalization can hide traversal or encoded separators.
        const pathOnly = cleanPath.split("?")[0];
        if (
            [...cleanPath].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127) ||
            /[\\#]/.test(cleanPath) ||
            cleanPath.startsWith("//") ||
            /%(?:2e|2f|5c|25)/i.test(pathOnly) ||
            /(?:^|\/)\.{1,2}(?:\/|$)/.test(pathOnly)
        ) {
            throw new Error("Invalid Power Platform request target.");
        }
        let url: URL;
        try {
            url = new URL(absolute ? cleanPath : cleanPath.startsWith("?") ? `${baseUrl}${cleanPath}` : `${baseUrl}${cleanPath ? `/${cleanPath.replace(/^\/+/, "")}` : ""}`);
            decodeURIComponent(url.pathname);
        } catch {
            throw new Error("Invalid Power Platform request target.");
        }
        const namespace = `/${POWER_PLATFORM_CATEGORY_PATHS[category]}`;
        if (
            url.protocol !== "https:" ||
            url.hostname !== "api.powerplatform.com" ||
            url.port ||
            url.username ||
            url.password ||
            url.hash ||
            (url.pathname !== namespace && !url.pathname.startsWith(`${namespace}/`))
        ) {
            throw new Error("Power Platform target must use HTTPS on api.powerplatform.com within the selected namespace.");
        }
        return url.href;
    }

    private async ensureMsalCacheOrClearTokens(connection: Connection, connectionId: string, errorMessage: string): Promise<void> {
        const hasAccount = await this.authManager.hasAccountInCache(connection);
        if (!hasAccount) {
            this.connectionsManager.clearConnectionTokens(connectionId);
            logWarn("MSAL account not found in cache - tokens cleared");
            throw new Error(errorMessage);
        }
    }

    private async getConnectionWithToken(connectionId: string): Promise<{ connection: Connection; accessToken: string }> {
        const connection = this.connectionsManager.getConnectionById(connectionId);
        if (!connection) {
            throw new Error(`Connection ${connectionId} not found. Please ensure the connection exists.`);
        }

        const getScopes = (): string[] => ["https://api.powerplatform.com/.default"];

        if (connection.authenticationType === "interactive" && connection.msalAccountId) {
            await this.ensureMsalCacheOrClearTokens(connection, connectionId, `Authentication expired for connection '${connection.name}'. Please reconnect to continue.`);

            try {
                const tokenResult = await this.authManager.acquirePowerPlatformToken(connection);

                connection.powerPlatformAccessToken = tokenResult.accessToken;
                connection.powerPlatformTokenExpiry = tokenResult.expiresOn.toISOString();
                this.connectionsManager.updatePowerPlatformTokens(connection.id, {
                    accessToken: tokenResult.accessToken,
                    expiresOn: tokenResult.expiresOn,
                    scopesForPowerPlatformAPI: tokenResult.scopes,
                });

                return { connection, accessToken: tokenResult.accessToken };
            } catch (error) {
                logError("MSAL silent Power Platform token acquisition failed", error);
                throw new Error(`Authentication expired for connection '${connection.name}'. Please reconnect to continue.`);
            }
        }

        if (connection.authenticationType === "clientSecret") {
            const needsRefresh = this.connectionsManager.isPowerPlatformTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.powerPlatformTokenExpiry, 5 * 60 * 1000);

            if (needsRefresh || !connection.powerPlatformAccessToken) {
                try {
                    const scopes = getScopes();
                    const authResult = await this.authManager.authenticateClientSecret(connection, scopes, true);

                    connection.powerPlatformAccessToken = authResult.accessToken;
                    connection.powerPlatformTokenExpiry = authResult.expiresOn.toISOString();
                    this.connectionsManager.updatePowerPlatformTokens(connection.id, {
                        accessToken: authResult.accessToken,
                        expiresOn: authResult.expiresOn,
                        scopesForPowerPlatformAPI: authResult.scopes,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    logError("Client secret authentication failed", error);
                    throw new Error(`Client secret authentication failed for '${connection.name}'. Please verify your credentials.`);
                }
            }
        }

        if (connection.authenticationType === "usernamePassword") {
            if (connection.msalAccountId) {
                await this.ensureMsalCacheOrClearTokens(connection, connectionId, `Token refresh failed for '${connection.name}'. Please re-enter your credentials.`);

                try {
                    const authResult = await this.authManager.acquirePowerPlatformToken(connection);

                    this.connectionsManager.updatePowerPlatformTokens(connection.id, {
                        accessToken: authResult.accessToken,
                        expiresOn: authResult.expiresOn,
                        scopesForPowerPlatformAPI: authResult.scopes,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    logError("Username/password silent token acquisition failed", error);
                    throw new Error(`Token refresh failed for '${connection.name}'. Please re-enter your credentials.`);
                }
            }

            const needsRefresh = this.connectionsManager.isPowerPlatformTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.powerPlatformTokenExpiry, 5 * 60 * 1000);
            if (needsRefresh && connection.refreshToken) {
                try {
                    const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken, getScopes());

                    this.connectionsManager.updatePowerPlatformTokens(connection.id, {
                        accessToken: authResult.accessToken,
                        expiresOn: authResult.expiresOn,
                        scopesForPowerPlatformAPI: authResult.scopes,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch (error) {
                    logError("Username/password token refresh failed", error);
                    throw new Error(`Token refresh failed for '${connection.name}'. Please re-enter your credentials.`);
                }
            }
        }

        if (connection.authenticationType === "interactive" && !connection.msalAccountId && connection.refreshToken) {
            const needsRefresh = this.connectionsManager.isPowerPlatformTokenExpired(connectionId) || this.isTokenExpiringWithin(connection.powerPlatformTokenExpiry, 5 * 60 * 1000);

            if (needsRefresh) {
                try {
                    const authResult = await this.authManager.refreshAccessToken(connection, connection.refreshToken, getScopes());

                    this.connectionsManager.updatePowerPlatformTokens(connectionId, {
                        accessToken: authResult.accessToken,
                        expiresOn: authResult.expiresOn,
                        scopesForPowerPlatformAPI: authResult.scopes,
                    });

                    return { connection, accessToken: authResult.accessToken };
                } catch {
                    logWarn("Legacy interactive token refresh failed");
                    throw new Error(`Token refresh failed for '${connection.name}'. Please sign in again.`);
                }
            }
        }

        if (!connection.powerPlatformAccessToken) {
            throw new Error(`No access token found for '${connection.name}'. Please reconnect to the environment.`);
        }

        return { connection, accessToken: connection.powerPlatformAccessToken };
    }

    private isTokenExpiringWithin(tokenExpiry: string | undefined, milliseconds: number): boolean {
        if (!tokenExpiry) {
            return false;
        }

        const expiryDate = new Date(tokenExpiry);
        const now = new Date();
        return expiryDate.getTime() - now.getTime() < milliseconds;
    }

    private makeHttpRequest(
        url: string,
        method: PowerPlatformMethod,
        accessToken: string,
        body: unknown,
        customHeaders: Record<string, string> | undefined,
        raw: true,
    ): Promise<PowerPlatformRawResponse>;
    private makeHttpRequest(url: string, method: PowerPlatformMethod, accessToken: string, body?: unknown, customHeaders?: Record<string, string>): Promise<unknown>;
    private makeHttpRequest(url: string, method: PowerPlatformMethod, accessToken: string, body?: unknown, customHeaders?: Record<string, string>, raw = false): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const hasBody = body !== undefined && body !== null;
            const bodyData = hasBody ? JSON.stringify(body) : undefined;

            const headers: Record<string, string | number> = raw
                ? {
                      accept: "*/*",
                      "content-type": "application/json; charset=utf-8",
                      ...Object.fromEntries(Object.entries(customHeaders || {}).map(([name, value]) => [name.toLowerCase(), value])),
                      authorization: `Bearer ${accessToken}`,
                  }
                : {
                      ...(customHeaders || {}),
                      Authorization: `Bearer ${accessToken}`,
                      Accept: "application/json",
                      "Content-Type": "application/json; charset=utf-8",
                  };

            if (hasBody && bodyData) {
                headers["Content-Length"] = Buffer.byteLength(bodyData);
            }

            const options: https.RequestOptions = {
                hostname: urlObj.hostname,
                port: 443,
                path: urlObj.pathname + urlObj.search,
                method,
                headers,
                agent: this.proxyManager?.getAgentForUrl(url),
            };

            const req = https.request(options, (res) => {
                const chunks: Buffer[] = [];

                res.on("data", (chunk: Buffer) => {
                    chunks.push(chunk);
                });
                res.on("error", () => reject(new Error("Power Platform response stream failed.")));
                res.on("aborted", () => reject(new Error("Power Platform response was aborted.")));

                res.on("end", () => {
                    const bytes = Buffer.concat(chunks);
                    if (raw) {
                        if (!res.statusCode) {
                            reject(new Error("Power Platform response has no HTTP status."));
                            return;
                        }
                        const responseHeaders: Record<string, string> = {};
                        for (const [name, value] of Object.entries(res.headers)) {
                            if (value !== undefined) responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
                        }
                        resolve({ status: res.statusCode, headers: responseHeaders, body: new Uint8Array(bytes) });
                        return;
                    }
                    const data = bytes.toString("utf8");
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        if (!data.trim()) {
                            resolve({});
                            return;
                        }

                        try {
                            resolve(JSON.parse(data));
                        } catch {
                            resolve(data);
                        }
                        return;
                    }

                    let errorMessage = `HTTP ${res.statusCode}`;
                    try {
                        const errorData = JSON.parse(data) as PowerPlatformError;
                        if (errorData.error?.message) {
                            errorMessage = errorData.error.code ? `${errorData.error.code}: ${errorData.error.message}` : errorData.error.message;
                        } else if (errorData.message) {
                            errorMessage = errorData.message;
                        }
                    } catch {
                        if (data) {
                            errorMessage = `${errorMessage}: ${data}`;
                        }
                    }

                    reject(new Error(errorMessage));
                });
            });

            req.on("error", (error) => {
                reject(new Error(raw ? "Power Platform network request failed." : `Request failed: ${error.message}`));
            });

            if (bodyData) {
                req.write(bodyData);
            }

            req.end();
        });
    }
}
