import * as https from "https";
import { logError, logWarn } from "../../common/logger";
import { Connection } from "../../common/types";
import { AuthManager } from "./authManager";
import { ConnectionsManager } from "./connectionsManager";

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

    constructor(connectionsManager: ConnectionsManager, authManager: AuthManager) {
        this.connectionsManager = connectionsManager;
        this.authManager = authManager;
    }

    async request(connectionId: string, category: PowerPlatformCategory, method: string, relativePath = "", body?: unknown, customHeaders?: Record<string, string>): Promise<unknown> {
        const normalizedMethod = method.toUpperCase() as PowerPlatformMethod;

        if (!ALLOWED_METHODS.has(normalizedMethod)) {
            throw new Error(`Invalid Power Platform method '${method}'. Allowed methods: GET, POST, PUT, PATCH, DELETE.`);
        }

        if (!(category in POWER_PLATFORM_CATEGORY_PATHS)) {
            throw new Error(`Invalid Power Platform category '${category}'.`);
        }

        const { accessToken } = await this.getConnectionWithToken(connectionId);
        const url = this.buildApiUrl(category, relativePath);

        return await this.makeHttpRequest(url, normalizedMethod, accessToken, body, customHeaders);
    }

    private buildApiUrl(category: PowerPlatformCategory, relativePath: string): string {
        const baseUrl = `https://api.powerplatform.com/${POWER_PLATFORM_CATEGORY_PATHS[category]}`;
        const cleanPath = relativePath.trim();

        if (!cleanPath) {
            return baseUrl;
        }

        if (cleanPath.startsWith("?")) {
            return `${baseUrl}${cleanPath}`;
        }

        return `${baseUrl}/${cleanPath.replace(/^\/+/, "")}`;
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

    private makeHttpRequest(url: string, method: PowerPlatformMethod, accessToken: string, body?: unknown, customHeaders?: Record<string, string>): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const hasBody = body !== undefined && body !== null;
            const bodyData = hasBody ? JSON.stringify(body) : undefined;

            const headers: Record<string, string | number> = {
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
            };

            const req = https.request(options, (res) => {
                let data = "";

                res.on("data", (chunk) => {
                    data += chunk;
                });

                res.on("end", () => {
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
                reject(new Error(`Request failed: ${error.message}`));
            });

            if (bodyData) {
                req.write(bodyData);
            }

            req.end();
        });
    }
}
